/**
 * 区域面板：状态、三组对照、推算结果、待复核确认、补线入口与复核前后记录。
 */

import { useState } from "react";
import { ALT_PLANS } from "../core/seed";
import { formatDist } from "../core/projection";
import {
  HistoryEvent,
  ISSUE_LABEL,
  Region,
  STATUS_LABEL,
  deriveStatus,
  isEntryOpen,
} from "../core/types";

interface RegionPanelProps {
  region: Region;
  onRunProjection: () => void;
  onResetSelection: () => void;
  onApprove: (plan: string, reason: string, reviewer: string) => void;
  onOpenEntry: () => void;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function Timeline({ history }: { history: HistoryEvent[] }) {
  if (history.length === 0) {
    return <p className="muted">暂无记录。选点、推算、复核与完工都会在此留痕，关闭页面后再打开仍可查看。</p>;
  }
  const items = [...history].reverse();
  return (
    <ol className="timeline">
      {items.map((ev) => {
        if (ev.kind === "projection") {
          return (
            <li key={ev.id} className={ev.ok ? "tl tl--ok" : "tl tl--bad"}>
              <header>
                <b>{ev.ok ? "推算通过" : "推算未通过 · 转待复核"}</b>
                <time>{fmtTime(ev.at)} · 选点 v{ev.version}</time>
              </header>
              {ev.ok ? (
                <p>系统给出 {ev.targets.length} 个其余落点，补线入口开放。</p>
              ) : (
                <ul>
                  {ev.issues.map((i, idx) => (
                    <li key={idx}>[{ISSUE_LABEL[i.code]}] {i.detail}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        }
        if (ev.kind === "invalidated") {
          return (
            <li key={ev.id} className="tl tl--warn">
              <header>
                <b>确认失效</b>
                <time>{fmtTime(ev.at)} · 原选点 v{ev.version}</time>
              </header>
              <p>{ev.reason}。</p>
            </li>
          );
        }
        if (ev.kind === "review") {
          return (
            <li key={ev.id} className="tl tl--review">
              <header>
                <b>负责人确认替代方案</b>
                <time>{fmtTime(ev.at)} · 选点 v{ev.version}</time>
              </header>
              <p>方案：{ev.decision.plan}</p>
              <p>原因：{ev.decision.reason}</p>
              <p>负责人：{ev.decision.reviewer}</p>
            </li>
          );
        }
        return (
          <li key={ev.id} className="tl tl--done">
            <header>
              <b>补线完工</b>
              <time>{fmtTime(ev.at)} · 选点 v{ev.version}</time>
            </header>
            <p>补线颜色：{ev.threadColor}。区域照旧保留，标记图锁定。</p>
          </li>
        );
      })}
    </ol>
  );
}

function ReviewForm({
  onApprove,
}: {
  onApprove: (plan: string, reason: string, reviewer: string) => void;
}) {
  const [plan, setPlan] = useState(ALT_PLANS[0]);
  const [reason, setReason] = useState("");
  const [reviewer, setReviewer] = useState("");
  const ready = plan.trim() !== "" && reason.trim() !== "" && reviewer.trim() !== "";
  return (
    <div className="review-form">
      <label>
        <span>替代方案</span>
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          {ALT_PLANS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      <label>
        <span>原因（必填）</span>
        <textarea
          rows={3}
          placeholder="说明为何不采用系统推算、替代方案的依据……"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label>
        <span>负责人</span>
        <input
          placeholder="确认人姓名"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="primary"
        disabled={!ready}
        onClick={() => onApprove(plan, reason, reviewer)}
      >
        确认替代方案并开放补线入口
      </button>
      {!ready && <p className="muted">方案、原因、负责人三者齐全才能确认。</p>}
    </div>
  );
}

export function RegionPanel({
  region,
  onRunProjection,
  onResetSelection,
  onApprove,
  onOpenEntry,
}: RegionPanelProps) {
  const status = deriveStatus(region);
  const entryOpen = isEntryOpen(region);
  const projection = region.projection;
  const hasSelection = region.anchors.length + region.landings.length > 0;

  return (
    <aside className="panel region-panel">
      <div className="heading">
        <div>
          <p>区域状态</p>
          <h2>
            <span className={`status-pill status--${status}`}>{STATUS_LABEL[status]}</span>
            <small className="muted"> 选点 v{region.version}</small>
          </h2>
        </div>
      </div>

      <div className="counts">
        <span>锚点 {region.anchors.length}/3</span>
        <span>落格 {region.landings.length}/3</span>
        <span className={entryOpen ? "gate gate--open" : "gate gate--closed"}>
          补线入口{entryOpen ? "开放" : "关闭"}
        </span>
      </div>

      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={status === "done"}
          onClick={onRunProjection}
        >
          对称推花 · 推算其余落点
        </button>
        <button
          type="button"
          disabled={status === "done" || !hasSelection}
          onClick={onResetSelection}
        >
          清空选点
        </button>
      </div>
      <p className="muted small">
        改锚点或格位会使推算与确认失效（留痕）；已完工区域照旧保留、不再变动。
      </p>

      {projection && projection.metrics.length > 0 && (
        <section className="block">
          <h3>三组对照</h3>
          <table className="metrics-table">
            <thead>
              <tr><th>组别</th><th>锚点侧格距</th><th>落格侧格距</th><th>比对</th></tr>
            </thead>
            <tbody>
              {projection.metrics.map((m) => (
                <tr key={m.label} className={m.equal ? "" : "row--bad"}>
                  <td>{m.label}</td>
                  <td>{formatDist(Math.round(m.anchorDist * m.anchorDist))}</td>
                  <td>{formatDist(Math.round(m.landingDist * m.landingDist))}</td>
                  <td>{m.equal ? "一致" : "对不上"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {projection && !projection.ok && (
        <section className="block block--alert">
          <h3>该区已转待复核 · 补线入口不开放</h3>
          <ul className="issues">
            {projection.issues.map((i, idx) => (
              <li key={idx}>
                <b>[{ISSUE_LABEL[i.code]}]</b> {i.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      {projection && projection.ok && (
        <section className="block block--ok">
          <h3>推算通过</h3>
          <p>
            按对称轴镜像，系统给出其余 {projection.targets.length} 个落点（格网中青色标记）：
          </p>
          <p className="targets">
            {projection.targets.map((t) => `(${t.x}, ${t.y})`).join("　")}
          </p>
        </section>
      )}

      {status === "pending" && (
        <section className="block block--review">
          <h3>待复核 · 负责人确认</h3>
          <p className="muted">
            三组对不上、目标格重合或缺参照时，须由负责人确认替代方案并写明原因，补线入口才开放。
          </p>
          <ReviewForm
            key={`${region.id}:${region.version}`}
            onApprove={onApprove}
          />
        </section>
      )}

      {region.review && (
        <section className="block block--reviewed">
          <h3>已确认替代方案</h3>
          <p>方案：{region.review.plan}</p>
          <p>原因：{region.review.reason}</p>
          <p>负责人：{region.review.reviewer} · {fmtTime(region.review.at)}</p>
        </section>
      )}

      <section className="block">
        <h3>补线入口</h3>
        {status === "done" ? (
          <p className="done-info">
            已于 {fmtTime(region.completedAt ?? "")} 完工，补线颜色「{region.threadColor}」。区域照旧保留。
          </p>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={!entryOpen}
            onClick={onOpenEntry}
          >
            {entryOpen ? "补线施工登记" : "补线入口未开放"}
          </button>
        )}
        {status === "pending" && (
          <p className="muted small">待复核区域须先由负责人确认替代方案。</p>
        )}
        {status === "editing" && (
          <p className="muted small">完成三组选点并推算通过后开放。</p>
        )}
      </section>

      <section className="block">
        <h3>复核前后记录</h3>
        <Timeline history={region.history} />
      </section>
    </aside>
  );
}
