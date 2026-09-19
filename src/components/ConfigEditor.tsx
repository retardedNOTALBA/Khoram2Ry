import { useMemo, useRef, useState } from "react";
import { ClipboardPaste, FileUp, QrCode, Check, ChevronDown } from "lucide-react";
import type { Lang, Profile, Protocol, Subscription } from "../types";
import { buildShareLink, inspectImport, MAX_CONFIG_SIZE, parseProfile, validateSubscriptionUrl, type ManualConfig } from "../lib/parseShare";
import { AppError, errorMessage } from "../lib/errors";
import { readClipboardText } from "../lib/native";
import { readQrImage } from "../lib/qr";
import { Button, Choice, Field, Notice, textFor, Toggle } from "./ui";
import { cn } from "../utils/cn";

export function ConfigEditor({ lang, onImport, onSubscription }: { lang: Lang; onImport: (profiles: Profile[]) => void; onSubscription: (url: string) => void }) {
  const t = textFor(lang);
  const [mode, setMode] = useState<"link" | "manual">("link");
  const [text, setText] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const qr = useRef<HTMLInputElement>(null);
  const [manual, setManual] = useState<ManualConfig>({ protocol: "vless", name: "", host: "", port: 443, uuid: "", password: "", transport: "tcp", security: "tls", path: "", fp: "chrome", method: "chacha20-ietf-poly1305" });
  const set = (key: keyof ManualConfig, value: string | number) => setManual((prev) => ({ ...prev, [key]: value }));
  const preview = useMemo(() => { try { return text.trim() ? inspectImport(text) : null; } catch { return null; } }, [text]);
  const subscriptionUrl = useMemo(() => { try { return validateSubscriptionUrl(text.trim()); } catch { return null; } }, [text]);
  const run = async (action: () => Promise<void>) => {
    setLoading(true); setError(null);
    try { await action(); } catch (e) { setError(e); } finally { setLoading(false); }
  };
  const loadFile = (file?: File, image = false) => {
    if (!file) return;
    void run(async () => {
      if (!image && file.size > MAX_CONFIG_SIZE) throw new AppError("TOO_LARGE");
      setText(image ? await readQrImage(file) : await file.text());
      setMode("link");
    });
  };
  const submit = () => {
    setError(null);
    try {
      if (mode === "link" && subscriptionUrl) { onSubscription(subscriptionUrl); return; }
      const profiles = mode === "manual" ? [parseProfile(buildShareLink(manual))] : inspectImport(text).profiles;
      if (!profiles.length) throw new AppError("EMPTY_IMPORT");
      onImport(profiles);
    } catch (e) { setError(e); }
  };
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">{(["link", "manual"] as const).map((m) => <button type="button" key={m} onClick={() => { setMode(m); setError(null); }} className={cn("h-10 rounded-lg text-[12px]", mode === m ? "bg-white/10 text-white" : "text-white/45")}>{m === "link" ? t("لینک / JSON / فایل", "Link / JSON / file") : t("ورود دستی", "Manual configuration")}</button>)}</div>
    {mode === "link" ? <>
      <p className="text-[12px] leading-6 text-white/45">{t("فقط کانفیگ‌های خودت را وارد کن. لینک تکی، لیست Base64 یا JSON کامل Xray پذیرفته می‌شود.", "Import your own configurations: share links, a Base64 list or full Xray JSON.")}</p>
      <textarea aria-label={t("کانفیگ", "Configuration")} dir="ltr" value={text} spellCheck={false} onChange={(e) => { setText(e.target.value); setError(null); }} placeholder="vless://...\nvmess://...\n{ ... }" className="latin selectable h-44 w-full resize-y rounded-2xl bg-black/25 p-3 text-[12px] leading-6 text-white/85 ring-1 ring-white/8 placeholder:text-white/25" />
      <div className="grid grid-cols-3 gap-2">
        <Button disabled={loading} className="px-1 text-[11px]" onClick={() => void run(async () => { setText(await readClipboardText()); })}><ClipboardPaste size={14} />{t("چسباندن", "Paste")}</Button>
        <Button disabled={loading} className="px-1 text-[11px]" onClick={() => input.current?.click()}><FileUp size={14} />{t("فایل", "File")}</Button>
        <Button disabled={loading} className="px-1 text-[11px]" onClick={() => qr.current?.click()}><QrCode size={14} />{t("تصویر QR", "QR image")}</Button>
      </div>
      <input className="hidden" ref={input} type="file" accept=".txt,.json,.conf,application/json,text/plain" onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input className="hidden" ref={qr} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { loadFile(e.target.files?.[0], true); e.target.value = ""; }} />
      {subscriptionUrl && <Notice>{t("این یک ساب‌لینک است. در مرحله بعد می‌توانی آن را ثبت کنی؛ هنوز درخواستی ارسال نشده.", "This is a subscription URL. Continue to review it before fetching. No request has been sent.")}</Notice>}
      {!subscriptionUrl && preview && <div className="space-y-2 text-[12px]"><p className="flex items-center gap-2 text-teal-200"><Check size={14} />{preview.profiles.length} {t("کانفیگ معتبر", "valid configurations")}{preview.duplicates > 0 && ` / ${preview.duplicates} ${t("تکراری", "duplicates")}`}</p>
        {preview.invalid.length > 0 && <Notice danger>{preview.invalid.length} {t("مورد نامعتبر اضافه نمی‌شود.", "invalid entries will not be imported.")}<br />{t("خط", "Line")} {preview.invalid[0].line}: {errorMessage(new AppError(preview.invalid[0].code), lang)}</Notice>}
      </div>}
    </> : <div className="space-y-3">
      <Choice label={t("پروتکل", "Protocol")} value={manual.protocol} onChange={(v) => setManual((p) => ({ ...p, protocol: v as Protocol, security: v === "ss" ? "none" : "tls", transport: "tcp", flow: "" }))} options={["vless", "vmess", "trojan", "ss"].map((p) => ({ value: p, label: p.toUpperCase() }))} />
      <Field label={t("نام نمایشی", "Name")} value={manual.name} onChange={(v) => set("name", v)} />
      <div className="grid grid-cols-[1fr_86px] gap-2"><Field label={t("آدرس سرور", "Server address")} value={manual.host} dir="ltr" onChange={(v) => set("host", v.trim())} required /><Field label={t("پورت", "Port")} value={manual.port || ""} type="number" dir="ltr" onChange={(v) => set("port", Number(v))} min={1} max={65535} /></div>
      {["vmess", "vless"].includes(manual.protocol) ? <Field label="UUID" value={manual.uuid || ""} onChange={(v) => set("uuid", v.trim())} dir="ltr" /> : <Field label={t("رمز عبور", "Password")} value={manual.password || ""} type="password" onChange={(v) => set("password", v)} dir="ltr" />}
      {manual.protocol === "ss" ? <Choice label={t("روش رمزنگاری", "Encryption method")} value={manual.method || ""} onChange={(v) => set("method", v)} options={["chacha20-ietf-poly1305", "aes-128-gcm", "aes-256-gcm", "2022-blake3-aes-128-gcm", "2022-blake3-aes-256-gcm", "2022-blake3-chacha20-poly1305"].map((v) => ({ value: v, label: v }))} /> : <>
        <div className="grid grid-cols-2 gap-2"><Choice label="Transport" value={manual.transport || "tcp"} onChange={(v) => set("transport", v)} options={(manual.protocol === "vmess" ? ["tcp", "ws", "grpc", "httpupgrade"] : ["tcp", "ws", "grpc", "xhttp", "httpupgrade"]).map((v) => ({ value: v, label: v }))} /><Choice label={t("امنیت", "Security")} value={manual.security || "none"} onChange={(v) => set("security", v)} options={(manual.protocol === "vless" ? ["none", "tls", "reality"] : ["none", "tls"]).map((v) => ({ value: v, label: v.toUpperCase() }))} /></div>
        {manual.security !== "none" && <><Field label="SNI / Server name" value={manual.sni || ""} onChange={(v) => set("sni", v)} dir="ltr" /><Choice label="Fingerprint" value={manual.fp || "chrome"} onChange={(v) => set("fp", v)} options={["chrome", "firefox", "safari", "ios", "android", "randomized"].map((v) => ({ value: v, label: v }))} /></>}
        {manual.security === "reality" && <><Field label="Reality public key (pbk)" value={manual.publicKey || ""} onChange={(v) => set("publicKey", v.trim())} dir="ltr" /><Field label="Short ID (sid)" value={manual.shortId || ""} onChange={(v) => set("shortId", v.trim())} dir="ltr" /></>}
        {manual.transport !== "tcp" && <><Field label={manual.transport === "grpc" ? "gRPC serviceName" : "Path"} value={manual.path || ""} onChange={(v) => set("path", v)} dir="ltr" /><Field label="Host header" value={manual.hostHeader || ""} onChange={(v) => set("hostHeader", v)} dir="ltr" /></>}
        <details><summary className="flex cursor-pointer items-center justify-between py-3 text-[12px] text-white/50">{t("پارامترهای بیشتر", "More parameters")}<ChevronDown size={14} /></summary><div className="space-y-3 pb-2">
          {manual.protocol === "vless" && <Choice label="Flow" value={manual.flow || ""} onChange={(v) => set("flow", v)} options={[{ value: "", label: t("بدون Flow", "None") }, { value: "xtls-rprx-vision", label: "xtls-rprx-vision" }]} />}
          <Field label="ALPN" value={manual.alpn || ""} placeholder="h2,http/1.1" onChange={(v) => set("alpn", v)} dir="ltr" />
        </div></details>
      </>}
    </div>}
    {error != null && <Notice danger>{errorMessage(error, lang)}</Notice>}
    <Button tone="primary" className="w-full" disabled={loading || (mode === "link" && !text.trim())} onClick={submit}>{mode === "link" && subscriptionUrl ? t("ادامه برای ثبت اشتراک", "Continue with subscription") : t("افزودن کانفیگ‌های معتبر", "Add valid configurations")}</Button>
    <p className="text-center text-[10px] leading-5 text-white/30">{t("هیچ سرور پیش‌فرضی اضافه نمی‌شود. اطلاعات روی همین دستگاه ذخیره می‌شود.", "No bundled servers. Configurations are stored on this device.")}</p>
  </div>;
}

