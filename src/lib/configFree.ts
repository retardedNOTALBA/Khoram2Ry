import { inspectImport } from "./parseShare";
import type { Profile } from "../types";

export const CONFIG_FREE_URL = "https://raw.githubusercontent.com/retardedNOTALBA/Khoram2Ry/main/public/config-free.json";

export interface ConfigFreeItem {
  id: string;
  name: string;
  raw: string;
  note?: string;
  enabled?: boolean;
}

export interface ConfigFreeFeed {
  version: number;
  updatedAt?: string;
  configs: ConfigFreeItem[];
}

export interface ConfigFreeResult extends ConfigFreeItem {
  profile: Profile;
}

export async function fetchConfigFree(signal?: AbortSignal): Promise<{ feed: ConfigFreeFeed; items: ConfigFreeResult[] }> {
  const response = await fetch(`${CONFIG_FREE_URL}?v=${Date.now()}`, {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`CONFIG_FREE_${response.status}`);
  const feed = (await response.json()) as ConfigFreeFeed;
  if (!feed || !Array.isArray(feed.configs)) throw new Error("INVALID_CONFIG_FREE");

  const items: ConfigFreeResult[] = [];
  for (const item of feed.configs) {
    if (!item || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.raw !== "string" || item.enabled === false) continue;
    try {
      const parsed = inspectImport(item.raw);
      const profile = parsed.profiles[0];
      if (profile) items.push({ ...item, profile: { ...profile, name: item.name } });
    } catch {
      // Invalid entries are ignored so one bad item never breaks the whole feed.
    }
  }
  return { feed, items };
}
