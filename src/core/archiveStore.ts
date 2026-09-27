/**
 * 存档层：档案状态的读写与本地持久化（localStorage）。
 * 关闭页面后再打开，仍能看到复核前后的完整记录。
 */

import { buildSeedCarpets } from "./seed";
import { ArchiveState } from "./types";

const STORAGE_KEY = "hxyfront-62009:lace-archive:v1";

export function createInitialState(): ArchiveState {
  const carpets = buildSeedCarpets();
  return {
    carpets,
    selectedCarpetId: carpets[0].id,
    selectedRegionId: carpets[0].regions[0].id,
  };
}

export function loadState(): ArchiveState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as ArchiveState;
    if (!parsed || !Array.isArray(parsed.carpets) || parsed.carpets.length === 0) {
      return createInitialState();
    }
    return parsed;
  } catch {
    return createInitialState();
  }
}

export function saveState(state: ArchiveState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默降级为内存态
  }
}

export function clearState(): ArchiveState {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return createInitialState();
}