export function SubscriptionForm({ lang, initial, incomingUrl = "", onSave }: { lang: Lang; initial?: Subscription; incomingUrl?: string; onSave: (value: { name: string; url: string; body: string; autoUpdate: boolean }) => Promise<void> }) {
  const t = textFor(lang);
  const [name, setName] = useState(initial?.name || "");
  const [url, setUrl] = useState(initial?.url || incomingUrl);
  const [body, setBody] = useState("");
  const [auto, setAuto] = useState(initial?.autoUpdate || false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(null);
    try { const clean = validateSubscriptionUrl(url); await onSave({ name: name.trim() || new URL(clean).hostname, url: clean, body, autoUpdate: auto }); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }}>
    <Field label={t("نام اشتراک", "Subscription name")} value={name} onChange={setName} disabled={busy} />
    <Field label={t("ساب‌لینک خصوصی شما", "Your private subscription URL")} value={url} onChange={setUrl} type="url" dir="ltr" placeholder="https://" required disabled={busy} />
    <label className="block"><span className="mb-2 block text-[11px] text-white/45">{t("یا محتوای ساب (اختیاری، بدون درخواست شبکه)", "Or subscription body (optional, no network request)")}</span><textarea dir="ltr" spellCheck={false} value={body} disabled={busy} onChange={(e) => setBody(e.target.value)} className="latin h-24 w-full rounded-xl bg-white/5 p-3 text-[12px] ring-1 ring-white/8" /></label>
    <Toggle label={t("بررسی روزانه هنگام باز کردن اپ", "Check daily on app launch")} value={auto} onChange={setAuto} disabled={busy} />
    <p className="text-[11px] leading-6 text-white/40">{t("دریافت فقط از آدرس خودتان انجام می‌شود؛ لینک به پراکسی عمومی ارسال نمی‌شود. در وب، محدودیت CORS ممکن است مانع دریافت شود.", "Fetched directly from your URL, never through public proxies. Browser CORS may block retrieval.")}</p>
    {error != null && <Notice danger>{errorMessage(error, lang)}</Notice>}
    <Button type="submit" tone="primary" busy={busy} className="w-full">{t("ذخیره و دریافت سرورها", "Save and fetch servers")}</Button>
  </form>;
}