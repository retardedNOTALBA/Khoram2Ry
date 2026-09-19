import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { Loader2, X, AlertCircle } from "lucide-react";
import { cn } from "../utils/cn";
import type { Lang } from "../types";

export type Text = (fa: string, en: string) => string;
export const textFor = (lang: Lang): Text => (fa, en) => lang === "fa" ? fa : en;

export function Button({ children, className, tone = "secondary", busy, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "secondary" | "danger"; busy?: boolean }) {
  return <button type="button" {...props} disabled={props.disabled || busy} className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-medium transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40", tone === "primary" ? "bg-teal-300 text-zinc-950" : tone === "danger" ? "bg-rose-500/10 text-rose-300" : "bg-white/6 text-white/80", className)}>
    {busy && <Loader2 size={16} className="animate-spin" />}{children}
  </button>;
}

export function Field({ label, value, onChange, type = "text", placeholder, dir, required, disabled, min, max }: {
  label: string; value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string;
  dir?: "ltr" | "rtl"; required?: boolean; disabled?: boolean; min?: number; max?: number;
}) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[11px] text-white/50">{label}</span>
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir={dir} required={required} disabled={disabled} min={min} max={max} autoComplete="off" spellCheck={false} className={cn("h-11 w-full rounded-xl bg-white/5 px-3 text-[13px] text-white placeholder:text-white/25 ring-1 ring-white/8 disabled:opacity-40", dir === "ltr" && "latin")} />
  </label>;
}

export function Choice({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[11px] text-white/50">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-11 w-full rounded-xl bg-[#20232b] px-3 text-[13px] text-white ring-1 ring-white/8 disabled:opacity-40">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </label>;
}

export function Toggle({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div className="flex items-center justify-between gap-5 py-2.5"><div className="min-w-0"><p className="text-[13px] text-white/85">{label}</p>{hint && <p className="mt-1 text-[11px] leading-5 text-white/40">{hint}</p>}</div>
    <button type="button" role="switch" aria-checked={value} aria-label={label} disabled={disabled} onClick={() => onChange(!value)} className={cn("relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40", value ? "bg-teal-300" : "bg-white/15")} dir="ltr"><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", value ? "left-[22px]" : "left-0.5")} /></button>
  </div>;
}

export function Notice({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return <div role={danger ? "alert" : "note"} className={cn("flex items-start gap-2 rounded-xl p-3 text-[11px] leading-6", danger ? "bg-rose-500/8 text-rose-200" : "bg-amber-300/7 text-amber-100/75")}><AlertCircle size={15} className="mt-1 shrink-0" /><div className="min-w-0">{children}</div></div>;
}

export function Dialog({ title, onClose, children, closeLabel }: { title: string; onClose: () => void; children: ReactNode; closeLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key !== "Tab") return;
      const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], summary') || []).filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handle);
    return () => { document.removeEventListener("keydown", handle); previous?.focus(); };
  }, [onClose]);
  return <div className="absolute inset-0 z-40 flex items-end bg-black/65 backdrop-blur-[3px]" onClick={onClose}>
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="animate-sheet flex max-h-[93%] w-full flex-col rounded-t-[28px] bg-[#12141b] outline-none ring-1 ring-white/8">
      <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15" />
      <div className="flex shrink-0 items-center justify-between px-5 py-4"><h2 className="text-[15px] font-semibold">{title}</h2><button onClick={onClose} aria-label={closeLabel} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5"><X size={17} /></button></div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(24px,env(safe-area-inset-bottom))] scroll-thin">{children}</div>
    </div>
  </div>;
}