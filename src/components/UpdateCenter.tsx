import { useEffect, useRef } from "react";
import { ArrowRight, BadgeCheck, Download, ExternalLink, LockKeyhole, Sparkles, X } from "lucide-react";
import { APP_REPOSITORY_URL, APP_UPDATE_URL, type UpdateDescriptor } from "../lib/appVersion";
import type { Lang } from "../types";
import { cn } from "../utils/cn";
import { KhoramMark } from "./KhoramMark";
import { textFor } from "./ui";

export function UpdateCenter({ update, currentVersion, required, lang, onClose }: {
  update: UpdateDescriptor;
  currentVersion: string;
  required: boolean;
  lang: Lang;
  onClose: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const t = textFor(lang);
  const destination = update.updateUrl || APP_UPDATE_URL;
  let sourceHost = "github.com";
  try { sourceHost = new URL(destination).host.replace(/^www\./, ""); } catch { /* fallback to the official GitHub host */ }
  const fromGitHub = sourceHost.toLowerCase() === "github.com";
  const localizedNotes = lang === "fa" && Array.isArray(update.notesFa) ? update.notesFa : update.notes;
  const notes = Array.isArray(localizedNotes) ? localizedNotes.filter((note) => typeof note === "string" && note.trim()).slice(0, 4) : [];
  const releaseName = lang === "fa" && update.releaseNameFa ? update.releaseNameFa : update.releaseName;
  const message = lang === "fa" && update.messageFa ? update.messageFa : update.message;
  const published = formatReleaseDate(update.publishedAt, lang);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    card.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !required) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(card.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') || []);
      if (!items.length) { event.preventDefault(); card.current?.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === card.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [onClose, required]);

  return <div className="update-center-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !required) onClose(); }}>
    <section ref={card} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="update-center-title" className={cn("update-center-card", required && "is-required")}>
      <div className="update-center-grid" aria-hidden="true" />
      {!required && <button type="button" className="update-center-close" onClick={onClose} aria-label={t("بعداً یادآوری کن", "Remind me later")}><X size={17} /></button>}

      <div className="update-center-visual" aria-hidden="true">
        <span className="update-orbit orbit-a" /><span className="update-orbit orbit-b" /><span className="update-orbit-node node-a" /><span className="update-orbit-node node-b" />
        <span className="update-mark"><KhoramMark state="connected" /></span>
        <span className="update-spark"><Sparkles size={13} /></span>
      </div>

      <div className={cn("update-center-status", required && "is-required")}>
        {required ? <LockKeyhole size={12} /> : <Sparkles size={12} />}
        <span>{required ? t("آپدیت ضروری", "REQUIRED UPDATE") : t("آپدیت جدید", "NEW UPDATE")}</span>
      </div>

      <h2 id="update-center-title">{required ? t("برای ادامه، برنامه را به‌روز کن", "Update required to continue") : t("نسخه جدید آماده است", "A new update is ready")}</h2>
      <p className="update-center-release">{releaseName || `Khoram2Ry ${update.latestVersion}`}</p>

      <div className="update-version-track" dir="ltr">
        <div><span>CURRENT</span><strong className="latin">v{currentVersion}</strong></div>
        <span className="update-version-line"><i /><ArrowRight size={15} /><i /></span>
        <div className="is-latest"><span>LATEST</span><strong className="latin">v{update.latestVersion}</strong></div>
      </div>

      <p className="update-center-message">{message || t("نسخه تازه با آخرین بهبودها و اصلاحات منتشر شده و از منبع رسمی قابل دریافت است.", "The latest improvements and fixes are ready from the official release source.")}</p>

      {notes.length > 0 && <div className="update-notes">
        <p>{t("تازه‌های این نسخه", "WHAT'S NEW")}</p>
        <ul>{notes.map((note, index) => <li key={`${index}-${note}`}><BadgeCheck size={14} /><span>{note}</span></li>)}</ul>
      </div>}

      <div className="update-source-card">
        <span className="update-source-icon">{fromGitHub ? <GitHubMark size={21} /> : <Download size={20} />}</span>
        <span className="update-source-copy"><strong>{fromGitHub ? "GitHub Releases" : t("منبع رسمی دریافت", "Official download source")}</strong><small className="latin">{sourceHost}{published ? ` · ${published}` : ""}</small></span>
        <BadgeCheck size={18} className="update-verified" />
      </div>

      <div className="update-center-actions">
        <a href={destination} target="_blank" rel="noreferrer" className="update-primary-action"><GitHubMark size={17} /><span>{fromGitHub ? t("دریافت از GitHub", "Download on GitHub") : t("دریافت آپدیت", "Get the update")}</span><ExternalLink size={14} /></a>
        {!required && <button type="button" onClick={onClose}>{t("فعلاً نه", "Maybe later")}</button>}
      </div>

      <a href={APP_REPOSITORY_URL} target="_blank" rel="noreferrer" className="update-repository-link"><BadgeCheck size={13} />{t("انتشار رسمی پروژه Khoram2Ry", "Official Khoram2Ry project release")}<ExternalLink size={11} /></a>
    </section>
  </div>;
}

function GitHubMark({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.21-3.37-1.21-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.37 9.37 0 0 1 12 6.96c.85 0 1.7.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.89 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.2 10.2 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
  </svg>;
}

function formatReleaseDate(value: string | undefined, lang: Lang): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", { year: "numeric", month: "short", day: "numeric" });
}
