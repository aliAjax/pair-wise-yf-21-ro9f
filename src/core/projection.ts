/**
 * 推算层（纯函数，不依赖 React / 浏览器存储）：
 * 由完整侧三个锚点与破损侧三个落格解出对称仿射变换，
 * 把完整侧其余纹格映射为破损侧落点，并做三类校验：
 *   - missing-ref 缺参照：锚点或落格不足三个
 *   - mismatch    三组对不上：三组格距不一致 / 锚点共线 / 落点不在格上或格外
 *   - overlap     目标格重合：推算落点互相重合
 */

import {
  Cell,
  PairMetric,
  ProjectionIssue,
  ProjectionResult,
  cellKey,
} from "./types";

export interface ProjectionInput {
  anchors: Cell[];
  landings: Cell[];
  motif: Cell[];
  damagedExisting: Cell[];
  intactSide: "left" | "right";
  gridRows: number;
  gridCols: number;
}

const dist2 = (a: Cell, b: Cell): number =>
  (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

export function formatDist(d2: number): string {
  const d = Math.sqrt(d2);
  return Number.isInteger(d) ? `${d}` : d.toFixed(2);
}

function pairMetrics(anchors: Cell[], landings: Cell[]): PairMetric[] {
  const pairs: Array<[number, number, string]> = [
    [0, 1, "1–2"],
    [0, 2, "1–3"],
    [1, 2, "2–3"],
  ];
  return pairs.map(([i, j, tag]) => {
    const a2 = dist2(anchors[i], anchors[j]);
    const l2 = dist2(landings[i], landings[j]);
    return {
      label: `锚${tag} ↔ 落${tag}`,
      anchorDist: Math.sqrt(a2),
      landingDist: Math.sqrt(l2),
      equal: a2 === l2,
    };
  });
}

/** 由三组对应点解仿射矩阵；锚点共线（退化）时返回 null */
export function solveAffine(anchors: Cell[], landings: Cell[]): number[] | null {
  const [p1, p2, p3] = anchors;
  const [q1, q2, q3] = landings;
  const det =
    p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y);
  if (det === 0) return null;
  const solveFor = (r1: number, r2: number, r3: number): [number, number, number] => {
    const a =
      (r1 * (p2.y - p3.y) + r2 * (p3.y - p1.y) + r3 * (p1.y - p2.y)) / det;
    const b =
      (p1.x * (r2 - r3) + p2.x * (r3 - r1) + p3.x * (r1 - r2)) / det;
    const e =
      (p1.x * (p2.y * r3 - p3.y * r2) +
        p2.x * (p3.y * r1 - p1.y * r3) +
        p3.x * (p1.y * r2 - p2.y * r1)) /
      det;
    return [a, b, e];
  };
  const [a, b, e] = solveFor(q1.x, q2.x, q3.x);
  const [c, d, f] = solveFor(q1.y, q2.y, q3.y);
  return [a, b, c, d, e, f];
}

export function applyAffine(m: number[], p: Cell): { x: number; y: number } {
  return {
    x: m[0] * p.x + m[1] * p.y + m[4],
    y: m[2] * p.x + m[3] * p.y + m[5],
  };
}

/** 以对称轴 x=0 做镜像的参照落格（用于示例与对照展示） */
export function mirrorCell(c: Cell): Cell {
  return { x: -c.x, y: c.y };
}

export function sideOf(c: Cell): "intact-left" | "intact-right" | "axis" {
  if (c.x < 0) return "intact-left";
  if (c.x > 0) return "intact-right";
  return "axis";
}

