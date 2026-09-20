export const APP_VERSION = "2.0.1";
export const APP_VERSION_URL = "https://raw.githubusercontent.com/retardedNOTALBA/Khoram2Ry/main/public/app-version.json";
export const APP_UPDATE_URL = "https://github.com/retardedNOTALBA/Khoram2Ry/releases/latest";

export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => value.trim().replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] > bv[i] ? 1 : -1;
  }
  return 0;
}
