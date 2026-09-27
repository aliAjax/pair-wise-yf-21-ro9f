/**
 * 页面组合：档案列表 + 对称推花工作台。
 * 推算（core/projection）、存档（core/archiveStore）、页面操作（core/archiveOps + 组件）分三层维护。
 */

import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { Board } from "./components/Board";
import { RegionPanel } from "./components/RegionPanel";
import { Sidebar } from "./components/Sidebar";
import {
  PickMode,
  approveReview,
  findRegion,
  markDone,
  resetSelection,
  runProjectionFor,
  selectCarpet,
  selectRegion,
  toggleCell,
} from "./core/archiveOps";
import { clearState, loadState, saveState } from "./core/archiveStore";
import { THREAD_COLORS } from "./core/seed";
import {
  ArchiveState,
  Cell,
  Region,
  STATUS_LABEL,
  deriveStatus,
  isEntryOpen,
} from "./core/types";

const STEPS = ["选点", "推算", "复核放行", "补线完工"] as const;

function stepIndex(region: Region): number {
  if (region.completedAt) return 4;
  if (isEntryOpen(region)) return 3;
  if (region.projection) return 2;
  if (region.anchors.length === 3 && region.landings.length === 3) return 1;
  return 0;
}

function DoneModal({
  region,
  onCancel,
  onConfirm,
}: {
  region: Region;
  onCancel: () => void;
  onConfirm: (color: string) => void;
}) {
  const [color, setColor] = useState(THREAD_COLORS[0].name);
  return (
    <div className="modal-mask" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>补线施工登记 · {region.name}</h3>
        <p className="muted">
          {region.projection?.ok
            ? `按系统推算的 ${region.projection.targets.length} 个落点补线。`
            : `按负责人确认的替代方案「${region.review?.plan}」施工。`}
        </p>
        <span className="muted small">补线颜色（色卡）</span>
        <div className="swatches">
          {THREAD_COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              className={c.name === color ? "swatch swatch--on" : "swatch"}
              onClick={() => setColor(c.name)}
            >
              <i style={{ background: c.hex }} />
              {c.name}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>取消</button>
          <button type="button" className="primary" onClick={() => onConfirm(color)}>
            登记完工
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [state, setState] = useState<ArchiveState>(loadState);
  const [originFilter, setOriginFilter] = useState("全部");
  const [mode, setMode] = useState<PickMode>("anchor");
  const [entryOpen, setEntryOpen] = useState(false);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const carpet =
    state.carpets.find((c) => c.id === state.selectedCarpetId) ?? state.carpets[0];
  const region =
    findRegion(state, state.selectedRegionId) ?? carpet.regions[0];

  const origins = useMemo(
    () => Array.from(new Set(state.carpets.map((c) => c.origin))),
    [state.carpets]
  );
  const filteredCarpets = useMemo(
    () =>
      originFilter === "全部"
        ? state.carpets
        : state.carpets.filter((c) => c.origin === originFilter),
    [state.carpets, originFilter]
  );

  const allRegions = state.carpets.flatMap((c) => c.regions);
  const countBy = (s: string) =>
    allRegions.filter((r) => deriveStatus(r) === s).length;
  const metrics = [
    { label: "待复核", value: countBy("pending") },
    { label: "推算通过", value: countBy("projected") },
    { label: "已确认方案", value: countBy("approved") },
    { label: "已完工", value: countBy("done") },
  ];

  const status = deriveStatus(region);
  const currentStep = stepIndex(region);

  const handleCellClick = (cell: Cell) =>
    setState((s) => toggleCell(s, region.id, cell, mode));

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62009 · 手工地毯修复 · 边缘花边续纹</p>
        <h1>对称推花 · 纹样修复档案</h1>
        <span>
          完整侧选定三个锚点，再点出破损侧三个对应落格，系统按对称关系推算其余落点。
          三组对不上、目标格重合或缺参照时，该区域转待复核、补线入口不开放；
          负责人确认替代方案并写明原因后方可施工。改锚点或格位会使确认失效，已完成区域照旧保留。
        </span>
        <div>
          <button type="button" onClick={() => setState(clearState())}>
            恢复示例档案
          </button>
        </div>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <div className="layout">
        <Sidebar
          carpets={filteredCarpets}
          origins={origins}
          originFilter={originFilter}
          selectedCarpetId={carpet.id}
          onFilter={setOriginFilter}
          onSelect={(id) => setState((s) => selectCarpet(s, id))}
        />

        <div className="main-col">
          <section className="panel meta-panel">
            <div className="heading">
              <div>
                <p>地毯档案</p>
                <h2>{carpet.id} · {carpet.origin}</h2>
              </div>
            </div>
            <dl className="meta-grid">
              <div><dt>年代</dt><dd>{carpet.era}</dd></div>
              <div><dt>结密度</dt><dd>{carpet.knotDensity}</dd></div>
              <div><dt>材质</dt><dd>{carpet.material}</dd></div>
              <div><dt>染色类型</dt><dd>{carpet.dyeType}</dd></div>
              <div><dt>破损区域</dt><dd>{carpet.damage}</dd></div>
              <div><dt>备注</dt><dd>{carpet.note}</dd></div>
            </dl>
            <div className="meta-row">
              <div>
                <span className="muted small">材料色卡</span>
                <div className="swatches swatches--flat">
                  {THREAD_COLORS.map((c) => (
                    <i key={c.name} title={c.name} style={{ background: c.hex }} />
                  ))}
                </div>
              </div>
              <div className="steps">
                {STEPS.map((label, i) => (
                  <span
                    key={label}
                    className={
                      i < currentStep
                        ? "step step--done"
                        : i === currentStep
                          ? "step step--now"
                          : "step"
                    }
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <div className="workbench">
            <section className="panel board-panel">
              <div className="heading">
                <div>
                  <p>纹样局部标记图</p>
                  <h2>{region.name}</h2>
                </div>
                <div className="region-tabs">
                  {carpet.regions.map((r) => {
                    const s = deriveStatus(r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={
                          r.id === region.id ? "chip chip--on" : "chip"
                        }
                        onClick={() => setState((st) => selectRegion(st, r.id))}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mode-toggle" role="tablist">
                <button
                  type="button"
                  className={mode === "anchor" ? "chip chip--on" : "chip"}
                  disabled={status === "done"}
                  onClick={() => setMode("anchor")}
                >
                  ① 选锚点（完整侧纹格）
                </button>
                <button
                  type="button"
                  className={mode === "landing" ? "chip chip--on" : "chip"}
                  disabled={status === "done"}
                  onClick={() => setMode("landing")}
                >
                  ② 点落格（破损侧）
                </button>
              </div>

              <Board region={region} mode={mode} onCellClick={handleCellClick} />
            </section>

            <RegionPanel
              region={region}
              onRunProjection={() =>
                setState((s) => runProjectionFor(s, region.id))
              }
              onResetSelection={() =>
                setState((s) => resetSelection(s, region.id))
              }
              onApprove={(plan, reason, reviewer) =>
                setState((s) => approveReview(s, region.id, plan, reason, reviewer))
              }
              onOpenEntry={() => setEntryOpen(true)}
            />
          </div>
        </div>
      </div>

      {entryOpen && status !== "done" && (
        <DoneModal
          region={region}
          onCancel={() => setEntryOpen(false)}
          onConfirm={(color) => {
            setState((s) => markDone(s, region.id, color));
            setEntryOpen(false);
          }}
        />
      )}
    </main>
  );
}

export default App;
