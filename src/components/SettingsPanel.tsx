import { useState } from "react";
import { Download, Upload, Smartphone, SlidersHorizontal, Trash2, Save, FileText } from "lucide-react";
import type { AppState, Lang } from "../types";
import { AppError, errorMessage } from "../lib/errors";
import { hasNativeCore, validAdvanced } from "../lib/native";
import { Button, Choice, Field, Notice, textFor, Toggle } from "./ui";

export function SettingsPanel({ state, locked, onPatch, onBackup, onRestore, onClear, onGetApp, onNativeTools }: {
  state: AppState; locked: boolean; onPatch: (partial: Partial<AppState>) => void;
  onBackup: () => void; onRestore: () => void; onClear: () => void; onGetApp: () => void;
  onNativeTools: (screen: string) => void;
}) {
  const t = textFor(state.lang);
  const [draft, setDraft] = useState({ ...state.advanced });
  const [mux, setMux] = useState(state.mux);
  const [fragment, setFragment] = useState(state.fragment);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const update = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => { setDraft((d) => ({ ...d, [key]: value })); setSaved(false); };
  return <div className="space-y-6 px-5 pb-8">
    <div><h2 className="text-[19px] font-semibold">{t("تنظیمات", "Settings")}</h2><p className="mt-1 text-[11px] text-white/40">{t("کنترل بیشتر، بدون شلوغی", "More control. Less clutter.")}</p></div>
    <div className="grid grid-cols-2 gap-3"><Choice label={t("زبان", "Language")} value={state.lang} onChange={(lang) => onPatch({ lang: lang as Lang })} options={[{ value: "fa", label: "فارسی" }, { value: "en", label: "English" }]} /><Choice label={t("ظاهر", "Appearance")} value={state.theme} onChange={(theme) => onPatch({ theme: theme === "oled" ? "oled" : "night" })} options={[{ value: "night", label: t("شب", "Night") }, { value: "oled", label: "OLED" }]} /></div>
    <section className="space-y-1 rounded-2xl bg-teal-300/5 p-4 ring-1 ring-teal-300/15">
      <h3 className="flex items-center gap-2 text-[13px] font-medium text-teal-100"><Smartphone size={15} className="text-teal-300" />{t("اتصال خودکار (مثل NPV Tunnel)", "Automatic connection (NPV-style)")}</h3>
      <p className="pb-1 text-[11px] leading-6 text-white/40">{t("با یک لمس: اشتراک به‌روز می‌شود، سریع‌ترین سرور پیدا می‌شود و در صورت قطعی، خودش به سرور بعدی وصل می‌شود.", "One tap does it all: subscriptions refresh, the fastest server is picked, and drops fall over to the next server.")}</p>
      <div className="divide-y divide-white/5">
        <Toggle label={t("اتصال خودکار هنگام باز شدن اپ", "Auto-connect on launch")} hint={t("فقط در نسخه اندروید", "Native Android app only")} value={state.autoConnect} onChange={(v) => onPatch({ autoConnect: v })} />
        <Toggle label={t("انتخاب خودکار سریع‌ترین سرور", "Auto-pick fastest server")} hint={t("تست سریع و اتصال به بهترین گزینه", "Quick probe, then connect to the best")} value={state.autoFastest} onChange={(v) => onPatch({ autoFastest: v })} />
        <Toggle label={t("وصل مجدد خودکار", "Auto-reconnect on drop")} hint={t("تا ۳ تلاش روی بهترین سرورها", "Up to 3 retries on the best servers")} value={state.autoReconnect} onChange={(v) => onPatch({ autoReconnect: v })} />
      </div>
    </section>
    <section className="space-y-4 border-t border-white/8 pt-5">
      <h3 className="flex items-center gap-2 text-[13px] font-medium"><SlidersHorizontal size={15} className="text-teal-300" />{t("تنظیمات پیشرفته هسته", "Advanced core settings")}</h3>
      <p className="text-[11px] leading-6 text-white/40">{t("در اتصال بعدی نسخه اندروید اعمال می‌شود. کانفیگ JSON کامل از تنظیمات داخلی خودش استفاده می‌کند.", "Applied to your next Android connection. Full JSON configurations use their own core settings.")}</p>
      {locked && <Notice>{t("برای ویرایش، ابتدا VPN را قطع کنید.", "Disconnect the VPN before editing core settings.")}</Notice>}
      <fieldset disabled={locked} className="space-y-4 disabled:opacity-50">
        <Field label={t("DNS تونل (IPv4، جداشده با ویرگول)", "Tunnel DNS (comma-separated IPv4)")} dir="ltr" value={draft.dns} onChange={(v) => update("dns", v)} />
        <div className="grid grid-cols-2 gap-3"><Field label="SOCKS port" dir="ltr" type="number" value={draft.socksPort} onChange={(v) => update("socksPort", Number(v))} min={1024} max={65535} /><Field label="MTU" dir="ltr" type="number" value={draft.mtu} onChange={(v) => update("mtu", Number(v))} min={1280} max={9000} /></div>
        <div className="divide-y divide-white/5"><Toggle label="Sniffing" hint={t("تشخیص دامنه برای قوانین مسیریابی", "Domain detection for routing rules")} value={draft.sniffing} onChange={(v) => update("sniffing", v)} disabled={locked} /><Toggle label="IPv6" hint={t("عبور IPv6 از تونل؛ در حالت خاموش در VPN مسدود است", "Route IPv6 through the tunnel; blocked in VPN when off")} value={draft.ipv6} onChange={(v) => update("ipv6", v)} disabled={locked} /><Toggle label="Mux" hint={t("نیازمند سازگاری پروتکل و سرور", "Requires protocol and server compatibility")} value={mux} onChange={(v) => { setMux(v); setSaved(false); }} disabled={locked} /></div>
        {mux && <Field label={t("تعداد اتصال هم‌زمان Mux", "Mux concurrency")} type="number" dir="ltr" value={draft.muxConcurrency} min={1} max={128} onChange={(v) => update("muxConcurrency", Number(v))} />}
        <Toggle label="TLS Fragment" hint={t("فقط برای TLS / Reality؛ ممکن است سرعت را کم کند", "TLS / Reality only; may reduce performance")} value={fragment} onChange={(v) => { setFragment(v); setSaved(false); }} disabled={locked} />
        {fragment && <div className="grid grid-cols-2 gap-3"><Field label={t("طول بسته", "Packet length")} dir="ltr" value={draft.fragmentLength} onChange={(v) => update("fragmentLength", v)} /><Field label={t("فاصله (ms)", "Interval (ms)")} dir="ltr" value={draft.fragmentInterval} onChange={(v) => update("fragmentInterval", v)} /></div>}
        <Choice label={t("سطح گزارش", "Log level")} value={draft.logLevel} onChange={(v) => update("logLevel", v as typeof draft.logLevel)} options={["none", "error", "warning", "info", "debug"].map((value) => ({ value, label: value }))} />
        <Field label={t("آدرس درخواست تست از داخل پراکسی", "URL requested through the proxy during tests")} dir="ltr" type="url" value={draft.testUrl} onChange={(v) => update("testUrl", v)} />
        <details className="border-t border-white/6 pt-3"><summary className="cursor-pointer text-[12px] text-white/70">{t("قوانین مسیریابی دامنه", "Domain routing rules")}</summary><div className="mt-4 space-y-4">
          <p className="text-[11px] leading-6 text-white/40">{t("هر خط یک دامنه بدون https://. قوانین مسدودسازی اولویت دارند. حالت هوشمند فقط شبکه محلی را مستقیم می‌کند.", "One domain per line, without https://. Blocking takes priority. Smart mode bypasses local networks only.")}</p>
          <label className="block text-[11px] text-white/50">{t("اتصال مستقیم", "Direct domains")}<textarea value={draft.directDomains} onChange={(e) => update("directDomains", e.target.value)} dir="ltr" className="latin mt-2 h-24 w-full rounded-xl bg-white/5 p-3 text-[12px] text-white/85" /></label>
          <label className="block text-[11px] text-white/50">{t("مسدود", "Blocked domains")}<textarea value={draft.blockedDomains} onChange={(e) => update("blockedDomains", e.target.value)} dir="ltr" className="latin mt-2 h-24 w-full rounded-xl bg-white/5 p-3 text-[12px] text-white/85" /></label>
        </div></details>
        {error != null && <Notice danger>{errorMessage(error, state.lang)}</Notice>}
        <Button tone="primary" className="w-full" disabled={locked} onClick={() => {
          if (!validAdvanced(draft)) { setError(new AppError("INVALID_SETTINGS")); return; }
          setError(null); onPatch({ advanced: draft, mux, fragment }); setSaved(true);
        }}><Save size={15} />{saved ? t("تنظیمات ذخیره شد", "Settings saved") : t("ذخیره تنظیمات هسته", "Save core settings")}</Button>
      </fieldset>
    </section>
    <section className="space-y-3 border-t border-white/8 pt-5"><h3 className="text-[12px] text-white/50">{t("اندروید", "Android")}</h3>
      <Button className="w-full" onClick={onGetApp}><Smartphone size={16} />{t("نسخه اندروید با هسته داخلی", "Android app with embedded core")}</Button>
      {hasNativeCore() && <><Button className="w-full" disabled={locked} onClick={() => onNativeTools("perApp")}><SlidersHorizontal size={16} />{t("انتخاب برنامه‌های داخل VPN", "Per-app VPN routing")}</Button><Button className="w-full" onClick={() => onNativeTools("logs")}><FileText size={16} />{t("گزارش زنده Xray", "Live Xray log")}</Button></>}
    </section>
    <section className="space-y-3 border-t border-white/8 pt-5"><h3 className="text-[12px] text-white/50">{t("داده‌های شما", "Your data")}</h3><p className="text-[11px] leading-6 text-white/35">{t("فایل پشتیبان شامل رمزها و ساب‌لینک است و رمزنگاری نشده؛ آن را عمومی نکنید.", "Backups contain credentials and subscription URLs in plain text. Keep them private.")}</p><div className="grid grid-cols-2 gap-2"><Button onClick={onBackup}><Download size={15} />{t("پشتیبان", "Backup")}</Button><Button onClick={onRestore} disabled={locked}><Upload size={15} />{t("بازیابی", "Restore")}</Button></div><Button tone="danger" className="w-full" onClick={onClear} disabled={locked}><Trash2 size={15} />{t("پاک کردن تمام داده‌ها", "Clear all data")}</Button></section>
    <div className="flex items-center gap-3 border-t border-white/8 pt-5"><img src="/icon.png" alt="" className="h-10 w-10 rounded-xl" /><div><p className="latin text-[14px] font-medium">Khoram2Ry <span className="text-white/30">2.0</span></p><p className="mt-1 text-[10px] text-white/35">{t("رابط مستقل؛ سرویس اندروید بر پایه v2rayNG / Xray", "Independent interface; Android service based on v2rayNG / Xray")}</p></div></div>
  </div>;
}