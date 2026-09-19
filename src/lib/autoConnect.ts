import type { Profile } from "../types";
import { supportsNative } from "./native";

/** A latency result is trusted for 5 minutes before re-testing. */
export const FRESH_MS = 5 * 60 * 1000;
export const STALE_SUB_MS = 24 * 3600 * 1000;
/** Max servers to probe when picking the fastest. */
export const PROBE_LIMIT = 6;
/** Max servers to try connecting to before giving up. */
export const CONNECT_LIMIT = 5;

export function isFresh(p: Profile, now = Date.now()): boolean {
  return (
    p.latency != null &&
    p.latency >= 0 &&
    p.testedAt != null &&
    now - p.testedAt < FRESH_MS
  );
}

function score(p: Profile, selectedId: string | null): number {
  // Lower is better.
  let s = 0;
  if (p.latency == null) s += 100_000;
  else s += Math.min(p.latency, 5000);
  if (p.id === selectedId) s -= 50; // slight preference for current choice
  if (p.favorite) s -= 500; // favorites first when latency unknown
  return s;
}

/**
 * Order connectable profiles: supported protocols only, fastest / freshest first.
 * When autoFastest is off, the manually selected server stays first.
 */
export function rankCandidates(
  profiles: Profile[],
  selectedId: string | null,
  autoFastest: boolean,
): Profile[] {
  const list = profiles.filter(supportsNative);
  if (!autoFastest) {
    const sel = list.find((p) => p.id === selectedId);
    const rest = list
      .filter((p) => p.id !== selectedId)
      .sort((a, b) => score(a, selectedId) - score(b, selectedId));
    return sel ? [sel, ...rest] : rest;
  }
  return [...list].sort((a, b) => {
    const fa = isFresh(a);
    const fb = isFresh(b);
    if (fa && fb) return (a.latency ?? 9999) - (b.latency ?? 9999);
    if (fa) return -1;
    if (fb) return 1;
    return score(a, selectedId) - score(b, selectedId);
  });
}

/** Pick which candidates still need a fresh probe. */
export function needProbe(candidates: Profile[]): Profile[] {
  return candidates.filter((p) => !isFresh(p)).slice(0, PROBE_LIMIT);
}

export function smartStepText(
  lang: "fa" | "en",
  phase: string,
  detail?: string,
): string {
  const fa = lang === "fa";
  switch (phase) {
    case "updating":
      return fa ? "در حال به‌روزرسانی اشتراک…" : "Updating subscriptions…";
    case "testing":
      return fa
        ? `در حال پیدا کردن سریع‌ترین سرور${detail ? ` (${detail})` : ""}…`
        : `Finding fastest server${detail ? ` (${detail})` : ""}…`;
    case "connecting":
      return fa
        ? `در حال اتصال${detail ? ` به ${detail}` : ""}…`
        : `Connecting${detail ? ` to ${detail}` : ""}…`;
    case "retry":
      return fa
        ? `تلاش بعدی${detail ? ` (${detail})` : ""}…`
        : `Trying next${detail ? ` (${detail})` : ""}…`;
    default:
      return "";
  }
}
