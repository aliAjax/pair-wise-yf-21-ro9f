/**
 * 页面操作层：把用户操作翻译为档案状态变更（纯函数，便于测试）。
 * 规则落点：
 *  - 改锚点或格位 → 选点版本 +1，推算结果与负责人确认一并失效（留痕），已完成区域不受影响；
 *  - 推算不通过 → 区域转待复核，补线入口关闭；
 *  - 负责人确认替代方案并填写原因 → 补线入口开放；
 *  - 完工 → 区域锁定，照旧保留。
 */

import { runProjection } from "./projection";
import {
  ArchiveState,
  Cell,
  HistoryEvent,
  Region,
  ReviewDecision,
  sameCell,
} from "./types";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function findRegion(
  state: ArchiveState,
  regionId: string
): Region | undefined {
  for (const c of state.carpets) {
    const r = c.regions.find((r) => r.id === regionId);
    if (r) return r;
  }
  return undefined;
}

function updateRegion(
  state: ArchiveState,
  regionId: string,
  fn: (region: Region) => Region
): ArchiveState {
  return {
    ...state,
    carpets: state.carpets.map((c) => ({
      ...c,
      regions: c.regions.map((r) => (r.id === regionId ? fn(r) : r)),
    })),
  };
}

export function selectCarpet(state: ArchiveState, carpetId: string): ArchiveState {
  const carpet = state.carpets.find((c) => c.id === carpetId);
  if (!carpet) return state;
  return {
    ...state,
    selectedCarpetId: carpetId,
    selectedRegionId: carpet.regions[0]?.id ?? state.selectedRegionId,
  };
}

export function selectRegion(state: ArchiveState, regionId: string): ArchiveState {
  return { ...state, selectedRegionId: regionId };
}

export type PickMode = "anchor" | "landing";

/**
 * 在格网上点选/取消锚点或落格。
 * 已完工区域锁定；任何改动都会使既有推算与确认失效。
 */
export function toggleCell(
  state: ArchiveState,
  regionId: string,
  cell: Cell,
  mode: PickMode
): ArchiveState {
  const region = findRegion(state, regionId);
  if (!region || region.completedAt) return state;

  const list = mode === "anchor" ? region.anchors : region.landings;
  const exists = list.some((c) => sameCell(c, cell));
  if (!exists && list.length >= 3) return state; // 各限三个，需先取消再选

  const nextList = exists
    ? list.filter((c) => !sameCell(c, cell))
    : [...list, cell];

  return updateRegion(state, regionId, (r) => {
    const hadProjection = r.projection !== null;
    const hadReview = r.review !== null;
    const invalidated: HistoryEvent[] = [];
    const at = new Date().toISOString();
    if (hadProjection) {
      invalidated.push({
        id: nextId("ev"),
        kind: "invalidated",
        at,
        reason: "改动了锚点或落格，原推算结果失效",
        version: r.version,
      });
    }
    if (hadReview) {
      invalidated.push({
        id: nextId("ev"),
        kind: "invalidated",
        at,
        reason: "改动了锚点或落格，负责人确认失效，需重新复核",
        version: r.version,
      });
    }
    return {
      ...r,
      anchors: mode === "anchor" ? nextList : r.anchors,
      landings: mode === "landing" ? nextList : r.landings,
      version: r.version + 1,
      projection: null,
      review: null,
      reviewVersion: null,
      history: [...r.history, ...invalidated],
    };
  });
}

/** 清空当前区域的锚点与落格（同样视为改动，会使确认失效） */
export function resetSelection(state: ArchiveState, regionId: string): ArchiveState {
  const region = findRegion(state, regionId);
  if (!region || region.completedAt) return state;
  if (region.anchors.length === 0 && region.landings.length === 0) return state;
  return updateRegion(state, regionId, (r) => ({
    ...r,
    anchors: [],
    landings: [],
    version: r.version + 1,
    projection: null,
    review: null,
    reviewVersion: null,
    history: r.projection
      ? [
          ...r.history,
          {
            id: nextId("ev"),
            kind: "invalidated",
            at: new Date().toISOString(),
            reason: "清空选点，原推算与确认失效",
            version: r.version,
          },
        ]
      : r.history,
  }));
}

/** 执行对称推花：不通过则区域转待复核，补线入口随之关闭 */
export function runProjectionFor(
  state: ArchiveState,
  regionId: string
): ArchiveState {
  const region = findRegion(state, regionId);
  if (!region || region.completedAt) return state;
  return updateRegion(state, regionId, (r) => {
    const result = runProjection({
      anchors: r.anchors,
      landings: r.landings,
      motif: r.motif,
      damagedExisting: r.damagedExisting,
      intactSide: r.intactSide,
      gridRows: r.gridRows,
      gridCols: r.gridCols,
    });
    return {
      ...r,
      projection: result,
      history: [
        ...r.history,
        {
          id: nextId("ev"),
          kind: "projection",
          at: result.at,
          version: r.version,
          ok: result.ok,
          issues: result.issues,
          targets: result.targets,
        },
      ],
    };
  });
}

/** 负责人确认替代方案（必须填写原因），补线入口开放 */
export function approveReview(
  state: ArchiveState,
  regionId: string,
  plan: string,
  reason: string,
  reviewer: string
): ArchiveState {
  const region = findRegion(state, regionId);
  if (!region || region.completedAt) return state;
  if (!plan.trim() || !reason.trim() || !reviewer.trim()) return state;
  return updateRegion(state, regionId, (r) => {
    const decision: ReviewDecision = {
      plan: plan.trim(),
      reason: reason.trim(),
      reviewer: reviewer.trim(),
      at: new Date().toISOString(),
    };
    return {
      ...r,
      review: decision,
      reviewVersion: r.version,
      history: [
        ...r.history,
        {
          id: nextId("ev"),
          kind: "review",
          at: decision.at,
          version: r.version,
          decision,
        },
      ],
    };
  });
}

/** 补线施工登记：仅在入口开放时可用，完工后区域锁定、照旧保留 */
export function markDone(
  state: ArchiveState,
  regionId: string,
  threadColor: string
): ArchiveState {
  const region = findRegion(state, regionId);
  if (!region || region.completedAt || !threadColor) return state;
  return updateRegion(state, regionId, (r) => {
    const at = new Date().toISOString();
    return {
      ...r,
      completedAt: at,
      threadColor,
      history: [
        ...r.history,
        {
          id: nextId("ev"),
          kind: "done",
          at,
          version: r.version,
          threadColor,
        },
      ],
    };
  });
}
