import type { Profile, Protocol } from "../types";
import { uid } from "./format";
import { AppError } from "./errors";
import { hasNativeCore, nativeRequest } from "./native";

export const MAX_CONFIG_SIZE = 2 * 1024 * 1024;
const schemes = /^(vmess|vless|trojan|ss|ssr|hy2|hysteria2|tuic):\/\//i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeBase64(input: string): string {
  const value = input.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0))); }
  catch { return ""; }
}

export function encodeBase64(input: string): string {
  return btoa(Array.from(new TextEncoder().encode(input), (byte) => String.fromCharCode(byte)).join(""));
}

const decode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };
const bareHost = (value: string) => value.replace(/^\[/, "").replace(/\]$/, "");
const authority = (host: string) => host.includes(":") ? `[${bareHost(host)}]` : host;

function portOf(value: unknown, fallback = 443): number {
  const number = value === "" || value == null ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 65535) throw new AppError("INVALID_PORT");
  return number;
}

function validateHost(host: string) {
  if (!host || /[\s/@?#]/.test(host)) throw new AppError("INVALID_LINK");
  try { new URL(`https://${authority(host)}`); } catch { throw new AppError("INVALID_LINK"); }
}

export function parseProfile(rawInput: string): Profile {
  const raw = rawInput.trim();
  if (!raw || raw.length > MAX_CONFIG_SIZE) throw new AppError(raw ? "TOO_LARGE" : "EMPTY_IMPORT");
  const profile: Profile = { id: uid(), name: "", host: "", port: 443, protocol: "unknown", raw, createdAt: Date.now() };
  if (raw.startsWith("{")) {
    try {
      const config = JSON.parse(raw);
      if (!config || !Array.isArray(config.outbounds) || !config.outbounds.length || !Array.isArray(config.inbounds)) throw new Error();
      if (!config.outbounds.every((out: unknown) => out && typeof out === "object" && typeof (out as { protocol?: unknown }).protocol === "string")) throw new Error();
      const proxy = config.outbounds.find((out: { protocol: string }) => !["freedom", "blackhole", "dns"].includes(out.protocol)) || config.outbounds[0];
      const endpoint = proxy.settings?.vnext?.[0] || proxy.settings?.servers?.[0];
      return { ...profile, protocol: "custom", name: String(config.remarks || "Xray JSON"), host: String(endpoint?.address || "custom"), port: Number(endpoint?.port) || 0 };
    } catch { throw new AppError("INVALID_JSON"); }
  }
  if (!schemes.test(raw)) throw new AppError("INVALID_LINK");
  const scheme = raw.slice(0, raw.indexOf(":" )).toLowerCase();
  profile.protocol = (scheme === "hysteria2" ? "hy2" : scheme) as Protocol;
  const hash = raw.indexOf("#");
  const link = hash < 0 ? raw : raw.slice(0, hash);
  profile.name = hash < 0 ? "" : decode(raw.slice(hash + 1));

  if (scheme === "vmess") {
    let config;
    try { config = JSON.parse(decodeBase64(link.slice(8))); } catch { throw new AppError("INVALID_LINK"); }
    if (!config || typeof config !== "object") throw new AppError("INVALID_LINK");
    Object.assign(profile, {
      host: String(config.add || ""), port: portOf(config.port), uuid: String(config.id || ""),
      name: String(config.ps || profile.name), transport: String(config.net || "tcp"),
      security: config.tls || "none", sni: config.sni || undefined, hostHeader: config.host || undefined,
      path: config.path, alpn: config.alpn, fp: config.fp,
      params: Object.fromEntries(Object.entries(config).map(([key, value]) => [key, String(value)])),
    });
  } else if (scheme === "ss") {
    let body = link.slice(5);
    if (!body.includes("@")) body = decodeBase64(body);
    const at = body.lastIndexOf("@");
    if (at < 1) throw new AppError("INVALID_LINK");
    let credentials = decode(body.slice(0, at));
    if (!credentials.includes(":")) credentials = decodeBase64(credentials);
    const colon = credentials.indexOf(":");
    if (colon < 1) throw new AppError("INVALID_LINK");
    let url: URL;
    try { url = new URL(`ss://x@${body.slice(at + 1)}`); } catch { throw new AppError("INVALID_LINK"); }
    Object.assign(profile, {
      host: bareHost(url.hostname), port: portOf(url.port), method: credentials.slice(0, colon),
      password: credentials.slice(colon + 1), security: "none", transport: "tcp",
      params: Object.fromEntries(url.searchParams),
    });
    if (!profile.password) throw new AppError("INVALID_LINK");
  } else if (scheme === "ssr") {
    const text = decodeBase64(link.slice(6));
    const [body, query = ""] = text.split("/?");
    const fields = body?.split(":") || [];
    if (fields.length < 6) throw new AppError("INVALID_LINK");
    profile.host = fields[0]; profile.port = portOf(fields[1]);
    profile.name ||= decodeBase64(new URLSearchParams(query).get("remarks") || "");
  } else {
    let url: URL;
    try { url = new URL(link); } catch { throw new AppError("INVALID_LINK"); }
    const params = Object.fromEntries(url.searchParams);
    const credential = decode(url.username);
    Object.assign(profile, {
      host: bareHost(url.hostname), port: portOf(url.port), uuid: credential,
      password: decode(url.password) || credential, params,
      transport: params.type || params.net || "tcp",
      security: params.security || (["trojan", "hy2", "hysteria2", "tuic"].includes(scheme) ? "tls" : "none"),
      sni: params.sni || params.peer, hostHeader: params.host,
      path: params.path || params.serviceName, alpn: params.alpn, fp: params.fp, flow: params.flow,
      publicKey: params.pbk, shortId: params.sid,
      allowInsecure: params.allowInsecure === "1" || params.insecure === "1" || params.allowInsecure === "true",
    });
    if (!credential) throw new AppError("INVALID_LINK");
  }
  validateHost(profile.host);
  if (["vmess", "vless", "tuic"].includes(profile.protocol) && !uuidPattern.test(profile.uuid || "")) throw new AppError("INVALID_UUID");
  if (profile.security === "reality") {
    if (!profile.sni || !/^[A-Za-z0-9_-]{43}=?$/.test(profile.publicKey || "") || !/^(?:[0-9a-fA-F]{2}){0,8}$/.test(profile.shortId || "")) throw new AppError("INVALID_REALITY");
  }
  profile.name ||= profile.host;
  return profile;
}

export function parseLink(link: string): Profile | null {
  try { return parseProfile(link); } catch { return null; }
}

export interface ImportReport {
  profiles: Profile[];
  invalid: { line: number; code: string }[];
  duplicates: number;
}

export function inspectImport(text: string): ImportReport {
  if (text.length > MAX_CONFIG_SIZE) throw new AppError("TOO_LARGE");
  let content = text.replace(/^\uFEFF/, "").trim();
  if (!content.startsWith("{") && !content.startsWith("[") && !schemes.test(content)) {
    const decoded = decodeBase64(content);
    if (decoded) content = decoded;
  }
  let lines: string[];
  if (content.startsWith("[")) {
    try { const items = JSON.parse(content); lines = items.map((item: unknown) => typeof item === "string" ? item : JSON.stringify(item)); }
    catch { throw new AppError("INVALID_JSON"); }
  } else lines = content.startsWith("{") ? [content] : content.split(/\r?\n/);
  const report: ImportReport = { profiles: [], invalid: [], duplicates: 0 };
  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const raw = line.trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("//")) return;
    if (seen.has(raw)) { report.duplicates++; return; }
    try { report.profiles.push(parseProfile(raw)); seen.add(raw); }
    catch (error) { report.invalid.push({ line: index + 1, code: error instanceof AppError ? error.code : "INVALID_LINK" }); }
  });
  return report;
}

