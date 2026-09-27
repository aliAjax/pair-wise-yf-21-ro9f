// ============================================================
// 页面操作 · 对称推花档案台
// 推算逻辑见 lib/inference.ts，状态存档见 lib/archive.ts。
// ============================================================

import { useEffect, useState } from "react";
import {
  FAILURE_LABEL,
  REGION_SPECS,
  infer,
  inBounds,
  isDamagedCell,
  isIntactCell,
  sameCell,
  type GridCell,
} from "../lib/inference";
import {
  STATUS_LABEL,
  loadArchive,
  nowIso,
  resetArchive,
  saveArchive,
  type RegionState,
  type TrailType,
} from "../lib/archive";

const CELL = 36;
const PAD = 32;
const THREAD_COLORS = ["靛蓝 B-12", "茜红 M-07", "槐黄 Y-03", "本白 W-01", "墨灰 G-05"];

const TRAIL_LABEL: Record<TrailType, string> = {
  init: "建档",
  infer_ok: "推算通过",
  infer_fail: "推算未通过",
  confirm: "确认方案",
  invalidate: "确认失效",
  complete: "补线完成",
  reset: "重置",
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("zh-CN", { hour12: false });
};
const fmtCell = (c: GridCell) => `(${c.row + 1},${c.col + 1})`;

type Mode = "anchor" | "target";

