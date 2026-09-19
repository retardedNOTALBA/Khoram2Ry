export type Protocol =
  | "vmess"
  | "vless"
  | "trojan"
  | "ss"
  | "ssr"
  | "hy2"
  | "tuic"
  | "custom"
  | "unknown";

export type Transport = "tcp" | "ws" | "grpc" | "httpupgrade" | "splithttp" | "kcp" | "quic" | "h2";
export type Security = "none" | "tls" | "reality" | "xtls";
export type Tab = "home" | "servers" | "subs" | "settings";
export type Lang = "fa" | "en";
export type Routing = "smart" | "global" | "direct";
export type Theme = "night" | "oled";

export interface Profile {
  id: string;
  name: string;
  protocol: Protocol;
  host: string;
  port: number;
  uuid?: string;
  password?: string;
  transport?: string;
  security?: string;
  sni?: string;
  path?: string;
  alpn?: string;
  fp?: string;
  flow?: string;
  publicKey?: string;
  shortId?: string;
  hostHeader?: string;
  method?: string;
  allowInsecure?: boolean;
  params?: Record<string, string>;
  raw: string;
  subId?: string;
  latency?: number | null;
  testedAt?: number;
  favorite?: boolean;
  createdAt: number;
  geo?: ServerGeo;
}

export interface ServerGeo {
  ip: string;
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  isp?: string;
  asn?: string;
  checkedAt: number;
}

export interface Subscription {
  id: string;
  name: string;
  url: string;
  lastUpdated?: number;
  enabled: boolean;
  autoUpdate: boolean;
  error?: string;
}

export interface AdvancedSettings {
  dns: string;
  socksPort: number;
  mtu: number;
  sniffing: boolean;
  ipv6: boolean;
  muxConcurrency: number;
  fragmentLength: string;
  fragmentInterval: string;
  logLevel: "none" | "error" | "warning" | "info" | "debug";
  testUrl: string;
  directDomains: string;
  blockedDomains: string;
}

export interface TunnelStatus {
  available: boolean;
  state: "disconnected" | "connecting" | "connected" | "disconnecting";
  core: string;
  profileId: string | null;
  uploaded: number | null;
  downloaded: number | null;
  elapsedMs: number;
}

export interface AppLog {
  id: string;
  time: number;
  level: "info" | "ok" | "warn" | "err";
  message: string;
}

export interface AppState {
  profiles: Profile[];
  subs: Subscription[];
  selectedId: string | null;
  lang: Lang;
  routing: Routing;
  theme: Theme;
  mux: boolean;
  fragment: boolean;
  advanced: AdvancedSettings;
  onboarded: boolean;
  autoConnect: boolean;
  autoReconnect: boolean;
  autoFastest: boolean;
}

export type SmartPhase =
  | "idle"
  | "updating"
  | "testing"
  | "connecting"
  | "done"
  | "failed";