export function runProjection(input: ProjectionInput): ProjectionResult {
  const { anchors, landings, motif, damagedExisting, intactSide, gridRows, gridCols } =
    input;
  const issues: ProjectionIssue[] = [];
  const at = new Date().toISOString();

  const anchorKeys = new Set(anchors.map(cellKey));
  const remaining = motif.filter((m) => !anchorKeys.has(cellKey(m)));

  // 1) 缺参照
  if (anchors.length < 3 || landings.length < 3) {
    const missing: string[] = [];
    if (anchors.length < 3) missing.push(`锚点 ${anchors.length}/3`);
    if (landings.length < 3) missing.push(`落格 ${landings.length}/3`);
    issues.push({
      code: "missing-ref",
      detail: `参照不足：${missing.join("，")}。需先在完整侧选定 3 个锚点，再在破损侧点出 3 个对应落格。`,
    });
    return { ok: false, issues, metrics: [], remaining, targets: [], matrix: [], at };
  }

  // 2) 选点自身查重
  const dup = (list: Cell[]): string | null => {
    const seen = new Set<string>();
    for (const c of list) {
      const k = cellKey(c);
      if (seen.has(k)) return k;
      seen.add(k);
    }
    return null;
  };
  const dupAnchor = dup(anchors);
  if (dupAnchor) {
    issues.push({
      code: "mismatch",
      detail: `锚点重复：格位 (${dupAnchor}) 被选了两次，三个锚点必须互不相同。`,
    });
  }
  const dupLanding = dup(landings);
  if (dupLanding) {
    issues.push({
      code: "overlap",
      detail: `落格重合：格位 (${dupLanding}) 被点了两次，三个落格必须互不相同。`,
    });
  }

  // 3) 落格侧校验：锚点须在完整侧，落格须在破损侧
  const anchorOk = anchors.every((c) =>
    intactSide === "left" ? c.x < 0 : c.x > 0
  );
  if (!anchorOk) {
    issues.push({
      code: "mismatch",
      detail: "锚点未落在完整侧，请在对称轴的完整一侧选点。",
    });
  }
  const half = (gridCols - 1) / 2;
  const landingOk = landings.every(
    (c) =>
      (intactSide === "left" ? c.x > 0 : c.x < 0) &&
      Math.abs(c.x) <= half &&
      c.y >= 0 &&
      c.y < gridRows
  );
  if (!landingOk) {
    issues.push({
      code: "mismatch",
      detail: "落格超出破损侧范围，请在破损一侧的格网内点选。",
    });
  }

  // 4) 三组格距对照
  const metrics = pairMetrics(anchors, landings);
  for (const m of metrics) {
    if (!m.equal) {
      issues.push({
        code: "mismatch",
        detail: `三组对不上：${m.label} 格距不一致（锚点侧 ${formatDist(
          Math.round(m.anchorDist * m.anchorDist)
        )} 格，落格侧 ${formatDist(
          Math.round(m.landingDist * m.landingDist)
        )} 格），对称关系不成立。`,
      });
    }
  }

  // 5) 解仿射并推算其余落点
  let matrix: number[] = [];
  let targets: Cell[] = [];
  const affine = solveAffine(anchors, landings);
  if (!affine) {
    issues.push({
      code: "mismatch",
      detail: "三个锚点共线，无法确定唯一的对称变换，请重新选取。",
    });
  } else {
    matrix = affine;
    const rawTargets = remaining.map((m) => applyAffine(affine, m));
    const offGrid = rawTargets.filter(
      (t) => !Number.isInteger(t.x) || !Number.isInteger(t.y)
    );
    if (offGrid.length > 0) {
      issues.push({
        code: "mismatch",
        detail: `推算落点偏离格位（${offGrid.length} 处不在整格上），三组对应关系可能有误。`,
      });
    } else {
      targets = rawTargets.map((t) => ({ x: t.x, y: t.y }));
      const outOfSide = targets.filter(
        (t) =>
          !(intactSide === "left" ? t.x > 0 : t.x < 0) ||
          Math.abs(t.x) > half ||
          t.y < 0 ||
          t.y >= gridRows
      );
      if (outOfSide.length > 0) {
        issues.push({
          code: "mismatch",
          detail: `${outOfSide.length} 个推算落点落在破损侧格网之外，请核对锚点与落格。`,
        });
      }
      const targetKeys = new Set<string>();
      const dupTargets = new Set<string>();
      for (const t of targets) {
        const k = cellKey(t);
        if (targetKeys.has(k)) dupTargets.add(k);
        targetKeys.add(k);
      }
      if (dupTargets.size > 0) {
        issues.push({
          code: "overlap",
          detail: `目标格重合：格位 ${[...dupTargets]
            .map((k) => `(${k})`)
            .join("、")} 被推算为多个纹格的共同落点。`,
        });
      }
      const existingKeys = new Set(damagedExisting.map(cellKey));
      const clash = targets.filter((t) => existingKeys.has(cellKey(t)));
      if (clash.length > 0) {
        issues.push({
          code: "overlap",
          detail: `目标格重合：格位 ${clash
            .map((t) => `(${cellKey(t)})`)
            .join("、")} 与破损侧已有纹格重叠。`,
        });
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    metrics,
    remaining,
    targets,
    matrix,
    at,
  };
}
