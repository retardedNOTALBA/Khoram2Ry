import type { AdvancedSettings, AppState, Profile, Subscription } from "../types";
import { AppError } from "./errors";
import { MAX_CONFIG_SIZE, parseProfile, validateSubscriptionUrl } from "./parseShare";
import { exportText, validAdvanced } from "./native";

const KEY = "khoram2ry:v1";

export const defaultAdvanced = (): AdvancedSettings => ({
  dns: "1.1.1.1", socksPort: 10808, mtu: 1500, sniffing: true, ipv6: false,
  muxConcurrency: 8, fragmentLength: "50-100", fragmentInterval: "10-20",
  logLevel: "warning", testUrl: "https://www.gstatic.com/generate_204", directDomains: "", blockedDomains: "",
});

export const defaultState = (): AppState => ({
  profiles: [],
  subs: [],
  selectedId: null,
  lang: "fa",
  routing: "smart",
  theme: "night",
  mux: false,
  fragment: false,
  advanced: defaultAdvanced(),
  onboarded: true,
  // Smart connection defaults are enabled; users can turn them off in Settings.
  autoConnect: true,
  autoReconnect: true,
  autoFastest: true,
});

const asBool = (v: unknown, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.profiles) || !Array.isArray(parsed.subs)) return defaultState();
    const legacy = !parsed.advanced;
    const profiles: Profile[] = parsed.profiles.filter((p: Profile) => p && typeof p.id === "string" && typeof p.raw === "string").map((p: Profile) => {
      let fields: Partial<Profile> = {};
      try { fields = parseProfile(p.raw); } catch { /* Keep old raw input so the user can repair it. */ }
      return { ...p, ...fields, id: p.id, raw: p.raw, name: typeof p.name === "string" ? p.name : fields.name || "Configuration",
        createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
        favorite: p.favorite === true, subId: p.subId,
        latency: !legacy && Number.isFinite(p.latency) ? p.latency : undefined,
        testedAt: !legacy && typeof p.testedAt === "number" ? p.testedAt : undefined,
        host: fields.host || p.host || "", protocol: fields.protocol || p.protocol || "unknown",
      };
    });
    const subs: Subscription[] = parsed.subs.filter((s: Subscription) => s && typeof s.id === "string" && typeof s.url === "string" && typeof s.name === "string")
      .map((s: Subscription) => ({ ...s, enabled: s.enabled !== false, autoUpdate: !legacy && s.autoUpdate === true }));
    const advanced = { ...defaultAdvanced(), ...parsed.advanced };
    return { ...defaultState(), profiles, subs, selectedId: profiles.some((p) => p.id === parsed.selectedId) ? parsed.selectedId : profiles[0]?.id || null,
      lang: parsed.lang === "en" ? "en" : "fa", theme: parsed.theme === "oled" ? "oled" : "night",
      routing: ["global", "direct"].includes(parsed.routing) ? parsed.routing : "smart",
      mux: parsed.mux === true, fragment: parsed.fragment === true,
      autoConnect: asBool(parsed.autoConnect, true),
      autoReconnect: asBool(parsed.autoReconnect, true),
      autoFastest: asBool(parsed.autoFastest, true),
      advanced: validAdvanced(advanced) ? advanced : defaultAdvanced(), onboarded: true };
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    throw new AppError("STORAGE_FULL");
  }
}

export function downloadBackup(state: AppState) {
  return exportText(JSON.stringify({ format: "khoram2ry", version: 2, ...state }, null, 2), `khoram2ry-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
}

export function restoreBackup(text: string): AppState {
  if (text.length > MAX_CONFIG_SIZE) throw new AppError("TOO_LARGE");
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data.profiles) || !Array.isArray(data.subs)) throw new Error();
    const subIds = new Set<string>();
    const subs: Subscription[] = data.subs.map((s: Subscription) => {
      if (typeof s.id !== "string" || typeof s.name !== "string" || subIds.has(s.id)) throw new Error();
      subIds.add(s.id);
      return { id: s.id, name: s.name, url: validateSubscriptionUrl(s.url), enabled: s.enabled !== false, autoUpdate: s.autoUpdate === true, lastUpdated: typeof s.lastUpdated === "number" ? s.lastUpdated : undefined };
    });
    const ids = new Set<string>();
    const profiles: Profile[] = data.profiles.map((p: Profile) => {
      if (typeof p.id !== "string" || !/^[A-Za-z0-9-]{1,100}$/.test(p.id) || ids.has(p.id) || typeof p.raw !== "string") throw new Error();
      ids.add(p.id);
      return { ...parseProfile(p.raw), id: p.id, name: typeof p.name === "string" ? p.name : parseProfile(p.raw).name, favorite: p.favorite === true, subId: subs.some((s) => s.id === p.subId) ? p.subId : undefined };
    });
    const advanced = { ...defaultAdvanced(), ...data.advanced };
    if (!validAdvanced(advanced)) throw new Error();
    return { ...defaultState(), profiles, subs, selectedId: ids.has(data.selectedId) ? data.selectedId : profiles[0]?.id || null,
      lang: data.lang === "en" ? "en" : "fa", theme: data.theme === "oled" ? "oled" : "night",
      routing: ["global", "direct"].includes(data.routing) ? data.routing : "smart",
      mux: data.mux === true, fragment: data.fragment === true,
      autoConnect: asBool(data.autoConnect, true),
      autoReconnect: asBool(data.autoReconnect, true),
      autoFastest: asBool(data.autoFastest, true),
      advanced };
  } catch { throw new AppError("INVALID_BACKUP"); }
}
