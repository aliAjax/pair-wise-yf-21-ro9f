/**
 * 示例档案：三张地毯、三个花边续纹区，覆盖
 * 选点中 / 待复核（三组对不上）/ 已确认方案 三种状态。
 * 推算结果一律经由推算层 runProjection 得出，保证档案与算法一致。
 */

import { runProjection, mirrorCell } from "./projection";
import { Carpet, Cell, Region } from "./types";

const ROWS = 7;
const COLS = 11;

/** 完整侧在左的纹样（锚点 + 其余纹格） */
const MOTIF_LEFT_ANCHORS: Cell[] = [
  { x: -5, y: 2 },
  { x: -2, y: 2 },
  { x: -5, y: 5 },
];
const MOTIF_LEFT_REST: Cell[] = [
  { x: -4, y: 1 },
  { x: -3, y: 1 },
  { x: -2, y: 3 },
  { x: -4, y: 3 },
  { x: -3, y: 4 },
  { x: -4, y: 5 },
];

function baseRegion(
  id: string,
  name: string,
  intactSide: "left" | "right",
  motif: Cell[],
  anchors: Cell[],
  landings: Cell[]
): Region {
  return {
    id,
    name,
    intactSide,
    gridRows: ROWS,
    gridCols: COLS,
    motif,
    damagedExisting: [],
    anchors,
    landings,
    version: 1,
    projection: null,
    review: null,
    reviewVersion: null,
    completedAt: null,
    threadColor: null,
    history: [],
  };
}

function withProjection(region: Region): Region {
  const result = runProjection({
    anchors: region.anchors,
    landings: region.landings,
    motif: region.motif,
    damagedExisting: region.damagedExisting,
    intactSide: region.intactSide,
    gridRows: region.gridRows,
    gridCols: region.gridCols,
  });
  return {
    ...region,
    projection: result,
    history: [
      ...region.history,
      {
        id: `${region.id}-h-seed`,
        kind: "projection",
        at: result.at,
        version: region.version,
        ok: result.ok,
        issues: result.issues,
        targets: result.targets,
      },
    ],
  };
}

export function buildSeedCarpets(): Carpet[] {
  // CAR-092：锚点已选好，落格待点（选点中）
  const r092 = baseRegion(
    "r-092-a",
    "左缘花边 · 续纹区",
    "left",
    [...MOTIF_LEFT_ANCHORS, ...MOTIF_LEFT_REST],
    [...MOTIF_LEFT_ANCHORS],
    []
  );

  // CAR-117：落格 3 偏了一行，三组格距对不上（待复核）
  const motifRight = [
    ...MOTIF_LEFT_ANCHORS.map(mirrorCell),
    ...MOTIF_LEFT_REST.map(mirrorCell),
  ];
  const r117 = withProjection(
    baseRegion(
      "r-117-a",
      "右缘花边 · 续纹区",
      "right",
      motifRight,
      [
        { x: 5, y: 2 },
        { x: 2, y: 2 },
        { x: 5, y: 5 },
      ],
      [
        { x: -5, y: 2 },
        { x: -2, y: 2 },
        { x: -5, y: 6 }, // 应为 (-5,5)，偏一格 → 三组对不上
      ]
    )
  );

  // CAR-138：推算通过且负责人已确认替代方案（补线入口开放）
  const r138base = baseRegion(
    "r-138-a",
    "左缘花边 · 续纹区（二期）",
    "left",
    [...MOTIF_LEFT_ANCHORS, ...MOTIF_LEFT_REST],
    [...MOTIF_LEFT_ANCHORS],
    [
      { x: 5, y: 2 },
      { x: 2, y: 2 },
      { x: 5, y: 5 },
    ]
  );
  const r138projected = withProjection(r138base);
  const r138: Region = {
    ...r138projected,
    review: {
      plan: "按系统推算落点补线",
      reason:
        "破损侧残存格距与完整侧一致，推算落点与残存线头走向吻合，同意按推算结果施工。",
      reviewer: "阿依古丽",
      at: r138projected.projection?.at ?? new Date().toISOString(),
    },
    reviewVersion: r138base.version,
    history: [
      ...r138projected.history,
      {
        id: "r-138-a-h-review",
        kind: "review",
        at: r138projected.projection?.at ?? new Date().toISOString(),
        version: r138base.version,
        decision: {
          plan: "按系统推算落点补线",
          reason:
            "破损侧残存格距与完整侧一致，推算落点与残存线头走向吻合，同意按推算结果施工。",
          reviewer: "阿依古丽",
          at: r138projected.projection?.at ?? new Date().toISOString(),
        },
      },
    ],
  };

  return [
    {
      id: "CAR-092",
      origin: "波斯",
      era: "约1960s",
      knotDensity: "38 结/英寸",
      material: "羊毛",
      dyeType: "植物染",
      damage: "左缘花边磨损，续纹待补线",
      note: "花边主纹为卷草纹，完整侧格距清晰，可先取锚点。",
      regions: [r092],
    },
    {
      id: "CAR-117",
      origin: "安纳托利亚",
      era: "约1950s",
      knotDensity: "42 结/英寸",
      material: "羊毛",
      dyeType: "植物染",
      damage: "右缘花边缺口，中心纹样完好",
      note: "缺口边缘有烧灼痕迹，落格以残存结头为准。",
      regions: [r117],
    },
    {
      id: "CAR-138",
      origin: "藏毯",
      era: "约1970s",
      knotDensity: "36 结/英寸",
      material: "羊毛",
      dyeType: "矿物染",
      damage: "左缘局部褪色伴花边缺损",
      note: "靛蓝色系，补线前需比对色卡。",
      regions: [r138],
    },
  ];
}

export const THREAD_COLORS = [
  { name: "靛蓝", hex: "#1e3a8a" },
  { name: "茜草红", hex: "#b91c1c" },
  { name: "藏红花黄", hex: "#d97706" },
  { name: "羊毛本白", hex: "#e7e0d2" },
  { name: "核桃褐", hex: "#6b4f2a" },
  { name: "松石绿", hex: "#0f766e" },
];

export const ALT_PLANS = [
  "按系统推算落点补线",
  "平移整体格距后补线",
  "参照同产地同时期毯样补线",
  "局部手绘放样后补线",
];
