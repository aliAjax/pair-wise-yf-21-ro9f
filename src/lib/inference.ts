// ============================================================
// 推算 · 对称推花计算模块
// 只负责几何推算与校验，不接触页面操作与存档。
// ============================================================

export interface GridCell {
  row: number;
  col: number;
}

export interface RegionSpec {
  id: string;
  rugId: string;
  title: string;
  rows: number;
  cols: number;
  /** 对称轴所在列，可为 x.5（表示两列之间） */
  axisCol: number;
  intactSide: "left" | "right";
  /** 破损侧已被旧针脚占用的格（不可再落点） */
  occupied: GridCell[];
}

export type FailureCode = "MISSING_REFERENCE" | "TARGET_OVERLAP" | "GROUP_MISMATCH";

export const FAILURE_LABEL: Record<FailureCode, string> = {
  MISSING_REFERENCE: "缺参照",
  TARGET_OVERLAP: "目标格重合",
  GROUP_MISMATCH: "三组对不上",
};

export interface InferenceInput {
  /** 完整侧锚点，需恰好 3 个 */
  anchors: GridCell[];
  /** 破损侧落格：第 1 个对应锚点①（必填），其余可作复核 */
  targets: GridCell[];
}

export interface CheckEntry {
  ok: boolean;
  text: string;
}

export interface InferenceResult {
  ok: boolean;
  failures: FailureCode[];
  /** 三个锚点各自的推算落点（缺参照时为空） */
  landings: GridCell[];
  checks: CheckEntry[];
  /** 由锚点①与所点落格反推的对称轴位置 */
  impliedAxis: number | null;
  rowShift: number;
  at?: string;
}

export const sameCell = (a: GridCell, b: GridCell) => a.row === b.row && a.col === b.col;

export function inBounds(spec: RegionSpec, c: GridCell) {
  return c.row >= 0 && c.row < spec.rows && c.col >= 0 && c.col < spec.cols;
}

export function isIntactCell(spec: RegionSpec, c: GridCell) {
  if (!inBounds(spec, c) || c.col === spec.axisCol) return false;
  return spec.intactSide === "left" ? c.col < spec.axisCol : c.col > spec.axisCol;
}

export function isDamagedCell(spec: RegionSpec, c: GridCell) {
  return inBounds(spec, c) && !isIntactCell(spec, c) && c.col !== spec.axisCol;
}

export function mirrorCol(spec: RegionSpec, col: number) {
  return Math.round(2 * spec.axisCol - col);
}

const fmtAxis = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));
const human = (c: GridCell) => `(${c.row + 1},${c.col + 1})`;

