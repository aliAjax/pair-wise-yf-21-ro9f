/**
 * 档案侧栏：按产地筛选的地毯档案列表。
 */

import { Carpet, STATUS_LABEL, deriveStatus } from "../core/types";

interface SidebarProps {
  carpets: Carpet[];
  origins: string[];
  originFilter: string;
  selectedCarpetId: string;
  onFilter: (origin: string) => void;
  onSelect: (carpetId: string) => void;
}

export function Sidebar({
  carpets,
  origins,
  originFilter,
  selectedCarpetId,
  onFilter,
  onSelect,
}: SidebarProps) {
  return (
    <aside className="panel sidebar">
      <h2>纹样档案</h2>
      <div className="chips">
        {["全部", ...origins].map((o) => (
          <button
            key={o}
            type="button"
            className={o === originFilter ? "chip chip--on" : "chip"}
            onClick={() => onFilter(o)}
          >
            {o}
          </button>
        ))}
      </div>
      <div className="carpet-list">
        {carpets.map((c) => (
          <button
            key={c.id}
            type="button"
            className={
              c.id === selectedCarpetId ? "carpet-card carpet-card--on" : "carpet-card"
            }
            onClick={() => onSelect(c.id)}
          >
            <header>
              <b>{c.id}</b>
              <span>{c.origin} · {c.era}</span>
            </header>
            <p>{c.damage}</p>
            <footer>
              {c.regions.map((r) => {
                const s = deriveStatus(r);
                return (
                  <i key={r.id} className={`status-pill status--${s}`}>
                    {STATUS_LABEL[s]}
                  </i>
                );
              })}
            </footer>
          </button>
        ))}
        {carpets.length === 0 && <p className="muted">该产地暂无档案。</p>}
      </div>
    </aside>
  );
}
