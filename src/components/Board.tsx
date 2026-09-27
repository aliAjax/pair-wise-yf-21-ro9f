/**
 * 纹样局部标记图：以对称轴为界的格网。
 * 左/右一侧为完整侧（纹样参照），另一侧为破损侧（落格区）。
 */

import { PickMode } from "../core/archiveOps";
import { Cell, Region, cellKey, deriveStatus } from "../core/types";

interface BoardProps {
  region: Region;
  mode: PickMode;
  onCellClick: (cell: Cell) => void;
}

export function Board({ region, mode, onCellClick }: BoardProps) {
  const { gridRows, gridCols, intactSide } = region;
  const half = (gridCols - 1) / 2;
  const locked = deriveStatus(region) === "done";

  const motifKeys = new Set(region.motif.map(cellKey));
  const existingKeys = new Set(region.damagedExisting.map(cellKey));
  const targetKeys = new Set(
    region.projection && region.projection.ok
      ? region.projection.targets.map(cellKey)
      : []
  );

  const anchorIndex = (c: Cell) =>
    region.anchors.findIndex((a) => a.x === c.x && a.y === c.y);
  const landingIndex = (c: Cell) =>
    region.landings.findIndex((l) => l.x === c.x && l.y === c.y);

  const isIntact = (x: number) => (intactSide === "left" ? x < 0 : x > 0);
  const isDamaged = (x: number) => (intactSide === "left" ? x > 0 : x < 0);

  const clickable = (c: Cell): boolean => {
    if (locked) return false;
    if (mode === "anchor") {
      return isIntact(c.x) && motifKeys.has(cellKey(c));
    }
    return isDamaged(c.x);
  };

  const cells: Cell[] = [];
  for (let y = 0; y < gridRows; y += 1) {
    for (let xi = -half; xi <= half; xi += 1) {
      cells.push({ x: xi, y });
    }
  }

  const intactLabel = (
    <span
      className="board-side board-side--intact"
      style={{ gridColumn: intactSide === "left" ? `1 / span ${half}` : `${half + 2} / span ${half}` }}
    >
      完整侧 · 参照
    </span>
  );

  return (
    <div className="board-wrap">
      <div
        className="board-labels"
        style={{ gridTemplateColumns: `repeat(${gridCols}, 34px)` }}
      >
        {intactLabel}
        <span className="board-side board-side--axis" style={{ gridColumn: half + 1 }}>
          轴
        </span>
        <span
          className="board-side board-side--damaged"
          style={{ gridColumn: intactSide === "left" ? `${half + 2} / span ${half}` : `1 / span ${half}` }}
        >
          破损侧 · 落格
        </span>
      </div>

      <div
        className="board"
        style={{ gridTemplateColumns: `repeat(${gridCols}, 34px)` }}
        role="grid"
        aria-label="花边续纹格网"
      >
        {cells.map((c) => {
          const key = cellKey(c);
          const ai = anchorIndex(c);
          const li = landingIndex(c);
          const classes = ["cell"];
          if (c.x === 0) classes.push("cell--axis");
          else if (isIntact(c.x)) classes.push("cell--intact");
          else classes.push("cell--damaged");
          if (motifKeys.has(key)) classes.push("cell--motif");
          if (existingKeys.has(key)) classes.push("cell--existing");
          if (ai >= 0) classes.push("cell--anchor");
          if (li >= 0) classes.push("cell--landing");
          if (targetKeys.has(key)) classes.push("cell--target");
          if (clickable(c)) classes.push("cell--clickable");
          if (locked) classes.push("cell--locked");

          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              className={classes.join(" ")}
              title={`格位 (${c.x}, ${c.y})`}
              onClick={() => clickable(c) && onCellClick(c)}
            >
              {ai >= 0 && <span className="badge badge--anchor">{ai + 1}</span>}
              {li >= 0 && <span className="badge badge--landing">{li + 1}</span>}
              {targetKeys.has(key) && <span className="dot--target" />}
            </button>
          );
        })}
      </div>

      <div className="legend">
        <span><i className="sw sw--motif" />完整侧纹样</span>
        <span><i className="sw sw--anchor" />锚点（完整侧 3 个）</span>
        <span><i className="sw sw--landing" />对应落格（破损侧 3 个）</span>
        <span><i className="sw sw--target" />系统推算落点</span>
      </div>
    </div>
  );
}
