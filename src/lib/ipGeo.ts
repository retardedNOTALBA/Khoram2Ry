import type { ServerGeo } from "../types";

type DnsAnswer = { Answer?: Array<{ type: number; data: string }> };

const cache = new Map<string, ServerGeo>();

function isIp(host: string): boolean {
  const h = host.trim().replace(/^\[|\]$/g, "");
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(":");
}

async function resolveHost(host: string): Promise<string> {
  const clean = host.trim().replace(/^\[|\]$/g, "");
  if (isIp(clean)) return clean;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(clean)}&type=A`;
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/dns-json" },
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("DNS_FAILED");
    const data = (await response.json()) as DnsAnswer;
    const answer = data.Answer?.find((item) => item.type === 1 && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(item.data));
    if (answer) return answer.data;

    const ipv6Response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(clean)}&type=AAAA`, {
      signal: controller.signal, cache: "no-store", headers: { Accept: "application/dns-json" }, referrerPolicy: "no-referrer",
    });
    if (!ipv6Response.ok) throw new Error("DNS_FAILED");
    const ipv6Data = (await ipv6Response.json()) as DnsAnswer;
    const ipv6 = ipv6Data.Answer?.find((item) => item.type === 28 && item.data.includes(":"));
    if (ipv6) return ipv6.data;
    throw new Error("IP_NOT_FOUND");
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupServerGeo(host: string): Promise<ServerGeo> {
  const clean = host.trim().replace(/^\[|\]$/g, "");
  const cached = cache.get(clean);
  if (cached && Date.now() - cached.checkedAt < 24 * 60 * 60_000) return cached;

  const ip = await resolveHost(clean);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal, cache: "no-store", referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("GEO_FAILED");
    const data = await response.json() as {
      success?: boolean; country?: string; country_code?: string; city?: string;
      region?: string; connection?: { isp?: string; asn?: number | string };
    };
    if (data.success === false) throw new Error("GEO_FAILED");
    const geo: ServerGeo = {
      ip,
      country: data.country,
      countryCode: data.country_code,
      city: data.city,
      region: data.region,
      isp: data.connection?.isp,
      asn: data.connection?.asn != null ? String(data.connection.asn) : undefined,
      checkedAt: Date.now(),
    };
    cache.set(clean, geo);
    return geo;
  } finally {
    clearTimeout(timer);
  }
}
