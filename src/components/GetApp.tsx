import { useState } from "react";
import { Check, Download, RefreshCw, ShieldCheck, Smartphone, Sparkles, Zap } from "lucide-react";
import type { Lang } from "../types";
import { buildAndroidZip, saveBlob } from "../lib/apkProject";
import { Button, Notice, textFor } from "./ui";

export function GetApp({ lang, native, onError }: { lang: Lang; native: boolean; onError: (error: unknown) => void }) {
  const t = textFor(lang);
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const auto = [
    { icon: RefreshCw, fa: "آپدیت خودکار ساب‌لینک قبل از اتصال", en: "Subscriptions auto-refresh before connecting" },
    { icon: Zap, fa: "پیدا کردن و اتصال به سریع‌ترین سرور", en: "Fastest server is found and connected" },
    { icon: ShieldCheck, fa: "وصل مجدد خودکار با سرور جایگزین", en: "Auto-reconnect with fallback servers" },
  ];
  return <div className="space-y-5">
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-300 to-emerald-500 text-zinc-950"><Smartphone size={24} strokeWidth={1.7} /></div>
      <div>
        <h3 className="latin text-[18px] font-semibold">Khoram2Ry <span className="text-teal-200">APK</span></h3>
        <p className="mt-1 text-[11px] text-white/40">{t("یک اپ واحد؛ هسته VPN داخل خودش", "One app; the VPN core lives inside it")}</p>
      </div>
    </div>

    <div className="rounded-2xl bg-teal-300/6 p-4 ring-1 ring-teal-300/15">
      <p className="flex items-center gap-2 text-[13px] font-medium text-teal-100"><Sparkles size={15} className="text-teal-300" />{t("اتصال هوشمند با یک دکمه", "One-button smart connection")}</p>
      <div className="mt-3 space-y-2.5">
        {auto.map(({ icon: Icon, fa, en }) => (
          <p key={en} className="flex items-center gap-2.5 text-[11px] text-white/60">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/6"><Icon size={13} className="text-teal-200" /></span>
            {lang === "fa" ? fa : en}
          </p>
        ))}
      </div>
      <p className="mt-3 border-t border-white/6 pt-3 text-[11px] leading-6 text-white/45">
        {t("نیازی به نصب اپ دوم نیست. کانفیگ را از تلگرام Share کن — خودش وارد برنامه می‌شود.", "No second app needed. Share a config from Telegram and it lands straight in the app.")}
      </p>
    </div>

    {native
      ? <p className="flex items-center gap-2 text-[12px] text-teal-200"><Check size={16} />{t("این نسخه اندروید است؛ دکمه پاور همان اتصال واقعی است.", "This is the Android build; the power button is the real connection.")}</p>
      : <Notice>{t("الان داخل مرورگر هستی؛ مرورگر نمی‌تواند VPN دستگاه را روشن کند. برای اتصال واقعی، همین پروژه را به APK تبدیل و نصب کن.", "You are in a browser, which cannot start a device VPN. Turn this project into the APK and install it for real connections.")}</Notice>}

    {!native && <section className="space-y-3 border-t border-white/8 pt-4">
      <h4 className="text-[13px] font-medium">{t("قدم ۱ از ۳: دریافت پروژه", "Step 1 of 3: get the project")}</h4>
      <Button tone="primary" busy={busy} className="w-full" onClick={async () => {
        if (busy) return; setBusy(true);
        try { saveBlob(await buildAndroidZip(), "Khoram2Ry-native-source.zip"); setDownloaded(true); }
        catch (error) { onError(error); } finally { setBusy(false); }
      }}><Download size={16} />{downloaded ? t("دریافت دوباره (ZIP)", "Download again (ZIP)") : t("دریافت پروژه اندروید (ZIP)", "Download Android project (ZIP)")}</Button>
      <p className="text-[10px] leading-6 text-white/30">{t("فقط کد و دستور ساخت؛ بدون سرور و بدون اطلاعات شخصی تو.", "Source and build scripts only; no servers, no personal data.")}</p>
    </section>}

    <details open={!native} className="border-t border-white/8 pt-4">
      <summary className="cursor-pointer text-[13px] font-medium">{t("قدم ۲ و ۳: ساخت و نصب (۵ دقیقه، رایگان)", "Steps 2–3: build & install (5 min, free)")}</summary>
      <ol className="mt-3 list-inside list-decimal space-y-2.5 text-[11px] leading-7 text-white/50">
        <li>{t("فایل‌ها را در یک مخزن GitHub بریز (پوشه .github هم لازم است).", "Upload the files to a GitHub repository (include the .github folder).")}</li>
        <li>{t("در تب Actions گزینه Build Khoram2Ry Native APK را اجرا کن.", "In the Actions tab, run “Build Khoram2Ry Native APK”.")}</li>
        <li>{t("بعد از سبز شدن، از بخش Releases فایل Khoram2Ry-arm64.apk را دانلود و نصب کن.", "When it turns green, download Khoram2Ry-arm64.apk from Releases and install it.")}</li>
        <li>{t("اپ را باز کن، ساب‌لینک خودت را بده و دکمه پاور را بزن — بقیه‌اش خودکار است.", "Open the app, add your own subscription, tap power — the rest is automatic.")}</li>
      </ol>
    </details>

    <div className="space-y-2 border-t border-white/8 pt-4">
      <p className="text-[11px] leading-7 text-white/40">VLESS / VMess / Trojan / Shadowsocks / Xray JSON<br />{t("HY2 و TUIC فعلاً فقط ذخیره و خروجی می‌شوند. نسخه بیلد آزمایشی (debug) است.", "HY2 and TUIC are import/export only for now. Builds are debug-signed for testing.")}</p>
    </div>
  </div>;
}
