export function uid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${Math.max(0, Math.floor(n))} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(v >= 10 ? 1 : 2)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x: number) => x.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function timeAgo(ts: number | undefined, neverLabel: string): string {
  if (!ts) return neverLabel;
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function protoColor(p: string): string {
  switch (p) {
    case "vless":
      return "from-teal-400 to-cyan-300";
    case "vmess":
      return "from-indigo-400 to-sky-400";
    case "trojan":
      return "from-amber-400 to-orange-400";
    case "ss":
      return "from-fuchsia-400 to-pink-400";
    case "hy2":
      return "from-emerald-400 to-lime-300";
    case "tuic":
      return "from-violet-400 to-purple-300";
    default:
      return "from-zinc-400 to-zinc-300";
  }
}

export function protoBadge(p: string): string {
  switch (p) {
    case "vless":
      return "bg-teal-400/15 text-teal-300 ring-teal-400/20";
    case "vmess":
      return "bg-indigo-400/15 text-indigo-300 ring-indigo-400/20";
    case "trojan":
      return "bg-amber-400/15 text-amber-300 ring-amber-400/20";
    case "ss":
      return "bg-fuchsia-400/15 text-fuchsia-300 ring-fuchsia-400/20";
    case "hy2":
      return "bg-emerald-400/15 text-emerald-300 ring-emerald-400/20";
    case "tuic":
      return "bg-violet-400/15 text-violet-300 ring-violet-400/20";
    default:
      return "bg-white/10 text-white/70 ring-white/10";
  }
}

export function latencyColor(ms?: number | null): string {
  if (ms == null) return "text-white/35";
  if (ms < 180) return "text-teal-300";
  if (ms < 400) return "text-amber-300";
  return "text-rose-300";
}
