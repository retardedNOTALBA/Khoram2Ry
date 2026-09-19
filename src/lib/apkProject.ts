import JSZip from "jszip";
import { AppError } from "./errors";

// Export the source project, not the currently served HTML or private localStorage data.
const sourceFiles = import.meta.glob<string>([
  "/src/**/*.{ts,tsx,css}", "/native/**/*.{kt,py,md}", "/tests/*.ts",
  "/.github/workflows/android.yml", "/index.html", "/package.json",
  "/tsconfig.json", "/vite.config.ts", "/public/manifest.json", "/public/sw.js",
], { query: "?raw", import: "default", eager: true });

export async function buildAndroidZip(): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(sourceFiles)) zip.file(path.replace(/^\//, ""), content);
  if (!zip.file("native/KhoramActivity.kt") || !zip.file(".github/workflows/android.yml")) throw new AppError("BUILD_EXPORT_FAILED");
  const response = await fetch("/icon.png", { cache: "no-store" });
  if (!response.ok || !response.headers.get("content-type")?.includes("image")) throw new AppError("BUILD_EXPORT_FAILED");
  zip.file("public/icon.png", await response.blob());
  zip.file(".gitignore", "node_modules/\ndist/\nbuild/\nartifacts/\n*.keystore\n*.jks\n.env*\n");
  zip.file("README.md", sourceFiles["/native/README-FA.md"] || "See native/README-FA.md");
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}