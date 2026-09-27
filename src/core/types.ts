/**
 * 领域类型：对称推花（边缘花边续纹）档案。
 * 该文件只做类型定义，被推算层 / 存档层 / 页面操作层共同引用。
 */

/** 格位坐标（以对称轴为 x=0，左负右正，行号 y 自上而下） */
export interface Cell {
  x: number;
  y: number;
}

export type Side = "intact" | "damaged";

/** 问题编码：三组对不上 / 目标格重合 / 缺参照 */
export type IssueCode = "mismatch" | "overlap" | "missing-ref";

export interface ProjectionIssue {
  code: IssueCode;
  detail: string;
}

/** 三组锚点—落点各自的格距对照 */
export interface PairMetric {
  label: string;
  anchorDist: number;
  landingDist: number;
  equal: boolean;
}

export interface ProjectionResult {
  ok: boolean;
  issues: ProjectionIssue[];
  /** 三组对照明细（用于页面展示格距比对） */
  metrics: PairMetric[];
  /** 完整侧其余纹格 */
  remaining: Cell[];
  /** 系统推算出的破损侧其余落点 */
  targets: Cell[];
  /** 仿射矩阵 [a,b,c,d,e,f]：x'=ax+by+e, y'=cx+dy+f */
  matrix: number[];
  at: string;
}

export type RegionStatus =
  | "editing" // 选点中
  | "pending" // 待复核（补线入口关闭）
  | "projected" // 推算通过
  | "approved" // 替代方案已确认（补线入口开放）
  | "done"; // 已完工（照旧保留，锁定）

export interface ReviewDecision {
  plan: string;
  reason: string;
  reviewer: string;
  at: string;
}

/** 档案时间线事件：复核前后全程留痕 */
export type HistoryEvent =
  | {
      id: string;
      kind: "projection";
      at: string;
      version: number;
      ok: boolean;
      issues: ProjectionIssue[];
      targets: Cell[];
    }
  | {
      id: string;
      kind: "invalidated";
      at: string;
      reason: string;
      version: number;
    }
  | {
      id: string;
      kind: "review";
      at: string;
      version: number;
      decision: ReviewDecision;
    }
  | {
      id: string;
      kind: "done";
      at: string;
      version: number;
      threadColor: string;
    };

export interface Region {
  id: string;
  name: string;
  /** 完整侧所在方位：决定对称轴与落格侧 */
  intactSide: "left" | "right";
  gridRows: number;
  gridCols: number;
  /** 完整侧纹样格（只读参照） */
  motif: Cell[];
  /** 破损侧已有纹格（保留部分） */
  damagedExisting: Cell[];
  /** 完整侧三个锚点（须落在纹格上） */
  anchors: Cell[];
  /** 破损侧三个对应落格 */
  landings: Cell[];
  /** 选点版本：改锚点或格位即 +1，并使确认失效 */
  version: number;
  projection: ProjectionResult | null;
  review: ReviewDecision | null;
  /** 确认对应的选点版本；与当前 version 不一致即失效 */
  reviewVersion: number | null;
  completedAt: string | null;
  threadColor: string | null;
  history: HistoryEvent[];
}

export interface Carpet {
  id: string;
  origin: string;
  era: string;
  knotDensity: string;
  material: string;
  dyeType: string;
  damage: string;
  note: string;
  regions: Region[];
}

export interface ArchiveState {
  carpets: Carpet[];
  selectedCarpetId: string;
  selectedRegionId: string;
}

export const STATUS_LABEL: Record<RegionStatus, string> = {
  editing: "选点中",
  pending: "待复核",
  projected: "推算通过",
  approved: "已确认方案",
  done: "已完工",
};

export const ISSUE_LABEL: Record<IssueCode, string> = {
  "missing-ref": "缺参照",
  mismatch: "三组对不上",
  overlap: "目标格重合",
};

/** 由字段推导区域状态（单一出口，页面与存档共用） */
export function deriveStatus(region: Region): RegionStatus {
  if (region.completedAt) return "done";
  const reviewValid =
    region.review !== null && region.reviewVersion === region.version;
  if (reviewValid) return "approved";
  if (region.projection && region.projection.ok) return "projected";
  if (region.projection && !region.projection.ok) return "pending";
  return "editing";
}

/** 补线入口是否开放：推算通过，或替代方案确认且未失效 */
export function isEntryOpen(region: Region): boolean {
  const s = deriveStatus(region);
  return s === "projected" || s === "approved";
}

export function cellKey(c: Cell): string {
  return `${c.x},${c.y}`;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}
