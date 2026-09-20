import { useState } from "react";
import { Check, Copy, Download, FileCode2, Save, Share2, Trash2, Zap } from "lucide-react";
import type { AppState, Lang, Profile } from "../types";
import { parseProfile, encodeBase64, decodeBase64 } from "../lib/parseShare";
import { AppError, errorMessage } from "../lib/errors";
import { connectionPayload, exportText, hasNativeCore, nativeRequest, shareText, supportsNative, writeClipboardText } from "../lib/native";
import { Button, Field, Notice, textFor } from "./ui";

export function ProfileDetail({ profile, state, lang, locked, onSave, onSelect, onDelete, onTest, onToast }: {
  profile: Profile; state: AppState; lang: Lang; locked: boolean;
  onSave: (p: Profile) => void; onSelect: () => void; onDelete: () => void;
  onTest: () => Promise<void>; onToast: (message: string) => void;
}) {
  const t = textFor(lang);
  const [name, setName] = useState(profile.name);
  const [raw, setRaw] = useState(profile.raw);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const action = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setError(null); try { await fn(); } catch (e) { setError(e); } finally { setBusy(false); } };
  const save = () => {
    try {
      let text = raw.trim();
      if (text.startsWith("vmess://")) { const value = JSON.parse(decodeBase64(text.slice(8).split("#")[0])); value.ps = name; text = `vmess://${encodeBase64(JSON.stringify(value))}`; }
      else if (text.startsWith("{")) { const value = JSON.parse(text); value.remarks = name; text = JSON.stringify(value, null, 2); }
      else text = `${text.split("#")[0]}#${encodeURIComponent(name)}`;
      onSave({ ...parseProfile(text), id: profile.id, name: name.trim() || profile.host, subId: profile.subId, favorite: profile.favorite, createdAt: profile.createdAt });
    } catch (e) { setError(e instanceof AppError ? e : new AppError("INVALID_LINK")); }
  };
  const rows = [[t("پروتکل", "Protocol"), profile.protocol.toUpperCase()], [t("آدرس", "Address"), `${profile.host}${profile.port ? `:${profile.port}` : ""}`], ["Transport", profile.transport || "custom"], ["Security", profile.security || "custom"], ["SNI", profile.sni || "-"], ["Flow", profile.flow || "-"], ["Fingerprint", profile.fp || "-"]];
  return <div className="space-y-4">
    {!supportsNative(profile) && <Notice>{errorMessage(new AppError("UNSUPPORTED_PROTOCOL"), lang)}</Notice>}
    {profile.allowInsecure && <Notice danger>{t("این کانفیگ بررسی گواهی TLS را خاموش کرده است.", "This configuration disables TLS certificate verification.")}</Notice>}
    <div className="divide-y divide-white/5">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-5 py-2 text-[12px]"><span className="shrink-0 text-white/40">{label}</span><span className="latin selectable min-w-0 truncate text-white/80" dir="ltr">{value}</span></div>)}</div>
    <Field label={t("نام نمایشی", "Profile name")} value={name} onChange={setName} disabled={locked} />
    <details><summary className="cursor-pointer py-2 text-[12px] text-teal-200">{t("ویرایش لینک یا JSON کامل", "Edit share link or full JSON")}</summary><p className="my-2 text-[11px] leading-5 text-white/40">{t("تمام پارامترهای لینک حفظ می‌شوند. بروزرسانی ساب ممکن است ویرایش کانفیگ اشتراکی را جایگزین کند.", "All link parameters are preserved. Subscription updates can overwrite edits to subscribed profiles.")}</p><textarea aria-label={t("لینک خام", "Raw configuration")} value={raw} spellCheck={false} onChange={(e) => setRaw(e.target.value)} disabled={locked} dir="ltr" className="latin selectable h-40 w-full rounded-xl bg-black/25 p-3 text-[11px] leading-6 ring-1 ring-white/10" /></details>
    {(name !== profile.name || raw !== profile.raw) && <Button tone="primary" className="w-full" onClick={save} disabled={locked}><Save size={15} />{t("ذخیره و اعتبارسنجی", "Validate and save")}</Button>}
    <div className="grid grid-cols-3 gap-2"><Button busy={busy} onClick={() => void action(async () => { await writeClipboardText(profile.raw); onToast(t("کپی شد", "Copied")); })} className="px-1 text-[11px]"><Copy size={14} />{t("کپی", "Copy")}</Button><Button disabled={busy} onClick={() => void action(async () => { await shareText(profile.raw); })} className="px-1 text-[11px]"><Share2 size={14} />{t("اشتراک", "Share")}</Button><Button disabled={busy} onClick={() => void action(() => exportText(profile.raw, profile.protocol === "custom" ? "khoram-config.json" : "khoram-config.txt"))} className="px-1 text-[11px]"><Download size={14} />{t("خروجی", "Export")}</Button></div>
    <Button disabled={busy} className="w-full" onClick={() => void action(onTest)}><Zap size={15} />{t("تست واقعی از داخل پراکسی", "Real request through the proxy")}</Button>
    {hasNativeCore() && supportsNative(profile) && <Button disabled={busy || locked} className="w-full" onClick={() => void action(async () => {
      const result = await nativeRequest<{ config: string }>("exportConfig", connectionPayload(profile, state));
      await exportText(result.config, "khoram-xray.json", "application/json");
    })}><FileCode2 size={15} />{t("خروجی JSON نهایی Xray", "Export generated Xray JSON")}</Button>}
    {error != null && <Notice danger>{errorMessage(error, lang)}</Notice>}
    <div className="grid grid-cols-[1fr_auto] gap-2"><Button tone="primary" disabled={locked || busy} onClick={onSelect}><Check size={15} />{t("انتخاب این سرور", "Use this server")}</Button><Button tone="danger" disabled={locked || busy} onClick={onDelete} aria-label={t("حذف سرور", "Delete server")}><Trash2 size={15} /></Button></div>
  </div>;
}