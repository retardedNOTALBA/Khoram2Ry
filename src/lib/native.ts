import { AppError } from "./errors";
import type { AdvancedSettings, AppState, Profile, TunnelStatus } from "../types";

declare global {
  interface Window {
    KhoramNative?: { request(id: string, method: string, payload: string): void };
  }
}

export const hasNativeCore = () => typeof window !== "undefined" && typeof window.KhoramNative?.request === "function";

export const browserStatus: TunnelStatus = {
  available: false, state: "disconnected", core: "", profileId: null,
  uploaded: null, downloaded: null, elapsedMs: 0,
};

let sequence = 0;

// Only the local Android activity implements this bridge; there is no remote control API.
export function nativeRequest<T>(method: string, payload: unknown = {}, timeout = 25_000): Promise<T> {
  if (!hasNativeCore()) return Promise.reject(new AppError("NATIVE_REQUIRED"));
  return new Promise((resolve, reject) => {
    const id = `req-${Date.now()}-${++sequence}`;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("khoram-native-response", handle);
    };
    const handle = (event: Event) => {
      const response = (event as CustomEvent<{ id: string; result?: T; error?: string }>).detail;
      if (response?.id !== id) return;
      cleanup();
      if (response.error) reject(new AppError(response.error));
      else resolve(response.result as T);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new AppError("REQUEST_TIMEOUT"));
    }, timeout);
    window.addEventListener("khoram-native-response", handle);
    try { window.KhoramNative!.request(id, method, JSON.stringify(payload)); }
    catch { cleanup(); reject(new AppError("NATIVE_REQUIRED")); }
  });
}

export function connectionPayload(profile: Profile, state: AppState) {
  return {
    profile: { id: profile.id, name: profile.name, raw: profile.raw },
    settings: { ...state.advanced, routing: state.routing, mux: state.mux, fragment: state.fragment },
  };
}

export function supportsNative(profile: Profile) {
  return ["vless", "vmess", "trojan", "ss", "custom"].includes(profile.protocol);
}

export async function readClipboardText(): Promise<string> {
  if (hasNativeCore()) return (await nativeRequest<{ text: string }>("clipboardRead")).text;
  try { return await navigator.clipboard.readText(); }
  catch { throw new AppError("CLIPBOARD"); }
}

export async function writeClipboardText(text: string): Promise<void> {
  if (hasNativeCore()) { await nativeRequest("clipboardWrite", { text }); return; }
  try { await navigator.clipboard.writeText(text); }
  catch { throw new AppError("CLIPBOARD"); }
}

export async function shareText(text: string): Promise<"shared" | "copied" | "cancelled"> {
  if (hasNativeCore()) { await nativeRequest("share", { text }); return "shared"; }
  if (navigator.share) {
    try { await navigator.share({ title: "Khoram2Ry", text }); return "shared"; }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return "cancelled"; }
  }
  await writeClipboardText(text);
  return "copied";
}

export async function exportText(text: string, filename: string, mime = "text/plain"): Promise<void> {
  if (hasNativeCore()) { await nativeRequest("saveFile", { text, filename, mime }, 180_000); return; }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function validAdvanced(s: AdvancedSettings): boolean {
  const ipv4 = (value: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(value) && value.split(".").every((n) => Number(n) <= 255);
  const range = (value: string) => {
    if (!/^\d{1,4}-\d{1,4}$/.test(value)) return false;
    const [a, b] = value.split("-").map(Number);
    return a > 0 && b >= a && b <= 5000;
  };
  try {
    return s.dns.split(",").every((ip) => ipv4(ip.trim())) &&
      Number.isInteger(s.socksPort) && s.socksPort >= 1024 && s.socksPort <= 65535 &&
      Number.isInteger(s.mtu) && s.mtu >= 1280 && s.mtu <= 9000 &&
      Number.isInteger(s.muxConcurrency) && s.muxConcurrency >= 1 && s.muxConcurrency <= 128 &&
      range(s.fragmentLength) && range(s.fragmentInterval) && new URL(s.testUrl).protocol === "https:" &&
      [s.directDomains, s.blockedDomains].every((list) => typeof list === "string" && list.split(/\r?\n/).every((domain) => !domain.trim() || /^[A-Za-z0-9._-]+$/.test(domain.trim()))) &&
      ["none", "error", "warning", "info", "debug"].includes(s.logLevel) &&
      typeof s.sniffing === "boolean" && typeof s.ipv6 === "boolean";
  } catch { return false; }
}