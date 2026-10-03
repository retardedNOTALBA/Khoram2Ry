export const APP_VERSION = "2.2.0";
export const APP_VERSION_URL = "https://raw.githubusercontent.com/retardedNOTALBA/Khoram2Ry/main/public/app-version.json";
export const APP_UPDATE_URL = "https://github.com/retardedNOTALBA/Khoram2Ry/releases/latest";
export const APP_REPOSITORY_URL = "https://github.com/retardedNOTALBA/Khoram2Ry";

export interface UpdateDescriptor {
  latestVersion: string;
  minVersion?: string;
  updateUrl?: string;
  message?: string;
  messageFa?: string;
  releaseName?: string;
  releaseNameFa?: string;
  publishedAt?: string;
  notes?: string[];
  notesFa?: string[];
}

export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => {
    const parts = value.trim().replace(/^v/i, "").split(".");
    return [0, 1, 2].map((index) => Number.parseInt(parts[index] || "0", 10) || 0);
  };
  const av = parse(a);
  const bv = parse(b);
  for (let i = 0; i < 3; i++) {
    if (av[i] !== bv[i]) return av[i] > bv[i] ? 1 : -1;
  }
  return 0;
}