export default function SymmetryStudio() {
  const [archive, setArchive] = useState(loadArchive);
  const [activeId, setActiveId] = useState(REGION_SPECS[0].id);
  const [mode, setMode] = useState<Mode>("anchor");
  const [hint, setHint] = useState("");
  const [plan, setPlan] = useState("");
  const [reason, setReason] = useState("");
  const [confirmer, setConfirmer] = useState("");
  const [thread, setThread] = useState(THREAD_COLORS[0]);

  // 关闭后再打开：每次改动都落盘，复核前后状态可回看
  useEffect(() => saveArchive(archive), [archive]);
  useEffect(() => {
    setHint("");
    setPlan("");
    setReason("");
    setConfirmer("");
    setMode("anchor");
  }, [activeId]);

  const spec = REGION_SPECS.find((r) => r.id === activeId) ?? REGION_SPECS[0];
  const st = archive.regions[spec.id];
  const locked = st.status === "completed";
  const canRepair = st.status === "inferred" || st.status === "approved";
  const result = st.result;

  function update(fn: (s: RegionState) => RegionState) {
    setArchive((a) => ({
      ...a,
      updatedAt: nowIso(),
      regions: { ...a.regions, [spec.id]: fn(a.regions[spec.id]) },
    }));
  }

  /** 改锚点或落格格位：已确认的确认失效，已推算的回到推算中；已完成区域锁定不受影响 */
  function applyEdit(s: RegionState, kind: "锚点" | "落格格位"): RegionState {
    if (s.status === "approved" && s.confirmation) {
      return {
        ...s,
        status: "pending_review",
        confirmationInvalidated: true,
        trail: [
          ...s.trail,
          {
            at: nowIso(),
            type: "invalidate",
            detail: `修改了${kind}，负责人「${s.confirmation.confirmer}」的确认失效，需重新复核`,
          },
        ],
      };
    }
    if (s.status === "inferred") return { ...s, status: "editing" };
    return s;
  }

  function clickCell(cell: GridCell) {
    if (locked) {
      setHint("该区已完成，照旧保留，格位已锁定");
      return;
    }
    if (mode === "anchor") {
      if (!isIntactCell(spec, cell)) {
        setHint("锚点必须选在完整侧（对称轴左侧）");
        return;
      }
      const exists = st.anchors.some((c) => sameCell(c, cell));
      update((s) => {
        const has = s.anchors.some((c) => sameCell(c, cell));
        const anchors = has
          ? s.anchors.filter((c) => !sameCell(c, cell))
          : s.anchors.length >= 3
            ? [...s.anchors.slice(1), cell]
            : [...s.anchors, cell];
        return { ...applyEdit(s, "锚点"), anchors };
      });
      if (!exists && st.anchors.length === 2) setMode("target");
      setHint("");
    } else {
      if (!isDamagedCell(spec, cell)) {
        setHint("落格必须点在破损侧（对称轴右侧）");
        return;
      }
      update((s) => {
        const has = s.targets.some((c) => sameCell(c, cell));
        const targets = has
          ? s.targets.filter((c) => !sameCell(c, cell))
          : s.targets.length >= 3
            ? [...s.targets.slice(1), cell]
            : [...s.targets, cell];
        return { ...applyEdit(s, "落格格位"), targets };
      });
      setHint("");
    }
  }

  function runInference() {
    if (locked) return;
    const res = { ...infer(spec, { anchors: st.anchors, targets: st.targets }), at: nowIso() };
    update((s) => ({
      ...s,
      status: res.ok ? "inferred" : "pending_review",
      result: res,
      reviewSnapshot: res.ok
        ? s.reviewSnapshot
        : { result: res, anchors: [...s.anchors], targets: [...s.targets] },
      trail: [
        ...s.trail,
        {
          at: res.at as string,
          type: res.ok ? "infer_ok" : "infer_fail",
          detail: res.ok
            ? `推算通过：三组落点 ${res.landings.map(fmtCell).join(" ")}，补线入口开放`
            : `推算未通过（${res.failures.map((f) => FAILURE_LABEL[f]).join("、")}）→ 转待复核，补线入口关闭`,
        },
      ],
    }));
    setHint("");
  }

  function confirmPlan() {
    if (!plan.trim() || !reason.trim() || !confirmer.trim()) {
      setHint("替代方案、原因、确认人均需填写后才能施工");
      return;
    }
    const at = nowIso();
    update((s) => ({
      ...s,
      status: "approved",
      confirmationInvalidated: false,
      confirmation: { plan: plan.trim(), reason: reason.trim(), confirmer: confirmer.trim(), at },
      trail: [
        ...s.trail,
        {
          at,
          type: "confirm",
          detail: `负责人${confirmer.trim()}确认替代方案：${plan.trim()}（原因：${reason.trim()}）`,
        },
      ],
    }));
    setPlan("");
    setReason("");
    setConfirmer("");
    setHint("");
  }

  function completeRepair() {
    if (!canRepair) return;
    const at = nowIso();
    update((s) => ({
      ...s,
      status: "completed",
      completedAt: at,
      threadColor: thread,
      trail: [
        ...s.trail,
        { at, type: "complete", detail: `补线完成登记（色号 ${thread}），该区照旧保留并锁定` },
      ],
    }));
  }

  function resetRegion() {
    if (locked) return;
    const at = nowIso();
    update((s) => ({
      ...s,
      anchors: [],
      targets: [],
      result: null,
      status: "editing",
      confirmation: null,
      confirmationInvalidated: s.confirmation ? true : s.confirmationInvalidated,
      trail: [
        ...s.trail,
        ...(s.confirmation
          ? [
              {
                at,
                type: "invalidate" as const,
                detail: `重置推算，负责人「${s.confirmation.confirmer}」的确认失效`,
              },
            ]
          : []),
        { at, type: "reset" as const, detail: "重置本区推算：清空锚点与落格" },
      ],
    }));
    setMode("anchor");
    setHint("");
  }

  const gridW = PAD + spec.cols * CELL;
  const gridH = PAD + spec.rows * CELL;
  const center = (c: GridCell) => ({
    x: PAD + c.col * CELL + CELL / 2,
    y: PAD + c.row * CELL + CELL / 2,
  });
  const axisMismatch =
    result && result.impliedAxis != null && Math.abs(result.impliedAxis - spec.axisCol) > 1e-6;

  return (
    <section className="panel studio">
      <div className="heading">
        <div>
          <p>边缘花边续纹 · 对称推花</p>
          <h2>对称推花档案台</h2>
          <span className="sub">
            完整侧选 3 个锚点 → 点出破损侧落格（① 必填，②③ 可选复核）→ 系统推算其余落点；三组对不上、目标格重合或缺参照即转待复核，补线入口不开放。
          </span>
        </div>
        <button
          onClick={() => {
            if (window.confirm("恢复初始档案？当前全部推花记录将被覆盖。")) setArchive(resetArchive());
          }}
        >
          恢复初始档案
        </button>
      </div>

      <div className="studio-grid">
        <aside className="region-list">
          {REGION_SPECS.map((r) => {
            const rs = archive.regions[r.id];
            return (
              <button
                key={r.id}
                className={`region-item ${r.id === spec.id ? "active" : ""}`}
                onClick={() => setActiveId(r.id)}
              >
                <span className="region-title">{r.title}</span>
                <span className="region-meta">
                  {r.rugId} · 锚点 {rs.anchors.length}/3 · 落格 {rs.targets.length}
                </span>
                <span className={`badge b-${rs.status}`}>{STATUS_LABEL[rs.status]}</span>
              </button>
            );
          })}
        </aside>

        <div className="studio-main">
          <div className="stepper">
            <button
              className={`step ${mode === "anchor" ? "active" : ""} ${st.anchors.length === 3 ? "done" : ""}`}
              onClick={() => setMode("anchor")}
              disabled={locked}
            >
              ① 选锚点（完整侧）{st.anchors.length}/3
            </button>
            <button
              className={`step ${mode === "target" ? "active" : ""} ${st.targets.length > 0 ? "done" : ""}`}
              onClick={() => setMode("target")}
              disabled={locked}
            >
              ② 点落格（破损侧）{st.targets.length}
            </button>
            <button className="step primary" onClick={runInference} disabled={locked}>
              ③ 推算落点
            </button>
            <button className="step" onClick={resetRegion} disabled={locked}>
              重置本区
            </button>
          </div>
          {hint && <p className="hint">{hint}</p>}

          <div className="studio-cols">
            <div className="grid-card">
              <svg width={gridW} height={gridH} className="grid-svg" role="img" aria-label={`${spec.title}推花格图`}>
                {Array.from({ length: spec.cols }, (_, c) => (
                  <text key={`c${c}`} x={PAD + c * CELL + CELL / 2} y={PAD - 10} textAnchor="middle" className="axis-label">
                    {c + 1}
                  </text>
                ))}
                {Array.from({ length: spec.rows }, (_, r) => (
                  <text key={`r${r}`} x={PAD - 10} y={PAD + r * CELL + CELL / 2 + 4} textAnchor="end" className="axis-label">
                    {r + 1}
                  </text>
                ))}

                {Array.from({ length: spec.rows }, (_, r) =>
                  Array.from({ length: spec.cols }, (_, c) => {
                    const cell: GridCell = { row: r, col: c };
                    const intact = isIntactCell(spec, cell);
                    const occupied = spec.occupied.some((o) => sameCell(o, cell));
                    return (
                      <g
                        key={`${r}-${c}`}
                        onClick={() => clickCell(cell)}
                        style={{ cursor: locked ? "not-allowed" : "pointer" }}
                      >
                        <rect
                          x={PAD + c * CELL}
                          y={PAD + r * CELL}
                          width={CELL}
                          height={CELL}
                          className={`cell ${intact ? "cell-intact" : "cell-damaged"} ${occupied ? "cell-occupied" : ""}`}
                        />
                        {occupied && (
                          <>
                            <line
                              x1={PAD + c * CELL + 8}
                              y1={PAD + r * CELL + 8}
                              x2={PAD + (c + 1) * CELL - 8}
                              y2={PAD + (r + 1) * CELL - 8}
                              className="occupied-line"
                            />
                            <line
                              x1={PAD + (c + 1) * CELL - 8}
                              y1={PAD + r * CELL + 8}
                              x2={PAD + c * CELL + 8}
                              y2={PAD + (r + 1) * CELL - 8}
                              className="occupied-line"
                            />
                          </>
                        )}
                        <title>{`第${r + 1}行第${c + 1}列 · ${
                          intact ? "完整侧" : occupied ? "破损侧（旧针脚占用）" : "破损侧"
                        }`}</title>
                      </g>
                    );
                  }),
                )}

                <line
                  x1={PAD + spec.axisCol * CELL}
                  y1={PAD - 4}
                  x2={PAD + spec.axisCol * CELL}
                  y2={gridH - 4}
                  className="axis-line"
                />
                <text x={PAD + spec.axisCol * CELL} y={14} textAnchor="middle" className="axis-tag">
                  对称轴
                </text>
                {axisMismatch && (
                  <line
                    x1={PAD + (result?.impliedAxis ?? spec.axisCol) * CELL}
                    y1={PAD - 4}
                    x2={PAD + (result?.impliedAxis ?? spec.axisCol) * CELL}
                    y2={gridH - 4}
                    className="axis-line axis-bad"
                  />
                )}

                <g pointerEvents="none">
                  {result &&
                    result.landings.map((L, i) => {
                      const a = st.anchors[i];
                      if (!a || !inBounds(spec, L)) return null;
                      const p1 = center(a);
                      const p2 = center(L);
                      return (
                        <line
                          key={`ln${i}`}
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          className={`link ${result.ok ? "link-ok" : "link-bad"}`}
                        />
                      );
                    })}

                  {st.anchors.map((a, i) => {
                    const p = center(a);
                    return (
                      <g key={`a${i}`}>
                        <circle cx={p.x} cy={p.y} r={11} className="anchor-dot" />
                        <text x={p.x} y={p.y + 4} textAnchor="middle" className="dot-label">
                          {i + 1}
                        </text>
                      </g>
                    );
                  })}

                  {st.targets.map((t, i) => {
                    const p = center(t);
                    return (
                      <g key={`t${i}`}>
                        <rect
                          x={p.x - 10}
                          y={p.y - 10}
                          width={20}
                          height={20}
                          className="target-dot"
                          transform={`rotate(45 ${p.x} ${p.y})`}
                        />
                        <text x={p.x} y={p.y + 4} textAnchor="middle" className="dot-label">
                          {i + 1}
                        </text>
                      </g>
                    );
                  })}

                  {result &&
                    result.landings.map((L, i) => {
                      if (!inBounds(spec, L)) return null;
                      const p = center(L);
                      return (
                        <g key={`l${i}`}>
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={12}
                            className={`landing ${result.ok ? "landing-ok" : "landing-bad"}`}
                          />
                          <text
                            x={p.x}
                            y={p.y + 4}
                            textAnchor="middle"
                            className={result.ok ? "lt lt-ok" : "lt lt-bad"}
                          >
                            {i + 1}
                          </text>
                        </g>
                      );
                    })}
                </g>
              </svg>

              <div className="legend">
                <span>
                  <i className="sw sw-intact" />完整侧
                </span>
                <span>
                  <i className="sw sw-damaged" />破损侧
                </span>
                <span>
                  <i className="sw sw-occupied" />旧针脚占用
                </span>
                <span>
                  <i className="sw sw-anchor" />锚点
                </span>
                <span>
                  <i className="sw sw-target" />所点落格
                </span>
                <span>
                  <i className="sw sw-landing" />推算落点
                </span>
                <span>
                  <i className="sw sw-axis" />对称轴
                </span>
              </div>
            </div>

            <div className="side-panels">
              <div className="status-card">
                <div className="status-row">
                  <span className={`badge b-${st.status}`}>{STATUS_LABEL[st.status]}</span>
                  {st.confirmationInvalidated && st.status !== "approved" && (
                    <span className="badge b-void">确认曾失效</span>
                  )}
                </div>
                {result ? (
                  <ul className="checks">
                    {result.checks.map((c, i) => (
                      <li key={i} className={c.ok ? "check-ok" : "check-fail"}>
                        {c.ok ? "✓" : "✗"} {c.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">尚未推算。选好 3 个锚点并点出落格后，点「推算落点」。</p>
                )}
                {result && result.failures.length > 0 && (
                  <div className="chips-row">
                    {result.failures.map((f) => (
                      <span key={f} className="fail-chip">
                        {FAILURE_LABEL[f]}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className={`repair-entry ${canRepair ? "open" : "closed"}`}>
                <div className="repair-head">
                  <h3>补线入口</h3>
                  <span>{canRepair ? "🔓 开放" : "🔒 未开放"}</span>
                </div>
                {st.status === "pending_review" && (
                  <p className="muted">该区待复核，负责人确认替代方案并填写原因后开放。</p>
                )}
                {st.status === "editing" && <p className="muted">推算通过或替代方案确认后开放。</p>}
                {locked && (
                  <p className="muted">
                    已完成 · 照旧保留（{st.threadColor}
                    {st.completedAt ? ` · ${fmtTime(st.completedAt)}` : ""}）
                  </p>
                )}
                <div className="repair-actions">
                  <select value={thread} onChange={(e) => setThread(e.target.value)} disabled={!canRepair}>
                    {THREAD_COLORS.map((c) => (
                      <option key={c} value={c}>
                        补线色号 {c}
                      </option>
                    ))}
                  </select>
                  <button className="primary" disabled={!canRepair} onClick={completeRepair}>
                    登记补线完成
                  </button>
                </div>
              </div>

              {st.status === "pending_review" && (
                <div className="manager-form">
                  <h3>负责人复核 · 确认替代方案</h3>
                  {st.confirmationInvalidated && st.confirmation && (
                    <p className="banner-warn">上次确认已失效（锚点或落格被修改），需重新确认。</p>
                  )}
                  <label>
                    <span>替代方案</span>
                    <textarea
                      value={plan}
                      onChange={(e) => setPlan(e.target.value)}
                      placeholder="如：第 2 组落点东移一格，按卷草走向手工补弧线"
                    />
                  </label>
                  <label>
                    <span>原因（必填）</span>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="为什么推算落点不可施工"
                    />
                  </label>
                  <label>
                    <span>确认人（必填）</span>
                    <input value={confirmer} onChange={(e) => setConfirmer(e.target.value)} placeholder="负责人姓名" />
                  </label>
                  <button className="primary" onClick={confirmPlan}>
                    确认替代方案，开放补线入口
                  </button>
                </div>
              )}

              {st.status === "approved" && st.confirmation && (
                <div className="confirm-card">
                  <h3>已确认替代方案</h3>
                  <p>
                    <b>方案：</b>
                    {st.confirmation.plan}
                  </p>
                  <p>
                    <b>原因：</b>
                    {st.confirmation.reason}
                  </p>
                  <p>
                    <b>确认人：</b>
                    {st.confirmation.confirmer} · {fmtTime(st.confirmation.at)}
                  </p>
                  <p className="muted">修改锚点或落格格位将使本确认失效；已完成区域不受影响。</p>
                </div>
              )}

              {(st.reviewSnapshot || st.confirmation) && (
                <div className="review-compare">
                  <h3>复核前后</h3>
                  <div className="compare-cols">
                    <div>
                      <h4>复核前 · 推算快照</h4>
                      {st.reviewSnapshot ? (
                        <>
                          <p className="muted">{fmtTime(st.reviewSnapshot.result.at ?? "")}</p>
                          <div className="chips-row">
                            {st.reviewSnapshot.result.failures.map((f) => (
                              <span key={f} className="fail-chip">
                                {FAILURE_LABEL[f]}
                              </span>
                            ))}
                          </div>
                          <p className="muted">锚点：{st.reviewSnapshot.anchors.map(fmtCell).join(" ")}</p>
                          <p className="muted">所点落格：{st.reviewSnapshot.targets.map(fmtCell).join(" ") || "—"}</p>
                          <p className="muted">
                            推算落点：{st.reviewSnapshot.result.landings.map(fmtCell).join(" ") || "—"}
                          </p>
                        </>
                      ) : (
                        <p className="muted">无</p>
                      )}
                    </div>
                    <div>
                      <h4>复核后 · 确认方案</h4>
                      {st.confirmation ? (
                        <>
                          <p>{st.confirmation.plan}</p>
                          <p className="muted">
                            {st.confirmation.confirmer} · {fmtTime(st.confirmation.at)}
                            {st.confirmationInvalidated ? " · 已失效" : ""}
                          </p>
                        </>
                      ) : (
                        <p className="muted">待负责人确认</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="timeline-card">
                <h3>复核记录</h3>
                <ul className="timeline">
                  {st.trail.map((e, i) => (
                    <li key={i} className={`tl-${e.type}`}>
                      <span className="tl-type">{TRAIL_LABEL[e.type]}</span>
                      <span className="tl-time">{fmtTime(e.at)}</span>
                      <p>{e.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="arch-note">
        推算 / 存档 / 页面操作分三处维护：src/lib/inference.ts（几何推算）· src/lib/archive.ts（localStorage
        存档）· src/components/SymmetryStudio.tsx（页面操作）；关闭后再打开仍可查看复核前后。
      </p>
    </section>
  );
}