/** 对称推花：完整侧 3 个锚点 + 破损侧落格 → 推算其余落点并校验 */
export function infer(spec: RegionSpec, input: InferenceInput): InferenceResult {
  const checks: CheckEntry[] = [];
  const failures: FailureCode[] = [];
  const anchors = input.anchors;
  const targets = input.targets;

  // —— 缺参照 ——
  const missing: string[] = [];
  if (anchors.length !== 3) missing.push(`锚点需 3 个，当前 ${anchors.length} 个`);
  if (targets.length < 1) missing.push("破损侧落格至少 1 个，当前 0 个");
  const badAnchor = anchors.find((a) => !isIntactCell(spec, a));
  if (badAnchor) missing.push(`锚点 ${human(badAnchor)} 不在完整侧`);
  const badTarget = targets.find((t) => !isDamagedCell(spec, t));
  if (badTarget) missing.push(`落格 ${human(badTarget)} 不在破损侧`);
  if (missing.length > 0) {
    return {
      ok: false,
      failures: ["MISSING_REFERENCE"],
      landings: [],
      checks: missing.map((m) => ({ ok: false, text: `缺参照：${m}` })),
      impliedAxis: null,
      rowShift: 0,
    };
  }
  checks.push({ ok: true, text: "参照齐全：完整侧锚点 3 个，破损侧落格已点" });

  const impliedAxis = (anchors[0].col + targets[0].col) / 2;
  const rowShift = targets[0].row - anchors[0].row;
  const landings = anchors.map((a) => ({ row: a.row + rowShift, col: mirrorCol(spec, a.col) }));

  // —— 三组对不上 ——
  if (Math.abs(impliedAxis - spec.axisCol) > 1e-6) {
    failures.push("GROUP_MISMATCH");
    checks.push({
      ok: false,
      text: `三组对不上：所点落格推得对称轴在第 ${fmtAxis(impliedAxis)} 列，与档案轴第 ${fmtAxis(spec.axisCol)} 列不符`,
    });
  } else {
    checks.push({ ok: true, text: `对称轴一致：第 ${fmtAxis(spec.axisCol)} 列，行偏移 ${rowShift} 格` });
  }
  landings.forEach((L, i) => {
    if (!inBounds(spec, L)) {
      failures.push("GROUP_MISMATCH");
      checks.push({ ok: false, text: `三组对不上：第 ${i + 1} 组落点 ${human(L)} 超出图幅` });
    } else if (!isDamagedCell(spec, L)) {
      failures.push("GROUP_MISMATCH");
      checks.push({ ok: false, text: `三组对不上：第 ${i + 1} 组落点 ${human(L)} 不在破损侧` });
    }
  });
  targets.forEach((t, i) => {
    const L = landings[i];
    if (L && !sameCell(t, L)) {
      failures.push("GROUP_MISMATCH");
      checks.push({
        ok: false,
        text: `三组对不上：第 ${i + 1} 组所点落格 ${human(t)} 与推算落点 ${human(L)} 不一致`,
      });
    }
  });

  // —— 目标格重合 ——
  // 注意：所点落格①与第 1 组推算落点必然相同（同组对应），只查组内重复与跨组重合。
  let dupText: string | null = null;
  for (let i = 0; i < targets.length && !dupText; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      if (sameCell(targets[i], targets[j])) {
        dupText = "所点落格彼此重合";
        break;
      }
    }
  }
  for (let i = 0; i < landings.length && !dupText; i++) {
    for (let j = i + 1; j < landings.length; j++) {
      if (sameCell(landings[i], landings[j])) {
        dupText = "两组推算落点落在同一格";
        break;
      }
    }
  }
  targets.forEach((t, i) => {
    landings.forEach((L, j) => {
      if (i !== j && sameCell(t, L)) dupText = `所点第 ${i + 1} 个落格与第 ${j + 1} 组推算落点重合`;
    });
  });
  if (dupText) {
    failures.push("TARGET_OVERLAP");
    checks.push({ ok: false, text: `目标格重合：${dupText}` });
  }
  landings.forEach((L, i) => {
    if (spec.occupied.some((o) => sameCell(o, L))) {
      failures.push("TARGET_OVERLAP");
      checks.push({ ok: false, text: `目标格重合：第 ${i + 1} 组落点 ${human(L)} 与旧针脚占用格重合` });
    }
  });
  targets.forEach((t) => {
    if (spec.occupied.some((o) => sameCell(o, t))) {
      failures.push("TARGET_OVERLAP");
      checks.push({ ok: false, text: `目标格重合：所点落格 ${human(t)} 是旧针脚占用格` });
    }
  });

  const uniqFailures = [...new Set(failures)];
  if (uniqFailures.length === 0) {
    checks.push({ ok: true, text: "校验通过：三组落点互不重合、均在破损侧空格内" });
  }
  return { ok: uniqFailures.length === 0, failures: uniqFailures, landings, checks, impliedAxis, rowShift };
}

// —— 推花区档案几何（各破损缘区的图幅与对称轴） ——
export const REGION_SPECS: RegionSpec[] = [
  {
    id: "R-CAR092-E3",
    rugId: "CAR-092",
    title: "东缘花边 · 第 3 朵续纹",
    rows: 9,
    cols: 13,
    axisCol: 6.5,
    intactSide: "left",
    occupied: [
      { row: 2, col: 9 },
      { row: 6, col: 11 },
    ],
  },
  {
    id: "R-CAR117-N1",
    rugId: "CAR-117",
    title: "北缘花边 · 连续卷草",
    rows: 8,
    cols: 12,
    axisCol: 5.5,
    intactSide: "left",
    occupied: [{ row: 3, col: 10 }],
  },
  {
    id: "R-CAR138-S2",
    rugId: "CAR-138",
    title: "南缘花边 · 如意云头",
    rows: 9,
    cols: 12,
    axisCol: 5.5,
    intactSide: "left",
    occupied: [],
  },
];