export const parseMany = (text: string) => inspectImport(text).profiles;

export interface ManualConfig {
  protocol: Protocol; name: string; host: string; port: number; uuid?: string; password?: string;
  transport?: string; security?: string; sni?: string; path?: string; hostHeader?: string;
  fp?: string; flow?: string; publicKey?: string; shortId?: string; alpn?: string; method?: string;
}

export function buildShareLink(p: ManualConfig): string {
  validateHost(p.host);
  const port = portOf(p.port);
  const hash = encodeURIComponent(p.name || p.host);
  if (p.protocol === "vmess") return `vmess://${encodeBase64(JSON.stringify({
    v: "2", ps: p.name || p.host, add: bareHost(p.host), port: String(port), id: p.uuid,
    aid: "0", scy: "auto", net: p.transport || "tcp", type: "none", host: p.hostHeader || "",
    path: p.path || "", tls: p.security === "tls" ? "tls" : "", sni: p.sni || "", alpn: p.alpn || "", fp: p.fp || "",
  }))}`;
  if (p.protocol === "ss") {
    if (!p.method || !p.password) throw new AppError("INVALID_LINK");
    return `ss://${encodeBase64(`${p.method}:${p.password}`).replace(/=+$/, "")}@${authority(p.host)}:${port}#${hash}`;
  }
  if (!["vless", "trojan"].includes(p.protocol)) throw new AppError("UNSUPPORTED_PROTOCOL");
  const q = new URLSearchParams();
  const values: Record<string, string | undefined> = {
    type: p.transport || "tcp", security: p.security || "none", sni: p.sni, host: p.hostHeader,
    [p.transport === "grpc" ? "serviceName" : "path"]: p.path,
    fp: p.fp, flow: p.flow, pbk: p.publicKey, sid: p.shortId, alpn: p.alpn,
  };
  if (p.protocol === "vless") q.set("encryption", "none");
  Object.entries(values).forEach(([key, value]) => { if (value) q.set(key, value); });
  return `${p.protocol}://${encodeURIComponent(p.protocol === "trojan" ? p.password || p.uuid || "" : p.uuid || "")}@${authority(p.host)}:${port}?${q}#${hash}`;
}

export function validateSubscriptionUrl(input: string): string {
  try {
    if (/\s/.test(input.trim())) throw new Error();
    const url = new URL(input.trim());
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw new AppError("INVALID_URL"); }
}

// A subscription URL is a secret. Never pass it through a public CORS relay.
export async function fetchSubscription(input: string): Promise<string> {
  const url = validateSubscriptionUrl(input);
  if (hasNativeCore()) return (await nativeRequest<{ body: string }>("fetchSubscription", { url }, 25_000)).body;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" });
    if (!res.ok) throw new AppError("FETCH_FAILED");
    if (Number(res.headers.get("content-length")) > MAX_CONFIG_SIZE) throw new AppError("TOO_LARGE");
    const reader = res.body?.getReader();
    if (!reader) throw new AppError("FETCH_FAILED");
    const decoder = new TextDecoder();
    let body = "", size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CONFIG_SIZE) { await reader.cancel(); throw new AppError("TOO_LARGE"); }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("FETCH_FAILED");
  } finally { clearTimeout(timer); }
}