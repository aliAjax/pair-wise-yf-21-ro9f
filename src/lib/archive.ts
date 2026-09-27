// ============================================================
// 存档 · 推花区状态与复核记录持久化
// 只负责读写 localStorage，不做推算、不碰页面。
// ============================================================

import { infer, REGION_SPECS, type GridCell, type InferenceResult } from "./inference";

export type RegionStatus = "editing" | "inferred" | "pending_review" | "approved" | "completed";

export const STATUS_LABEL: Record<RegionStatus, string> = {
  editing: "推算中",
  inferred: "推算通过 · 可施工",
  pending_review: "待复核 · 补线入口关闭",
  approved: "已确认替代方案 · 可施工",
  completed: "已完成 · 照旧保留",
};

export interface Confirmation {
  plan: string;
  reason: string;
  confirmer: string;
  at: string;
}

export type TrailType = "init" | "infer_ok" | "infer_fail" | "confirm" | "invalidate" | "complete" | "reset";

export interface TrailEvent {
  at: string;
  type: TrailType;
  detail: string;
}

/** 进入待复核时的推算快照（复核前），连同当时的锚点与落格一并留存 */
export interface ReviewSnapshot {
  result: InferenceResult;
  anchors: GridCell[];
  targets: GridCell[];
}

export interface RegionState {
  regionId: string;
  anchors: GridCell[];
  targets: GridCell[];
  status: RegionStatus;
  /** 最近一次推算结果 */
  result: InferenceResult | null;
  /** 复核前快照 */
  reviewSnapshot: ReviewSnapshot | null;
  /** 当前确认（复核后）；可能已失效 */
  confirmation: Confirmation | null;
  confirmationInvalidated: boolean;
  threadColor: string | null;
  completedAt: string | null;
  trail: TrailEvent[];
}

export interface Archive {
  version: 1;
  updatedAt: string;
  regions: Record<string, RegionState>;
}

const KEY = "hxyfront-62009:symmetry-archive:v1";

export const nowIso = () => new Date().toISOString();

function blankState(regionId: string, initDetail: string, at: string): RegionState {
  return {
    regionId,
    anchors: [],
    targets: [],
    status: "editing",
    result: null,
    reviewSnapshot: null,
    confirmation: null,
    confirmationInvalidated: false,
    threadColor: null,
    completedAt: null,
    trail: [{ at, type: "init", detail: initDetail }],
  };
}

/** 初始档案：一个待推算、一个经复核已确认替代方案、一个已完成 */
export function seedArchive(): Archive {
  const regions: Record<string, RegionState> = {};

  regions["R-CAR092-E3"] = blankState(
    "R-CAR092-E3",
    "建档：东缘花边第 3 朵续纹，破损侧有 2 格旧针脚占用，待选锚点",
    "2026-09-26T09:12:00+08:00",
  );

  const spec2 = REGION_SPECS.find((r) => r.id === "R-CAR117-N1")!;
  const anchors2: GridCell[] = [
    { row: 1, col: 2 },
    { row: 3, col: 1 },
    { row: 5, col: 3 },
  ];
  const targets2: GridCell[] = [{ row: 1, col: 9 }];
  const result2: InferenceResult = {
    ...infer(spec2, { anchors: anchors2, targets: targets2 }),
    at: "2026-09-26T11:05:00+08:00",
  };
  regions["R-CAR117-N1"] = {
    ...blankState(
      "R-CAR117-N1",
      "建档：北缘花边连续卷草，破损侧有旧补线针脚 1 格",
      "2026-09-26T10:58:00+08:00",
    ),
    anchors: anchors2,
    targets: targets2,
    status: "approved",
    result: result2,
    reviewSnapshot: { result: result2, anchors: anchors2, targets: targets2 },
    confirmation: {
      plan: "第 2 组落点让开旧针脚，东移一格后按卷草走向手工补弧线",
      reason: "推算落点与旧补线针脚重合，直接下针会压住旧线，造成二次损伤",
      confirmer: "热合曼·艾力",
      at: "2026-09-26T15:42:00+08:00",
    },
    trail: [
      {
        at: "2026-09-26T10:58:00+08:00",
        type: "init",
        detail: "建档：北缘花边连续卷草，破损侧有旧补线针脚 1 格",
      },
      {
        at: "2026-09-26T11:05:00+08:00",
        type: "infer_fail",
        detail: "推算未通过（目标格重合：第 2 组落点与旧针脚占用格重合）→ 转待复核，补线入口关闭",
      },
      {
        at: "2026-09-26T15:42:00+08:00",
        type: "confirm",
        detail: "负责人热合曼·艾力确认替代方案：第 2 组落点让开旧针脚，东移一格后按卷草走向手工补弧线（原因：推算落点与旧补线针脚重合，直接下针会压住旧线，造成二次损伤）",
      },
    ],
  };

  const spec3 = REGION_SPECS.find((r) => r.id === "R-CAR138-S2")!;
  const anchors3: GridCell[] = [
    { row: 2, col: 2 },
    { row: 4, col: 1 },
    { row: 6, col: 3 },
  ];
  const targets3: GridCell[] = [{ row: 2, col: 9 }];
  const result3: InferenceResult = {
    ...infer(spec3, { anchors: anchors3, targets: targets3 }),
    at: "2026-09-25T16:47:00+08:00",
  };
  regions["R-CAR138-S2"] = {
    ...blankState("R-CAR138-S2", "建档：南缘花边如意云头", "2026-09-25T16:30:00+08:00"),
    anchors: anchors3,
    targets: targets3,
    status: "completed",
    result: result3,
    threadColor: "靛蓝 B-12",
    completedAt: "2026-09-25T17:03:00+08:00",
    trail: [
      { at: "2026-09-25T16:30:00+08:00", type: "init", detail: "建档：南缘花边如意云头" },
      {
        at: "2026-09-25T16:47:00+08:00",
        type: "infer_ok",
        detail: "推算通过：三组落点 (3,10) (5,11) (7,9)，补线入口开放",
      },
      {
        at: "2026-09-25T17:03:00+08:00",
        type: "complete",
        detail: "补线完成登记（色号 靛蓝 B-12），该区照旧保留并锁定",
      },
    ],
  };

  return { version: 1, updatedAt: "2026-09-26T15:42:00+08:00", regions };
}

export function loadArchive(): Archive {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Archive;
      if (parsed && parsed.version === 1 && parsed.regions) {
        // 补齐后续新增的推花区
        for (const spec of REGION_SPECS) {
          if (!parsed.regions[spec.id]) {
            parsed.regions[spec.id] = blankState(spec.id, `建档：${spec.title}`, nowIso());
          }
        }
        return parsed;
      }
    }
  } catch {
    // 存档损坏时回退到初始档案
  }
  return seedArchive();
}

export function saveArchive(a: Archive) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // 存储不可用时静默失败，页面状态仍保留在内存中
  }
}

export function resetArchive(): Archive {
  const fresh = seedArchive();
  saveArchive(fresh);
  return fresh;
}
