import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowDown, ArrowUp, ChevronRight, CircleHelp, Download, FileText, Globe, House, Link2, Loader2, Plus, Power, RefreshCw, Search, Server, Settings2, Shield, Smartphone, Sparkles, Star, Timer, Trash2, Zap } from "lucide-react";
import { cn } from "./utils/cn";
import type { AppLog, AppState, Profile, Subscription, Tab, TunnelStatus } from "./types";
import { defaultState, downloadBackup, loadState, restoreBackup, saveState } from "./lib/storage";
import { AppError, errorMessage } from "./lib/errors";
import { fetchSubscription, inspectImport, MAX_CONFIG_SIZE, parseProfile, validateSubscriptionUrl } from "./lib/parseShare";
import { CONNECT_LIMIT, STALE_SUB_MS, needProbe, rankCandidates, smartStepText } from "./lib/autoConnect";
import { browserStatus, connectionPayload, exportText, hasNativeCore, nativeRequest, supportsNative } from "./lib/native";
import { useTunnel } from "./lib/useTunnel";
import { formatBytes, formatDuration, latencyColor, protoColor, uid } from "./lib/format";
import { Button, Choice, Dialog, Notice, textFor, Toggle, type Text } from "./components/ui";
import { ConfigEditor, SubscriptionForm } from "./components/ConfigEditor";
import { ProfileDetail } from "./components/ProfileDetail";
import { SettingsPanel } from "./components/SettingsPanel";
import { GetApp } from "./components/GetApp";

type Sheet = "import" | "subscription" | "detail" | "logs" | "getapp" | "confirm" | null;

export default function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingSub, setEditingSub] = useState<Subscription>();
  const [incomingUrl, setIncomingUrl] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("added");
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState<unknown>(null);
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [busySub, setBusySub] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testProgress, setTestProgress] = useState("");
  const [confirmation, setConfirmation] = useState<{ title: string; hint?: string; accept: () => Promise<void> | void } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<unknown>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionBusy = useRef(false);
  const testBusy = useRef(false);
  const cancelTests = useRef(false);
  const autoUpdated = useRef(false);
  const alive = useRef(true);
  // Smart auto-connect (NPV-style): update → fastest → connect → fallback → reconnect.
  const [smartActive, setSmartActive] = useState(false);
  const [smartPhase, setSmartPhase] = useState("");
  const [smartDetail, setSmartDetail] = useState("");
  const smartCancel = useRef(false);
  const userStop = useRef(false);
  const autoStarted = useRef(false);
  const autoRetry = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const tunnel = useTunnel();
  const t = textFor(state.lang);
  const selected = state.profiles.find((p) => p.id === state.selectedId) || null;
  const activeDetail = state.profiles.find((p) => p.id === detailId);
  const closeSheet = useCallback(() => setSheet(null), []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  const log = useCallback((level: AppLog["level"], message: string) => setLogs((old) => [{ id: uid(), time: Date.now(), level, message }, ...old].slice(0, 100)), []);
  const fail = (error: unknown) => { const message = errorMessage(error, state.lang); notify(message); log("err", message); };

  useEffect(() => {
    try { saveState(state); setStorageError(null); } catch (e) { setStorageError(e); }
  }, [state]);
  useEffect(() => { document.documentElement.lang = state.lang; document.documentElement.dir = state.lang === "fa" ? "rtl" : "ltr"; }, [state.lang]);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; cancelTests.current = true; if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const incoming = url.searchParams.get("sub") || (url.hash.startsWith("#sub=") ? decodeURIComponent(url.hash.slice(5)) : "");
    if (incoming) {
      setIncomingUrl(incoming); setSheet("subscription");
      url.searchParams.delete("sub"); url.hash = "";
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);
  const previousTunnel = useRef(browserStatus.state);
  useEffect(() => {
    if (previousTunnel.current !== tunnel.status.state) {
      log("info", `VPN: ${tunnel.status.state}`);
      previousTunnel.current = tunnel.status.state;
    }
  }, [tunnel.status.state, log]);

  const patch = (value: Partial<AppState>) => setState((old) => ({ ...old, ...value }));
  const requireIdle = () => { if (tunnel.locked || testBusy.current) throw new AppError("DISCONNECT_FIRST"); };
  const choose = (id: string) => {
    try { requireIdle(); patch({ selectedId: id }); } catch (e) { fail(e); }
  };
  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return state.profiles.filter((p) => (filter === "all" || (filter === "fav" ? p.favorite : p.protocol === filter)) && `${p.name} ${p.host} ${p.protocol}`.toLowerCase().includes(needle)).sort((a, b) => sort === "latency" ? (a.latency ?? Infinity) - (b.latency ?? Infinity) : sort === "name" ? a.name.localeCompare(b.name) : b.createdAt - a.createdAt);
  }, [state.profiles, query, filter, sort]);

  const addProfiles = (profiles: Profile[]) => {
    const seen = new Set(state.profiles.map((p) => p.raw));
    const incoming = profiles.filter((p) => { if (seen.has(p.raw)) return false; seen.add(p.raw); return true; });
    setState((old) => ({ ...old, profiles: [...old.profiles, ...incoming], selectedId: old.selectedId || incoming[0]?.id || null }));
    closeSheet(); setTab("servers");
    notify(`${incoming.length} ${t("سرور اضافه شد", "servers added")}${profiles.length !== incoming.length ? ` / ${profiles.length - incoming.length} ${t("تکراری", "duplicates")}` : ""}`);
    log("ok", `${incoming.length} ${t("کانفیگ وارد شد", "profiles imported")}`);
  };

  // A successful refresh is committed atomically. Failed/empty responses never erase servers.
  const commitSubscription = (sub: Subscription, text: string) => {
    const result = inspectImport(text);
    if (!result.profiles.length) throw new AppError("EMPTY_IMPORT");
    setState((old) => {
      const existing = old.profiles.filter((p) => p.subId === sub.id);
      const incoming = result.profiles.map((p) => {
        const match = existing.find((item) => item.raw.split("#")[0] === p.raw.split("#")[0]);
        return { ...p, id: match?.id || p.id, favorite: match?.favorite, latency: match?.latency, testedAt: match?.testedAt, subId: sub.id };
      });
      const profiles = [...old.profiles.filter((p) => p.subId !== sub.id), ...incoming];
      const updated = { ...sub, lastUpdated: Date.now(), error: undefined };
      return { ...old, profiles, subs: old.subs.some((s) => s.id === sub.id) ? old.subs.map((s) => s.id === sub.id ? updated : s) : [...old.subs, updated], selectedId: profiles.some((p) => p.id === old.selectedId) ? old.selectedId : profiles[0]?.id || null };
    });
    log("ok", `${sub.name}: ${result.profiles.length} ${t("سرور دریافت شد", "servers received")}`);
    if (result.invalid.length) notify(`${result.invalid.length} ${t("کانفیگ نامعتبر نادیده گرفته شد", "invalid entries skipped")}`);
  };

  const refreshSubscriptions = async (subs: Subscription[], quiet = false) => {
    if (subscriptionBusy.current) return;
    try { requireIdle(); } catch (e) { if (!quiet) fail(e); return; }
    subscriptionBusy.current = true;
    for (const sub of subs.filter((s) => s.enabled)) {
      setBusySub(sub.id);
      try { commitSubscription(sub, await fetchSubscription(sub.url)); if (!quiet) notify(t("اشتراک به‌روز شد", "Subscription refreshed")); }
      catch (e) {
        const message = errorMessage(e, state.lang);
        setState((old) => ({ ...old, subs: old.subs.map((s) => s.id === sub.id ? { ...s, error: message } : s) }));
        log("err", `${sub.name}: ${message}`); if (!quiet) notify(message);
      }
    }
    subscriptionBusy.current = false; setBusySub(null);
  };

  useEffect(() => {
    if (autoUpdated.current || (hasNativeCore() && !tunnel.status.available) || tunnel.locked) return;
    autoUpdated.current = true;
    const due = state.subs.filter((s) => s.enabled && s.autoUpdate && Date.now() - (s.lastUpdated || 0) > 86400_000);
    if (due.length) void refreshSubscriptions(due, true);
  }, [tunnel.status.available, tunnel.locked]);

  const testProfile = async (profile: Profile, announce = true) => {
    if (!hasNativeCore()) throw new AppError("NATIVE_REQUIRED");
    if (!supportsNative(profile)) throw new AppError("UNSUPPORTED_PROTOCOL");
    if (tunnel.locked && (tunnel.status.state !== "connected" || tunnel.status.profileId !== profile.id)) throw new AppError("DISCONNECT_FIRST");
    const method = tunnel.status.state === "connected" ? "testActive" : "test";
    setTestingId(profile.id);
    try {
      const result = await nativeRequest<{ ms: number }>(method, connectionPayload(profile, state), 35_000);
      if (!Number.isFinite(result.ms) || result.ms < 0) throw new AppError("TEST_FAILED");
      setState((old) => ({ ...old, profiles: old.profiles.map((p) => p.id === profile.id ? { ...p, latency: result.ms, testedAt: Date.now() } : p) }));
      log("ok", `${profile.name}: ${result.ms} ms`);
      if (announce) notify(`${t("تست از داخل پراکسی", "Proxy request")}: ${result.ms} ms`);
    } catch (e) {
      setState((old) => ({ ...old, profiles: old.profiles.map((p) => p.id === profile.id ? { ...p, latency: null, testedAt: Date.now() } : p) }));
      throw e;
    } finally { setTestingId(null); }
  };

  const testAll = async () => {
    if (testBusy.current) { cancelTests.current = true; return; }
    if (!hasNativeCore()) { fail(new AppError("NATIVE_REQUIRED")); return; }
    try { requireIdle(); } catch (e) { fail(e); return; }
    testBusy.current = true; cancelTests.current = false;
    const list = filtered.filter(supportsNative);
    let success = 0;
    for (let i = 0; i < list.length && !cancelTests.current && alive.current; i++) {
      setTestProgress(`${i + 1}/${list.length}`);
      try { await testProfile(list[i], false); success++; } catch (e) { log("warn", `${list[i].name}: ${errorMessage(e, state.lang)}`); }
    }
    testBusy.current = false; setTestProgress("");
    notify(`${success} ${t("تست موفق", "successful tests")}`);
  };

  const smartConnect = useCallback(async () => {
    if (smartActive || tunnel.busy) return;
    if (!hasNativeCore()) { setSheet("getapp"); return; }
    if (testBusy.current || subscriptionBusy.current || busySub) {
      notify(t("منتظر پایان عملیات جاری بمانید.", "Wait for the current operation to finish."));
      return;
    }
    const snap = stateRef.current;
    if (!snap.profiles.length && !snap.subs.some((s) => s.enabled)) {
      fail(new AppError("NO_PROFILES"));
      setSheet("import");
      return;
    }
    smartCancel.current = false;
    userStop.current = false;
    setSmartActive(true);
    try {
      // 1) Refresh stale subscriptions automatically (or all, when there are no servers yet).
      const all = stateRef.current;
      const targets = all.profiles.length === 0
        ? all.subs.filter((s) => s.enabled)
        : all.subs.filter((s) => s.enabled && s.autoUpdate && Date.now() - (s.lastUpdated || 0) > STALE_SUB_MS);
      if (targets.length) {
        setSmartPhase("updating"); setSmartDetail("");
        log("info", t("به‌روزرسانی خودکار اشتراک…", "Auto-updating subscriptions…"));
        await refreshSubscriptions(targets, true);
        if (smartCancel.current) throw new AppError("CANCELLED");
      }
      // 2) Rank connectable servers: fastest / freshest first.
      const ranked = rankCandidates(
        stateRef.current.profiles,
        stateRef.current.selectedId,
        stateRef.current.autoFastest,
      );
      if (!ranked.length) throw new AppError("NO_SUPPORTED");
      // 3) Probe the fastest candidates when results are stale.
      let candidates = ranked;
      if (stateRef.current.autoFastest && ranked.length > 1) {
        const probes = needProbe(ranked);
        if (probes.length) {
          testBusy.current = true;
          try {
            for (let i = 0; i < probes.length; i++) {
              if (smartCancel.current) throw new AppError("CANCELLED");
              setSmartPhase("testing"); setSmartDetail(`${i + 1}/${probes.length}`);
              try { await testProfile(probes[i], false); }
              catch (e) { log("warn", `${probes[i].name}: ${errorMessage(e, stateRef.current.lang)}`); }
            }
          } finally { testBusy.current = false; }
          candidates = rankCandidates(stateRef.current.profiles, stateRef.current.selectedId, true);
        }
      }
      if (smartCancel.current) throw new AppError("CANCELLED");
      // 4) Connect with automatic fallback to the next best server.
      let lastError: unknown = new AppError("ALL_FAILED");
      const attempts = candidates.slice(0, CONNECT_LIMIT);
      for (let i = 0; i < attempts.length; i++) {
        if (smartCancel.current) throw new AppError("CANCELLED");
        const cand = attempts[i];
        setState((old) => ({ ...old, selectedId: cand.id }));
        setSmartPhase(i === 0 ? "connecting" : "retry");
        setSmartDetail(cand.name);
        try {
          parseProfile(cand.raw);
          await tunnel.command("connect", cand, { ...stateRef.current, selectedId: cand.id });
          const st = await nativeRequest<TunnelStatus>("status").catch(() => null);
          if (st && st.state === "connected") {
            autoRetry.current = 0;
            setSmartPhase("done");
            log("ok", `${t("متصل شد", "Connected")} → ${cand.name}`);
            notify(`${t("متصل شد", "Connected")} · ${cand.name}`);
            try { navigator.vibrate?.(25); } catch { /* ignore */ }
            return;
          }
          lastError = new AppError("CORE_START_FAILED");
        } catch (e) {
          if (e instanceof AppError && (e.code === "VPN_PERMISSION_DENIED" || e.code === "CANCELLED")) throw e;
          lastError = e;
          log("warn", `${cand.name}: ${errorMessage(e, stateRef.current.lang)}`);
          try { await tunnel.command("disconnect"); } catch { /* already stopped */ }
        }
      }
      throw lastError;
    } catch (e) {
      if (e instanceof AppError && e.code === "CANCELLED") {
        log("info", t("اتصال خودکار لغو شد.", "Smart connect cancelled."));
      } else { fail(e); }
    } finally {
      setSmartActive(false); setSmartPhase(""); setSmartDetail("");
    }
  }, [smartActive, tunnel, busySub, refreshSubscriptions, testProfile, fail, log, notify, t]);

  const toggleConnection = async () => {
    // Tapping while smart-connect runs cancels it (like NPV Tunnel).
    if (smartActive) { smartCancel.current = true; return; }
    if (tunnel.busy) return;
    if (tunnel.status.state === "connected" || tunnel.status.state === "connecting") {
      userStop.current = true;
      autoRetry.current = 0;
      try { await tunnel.command("disconnect"); } catch (e) { fail(e); }
      return;
    }
    if (!state.profiles.length) { setSheet("import"); return; }
    if (!hasNativeCore()) { setSheet("getapp"); return; }
    void smartConnect();
  };

  // Auto-connect on launch inside the native APK (does nothing in a browser).
  useEffect(() => {
    if (autoStarted.current || !hasNativeCore()) return;
    if (!state.autoConnect || !state.profiles.length) return;
    if (!tunnel.status.available || tunnel.status.state !== "disconnected") return;
    if (tunnel.busy || smartActive) return;
    autoStarted.current = true;
    log("info", t("اتصال خودکار هنگام اجرا…", "Auto-connecting on launch…"));
    const id = setTimeout(() => { void smartConnect(); }, 1400);
    return () => clearTimeout(id);
  }, [tunnel.status.available, tunnel.status.state, tunnel.busy, smartActive, state.autoConnect, state.profiles.length, smartConnect, log, t]);

  // Auto-reconnect after an unexpected drop (user taps disconnect to stop it).
  const prevTunnelState = useRef(tunnel.status.state);
  useEffect(() => {
    const prev = prevTunnelState.current;
    const cur = tunnel.status.state;
    prevTunnelState.current = cur;
    if (prev === "connected" && cur === "disconnected") {
      if (userStop.current) { userStop.current = false; autoRetry.current = 0; return; }
      if (!stateRef.current.autoReconnect || !hasNativeCore()) return;
      if (smartActive || tunnel.busy) return;
      if (autoRetry.current >= 3) {
        notify(t("اتصال قطع شد. برای تلاش دوباره دکمه را بزن.", "Disconnected. Tap the button to retry."));
        return;
      }
      autoRetry.current += 1;
      log("warn", t("قطع غیرمنتظره؛ اتصال مجدد خودکار…", "Unexpected drop; auto-reconnecting…"));
      const id = setTimeout(() => { void smartConnect(); }, 2500);
      return () => clearTimeout(id);
    }
    if (cur === "connected") autoRetry.current = 0;
  }, [tunnel.status.state, tunnel.busy, smartActive, smartConnect, log, notify, t]);

  // Configs / subs shared from other apps (Telegram, browser…) arrive here from native.
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text?.trim();
      if (!text) return;
      try {
        const url = validateSubscriptionUrl(text);
        setIncomingUrl(url); setEditingSub(undefined); setSheet("subscription");
        notify(t("ساب‌لینک دریافت شد؛ ذخیره کن تا سرورها اضافه شوند.", "Subscription received; save it to add servers."));
        return;
      } catch { /* not a sub URL */ }
      try {
        const res = inspectImport(text);
        if (res.profiles.length) addProfiles(res.profiles);
        else { setSheet("import"); notify(t("متن را بررسی کن.", "Please review the text.")); }
      } catch (err) { fail(err); }
    };
    window.addEventListener("khoram-import", handler);
    return () => window.removeEventListener("khoram-import", handler);
  }, [addProfiles, fail, notify, t]);

  const confirm = (value: NonNullable<typeof confirmation>) => { setConfirmError(null); setConfirmation(value); setSheet("confirm"); };
  const removeProfile = (profile: Profile) => confirm({
    title: t("این سرور حذف شود؟", "Delete this server?"), hint: profile.name,
    accept: async () => {
      requireIdle();
      if (hasNativeCore()) await nativeRequest("removeProfile", { id: profile.id });
      setState((old) => { const profiles = old.profiles.filter((p) => p.id !== profile.id); return { ...old, profiles, selectedId: old.selectedId === profile.id ? profiles[0]?.id || null : old.selectedId }; });
    },
  });
  const removeSub = (sub: Subscription) => confirm({
    title: t("اشتراک و سرورهای آن حذف شوند؟", "Delete this subscription and its servers?"), hint: sub.name,
    accept: async () => {
      requireIdle();
      if (hasNativeCore()) for (const p of state.profiles.filter((p) => p.subId === sub.id)) await nativeRequest("removeProfile", { id: p.id });
      setState((old) => { const profiles = old.profiles.filter((p) => p.subId !== sub.id); return { ...old, subs: old.subs.filter((s) => s.id !== sub.id), profiles, selectedId: profiles.some((p) => p.id === old.selectedId) ? old.selectedId : profiles[0]?.id || null }; });
    },
  });

  const titles = { import: t("افزودن کانفیگ", "Import configuration"), subscription: t("مدیریت اشتراک", "Subscription"), detail: activeDetail?.name || t("جزئیات سرور", "Server details"), logs: t("گزارش فعالیت", "Activity log"), getapp: t("اتصال واقعی در اندروید", "Native Android connection"), confirm: t("تأیید عملیات", "Confirm action") };

  return <div className="relative flex min-h-dvh items-center justify-center bg-[#05060a] lg:p-8">
    <div className={cn("relative flex h-dvh w-full max-w-[430px] flex-col overflow-hidden lg:h-[min(860px,calc(100dvh-64px))] lg:rounded-[36px] lg:shadow-[0_30px_110px_#0008] lg:ring-1 lg:ring-white/10", state.theme === "oled" ? "bg-black" : "bg-[#07080c]")}>
      <div className="noise pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-teal-400/7 blur-[90px]" />
      <header inert={sheet !== null} className="relative z-10 flex shrink-0 items-center justify-between px-5 pb-5 pt-[max(20px,env(safe-area-inset-top))]"><div className="flex items-center gap-2.5"><img src="/icon.png" alt="" className="h-10 w-10 rounded-xl" /><div><h1 className="latin text-[16px] font-semibold tracking-tight">Khoram2Ry</h1><p className="mt-0.5 text-[10px] text-white/40">{t("ساده. سریع. تحت کنترل تو.", "Simple. Fast. In your control.")}</p></div></div><button onClick={() => setSheet("logs")} title={titles.logs} aria-label={titles.logs} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/8"><FileText size={17} className="text-white/65" /></button></header>
      {storageError != null && <div className="px-5 pb-2"><Notice danger>{errorMessage(storageError, state.lang)}</Notice></div>}
      <main inert={sheet !== null} className="relative z-10 min-h-0 flex-1 overflow-y-auto scroll-thin">
        <div key={tab} className="animate-fade-up">
          {tab === "home" && <Home t={t} selected={selected} status={tunnel.status} busy={tunnel.busy} error={tunnel.error ? errorMessage(tunnel.error, state.lang) : null} routing={state.routing} onRouting={(routing) => { try { requireIdle(); patch({ routing }); } catch (e) { fail(e); } }} onConnect={() => void toggleConnection()} onChoose={() => setTab("servers")} onAdd={() => setSheet("import")} onGetApp={() => setSheet("getapp")} onTest={() => { if (selected) void testProfile(selected).catch(fail); }} testing={!!testingId} smartActive={smartActive} smartText={smartActive && smartPhase ? smartStepText(state.lang, smartPhase, smartDetail) : ""} autoOn={state.autoFastest || state.autoReconnect} native={hasNativeCore()} />}
          {tab === "servers" && <div className="px-5 pb-6">
            <div className="flex items-center justify-between"><div><h2 className="text-[19px] font-semibold">{t("سرورهای من", "My servers")}</h2><p className="mt-1 text-[11px] text-white/40">{state.profiles.length} {t("کانفیگ شخصی", "personal configurations")}</p></div><Button tone="primary" aria-label={titles.import} className="h-10 min-h-10 w-10 rounded-full px-0" onClick={() => setSheet("import")}><Plus size={18} /></Button></div>
            {state.profiles.length > 0 && <><div className="mt-4 flex items-center gap-2 rounded-xl bg-white/5 px-3"><Search size={16} className="text-white/35" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("جستجوی نام، آدرس یا پروتکل", "Search name, address or protocol")} aria-label={t("جستجوی سرور", "Search servers")} className="h-11 min-w-0 flex-1 bg-transparent text-[12px] placeholder:text-white/30" /></div><div className="mt-3 grid grid-cols-2 gap-2"><Choice label={t("نمایش", "Show")} value={filter} onChange={setFilter} options={[{ value: "all", label: t("همه سرورها", "All servers") }, { value: "fav", label: t("علاقه‌مندی‌ها", "Favorites") }, ...Array.from(new Set(state.profiles.map((p) => p.protocol))).map((value) => ({ value, label: value.toUpperCase() }))]} /><Choice label={t("مرتب‌سازی", "Sort by")} value={sort} onChange={setSort} options={[{ value: "added", label: t("جدیدترین", "Newest") }, { value: "latency", label: t("تأخیر واقعی", "Measured latency") }, { value: "name", label: t("نام", "Name") }]} /></div><div className="my-3 flex items-center justify-between gap-2"><Button disabled={tunnel.locked || !filtered.length || (!!testingId && !testProgress)} onClick={() => void testAll()} className="px-3 text-[11px]"><Zap size={14} />{testProgress ? `${t("توقف", "Cancel")} ${testProgress}` : t("تست واقعی همه", "Test all through proxy")}</Button><button aria-label={t("خروجی سرورهای فیلترشده", "Export filtered servers")} disabled={!filtered.length} onClick={() => void exportText(filtered.map((p) => p.raw).join("\n"), "khoram-servers.txt").catch(fail)} className="flex h-10 w-10 items-center justify-center text-white/50"><Download size={16} /></button></div></>}
            {state.profiles.length === 0 ? <Empty title={t("سرور خودت را اضافه کن", "Bring your own server")} description={t("هیچ سروری از قبل اضافه نشده. لینک، ساب‌لینک یا کانفیگ خودت را وارد کن.", "No servers are preloaded. Import your own link, subscription or configuration.")} action={t("افزودن اولین کانفیگ", "Add your first configuration")} onAction={() => setSheet("import")} /> : !filtered.length ? <p className="py-16 text-center text-[12px] text-white/40">{t("سروری با این فیلتر پیدا نشد.", "No servers match these filters.")}</p> : <div className="space-y-2">{filtered.map((p) => <div key={p.id} className={cn("flex items-center gap-2 rounded-2xl p-3 ring-1 transition", state.selectedId === p.id ? "bg-teal-300/7 ring-teal-300/25" : "bg-white/3 ring-white/6")}>
              <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => choose(p.id)} aria-pressed={state.selectedId === p.id}><ProtocolMark profile={p} /><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{p.name}</p><p className="latin mt-1 truncate text-[10px] text-white/40" dir="ltr">{p.protocol.toUpperCase()} / {p.host}</p></div></button><div className="flex flex-col items-end"><span className={cn("latin text-[11px]", latencyColor(p.latency))}>{testingId === p.id ? <Loader2 size={13} className="animate-spin" /> : p.latency != null ? `${p.latency} ms` : p.testedAt ? t("ناموفق", "Failed") : "-"}</span><div className="mt-1 flex"><button aria-label={t("علاقه‌مندی", "Favorite")} aria-pressed={!!p.favorite} onClick={() => setState((old) => ({ ...old, profiles: old.profiles.map((item) => item.id === p.id ? { ...item, favorite: !item.favorite } : item) }))} className="p-2"><Star size={14} className={p.favorite ? "fill-amber-300 text-amber-300" : "text-white/25"} /></button><button aria-label={t("جزئیات و ویرایش", "Details and editing")} onClick={() => { setDetailId(p.id); setSheet("detail"); }} className="p-2"><ChevronRight size={15} className="text-white/40 rtl:rotate-180" /></button></div></div></div>)}</div>}
          </div>}
          {tab === "subs" && <div className="px-5 pb-7"><div className="flex items-center justify-between"><div><h2 className="text-[19px] font-semibold">{t("اشتراک‌های من", "My subscriptions")}</h2><p className="mt-1 text-[11px] text-white/40">{t("سرورهای خودت، همیشه به‌روز", "Your servers, kept up to date")}</p></div><Button tone="primary" className="h-10 min-h-10 w-10 rounded-full px-0" aria-label={t("افزودن اشتراک", "Add subscription")} onClick={() => { setEditingSub(undefined); setIncomingUrl(""); setSheet("subscription"); }}><Plus size={18} /></Button></div>
            {!state.subs.length ? <Empty title={t("ساب‌لینکی اضافه نشده", "No subscriptions yet")} description={t("آدرس اشتراکی که از ارائه‌دهنده‌ات داری را وارد کن.", "Add the subscription URL from your provider.")} action={t("افزودن ساب‌لینک", "Add subscription")} onAction={() => { setEditingSub(undefined); setIncomingUrl(""); setSheet("subscription"); }} /> : <><Button className="my-4 w-full" busy={!!busySub} disabled={tunnel.locked} onClick={() => void refreshSubscriptions(state.subs)}><RefreshCw size={15} />{t("به‌روزرسانی همه", "Refresh all")}</Button><div className="space-y-3">{state.subs.map((sub) => <div key={sub.id} className="rounded-2xl bg-white/3 p-4 ring-1 ring-white/7"><div className="flex items-start justify-between gap-3"><button className="min-w-0 text-start" onClick={() => { setEditingSub(sub); setSheet("subscription"); }}><p className="truncate text-[14px] font-medium">{sub.name}</p><p className="latin mt-1 truncate text-[11px] text-white/35" dir="ltr">{safeOrigin(sub.url)}</p></button><Link2 size={18} className="mt-1 shrink-0 text-amber-200/65" /></div><p className="mt-3 text-[11px] text-white/40">{state.profiles.filter((p) => p.subId === sub.id).length} {t("سرور", "servers")} / {sub.lastUpdated ? new Date(sub.lastUpdated).toLocaleString(state.lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" }) : t("هنوز دریافت نشده", "Not fetched yet")}</p><Toggle label={t("فعال", "Enabled")} value={sub.enabled} disabled={!!busySub || tunnel.locked} onChange={(enabled) => patch({ subs: state.subs.map((s) => s.id === sub.id ? { ...s, enabled } : s) })} />{sub.error && <Notice danger>{sub.error}</Notice>}<div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><Button busy={busySub === sub.id} disabled={!!busySub || tunnel.locked || !sub.enabled} onClick={() => void refreshSubscriptions([sub])}><RefreshCw size={14} />{t("به‌روزرسانی", "Refresh")}</Button><Button tone="danger" disabled={!!busySub || tunnel.locked} onClick={() => removeSub(sub)} aria-label={t("حذف اشتراک", "Delete subscription")}><Trash2 size={15} /></Button></div></div>)}</div></>}
            <p className="mt-5 flex gap-2 text-[11px] leading-6 text-white/35"><Shield size={15} className="mt-1 shrink-0" />{t("ساب‌لینک شما خصوصی است و از طریق سرویس واسطه دریافت نمی‌شود.", "Your subscription URL stays private. No third-party relay is used.")}</p>
          </div>}
          {tab === "settings" && <SettingsPanel state={state} locked={tunnel.locked || !!testingId || !!busySub} onPatch={patch} onBackup={() => void downloadBackup(state).catch(fail)} onRestore={() => backupInput.current?.click()} onGetApp={() => setSheet("getapp")} onNativeTools={(screen) => void nativeRequest("openScreen", { screen }).catch(fail)} onClear={() => confirm({ title: t("همه سرورها و اشتراک‌ها پاک شوند؟", "Clear all profiles and subscriptions?"), hint: t("این کار قابل برگشت نیست؛ ابتدا پشتیبان بگیر.", "This cannot be undone. Export a backup first."), accept: async () => { requireIdle(); if (hasNativeCore()) await nativeRequest("clearProfiles"); setState({ ...defaultState(), lang: state.lang, theme: state.theme }); setLogs([]); } })} />}
        </div>
      </main>
      <nav inert={sheet !== null} aria-label={t("منوی اصلی", "Main navigation")} className="relative z-10 grid shrink-0 grid-cols-4 border-t border-white/6 bg-[#0b0d12]/90 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-xl">{([{ id: "home", icon: House, label: t("خانه", "Home") }, { id: "servers", icon: Server, label: t("سرورها", "Servers") }, { id: "subs", icon: Link2, label: t("اشتراک", "Subscriptions") }, { id: "settings", icon: Settings2, label: t("تنظیمات", "Settings") }] as const).map(({ id, icon: Icon, label }) => <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined} className={cn("flex flex-col items-center gap-1.5 py-2 text-[10px] transition", tab === id ? "text-teal-200" : "text-white/35")}><Icon size={19} strokeWidth={tab === id ? 2 : 1.6} />{label}</button>)}</nav>
      <input ref={backupInput} type="file" className="hidden" accept=".json,application/json" onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        try { requireIdle(); if (file.size > MAX_CONFIG_SIZE) throw new AppError("TOO_LARGE"); const restored = restoreBackup(await file.text()); confirm({ title: t("اطلاعات فعلی با پشتیبان جایگزین شود؟", "Replace current data with this backup?"), hint: `${restored.profiles.length} ${t("سرور", "servers")}`, accept: async () => { requireIdle(); if (hasNativeCore()) await nativeRequest("clearProfiles"); setState(restored); notify(t("پشتیبان بازیابی شد", "Backup restored")); } }); } catch (e) { fail(e); }
      }} />
      {sheet && <Dialog title={titles[sheet]} onClose={closeSheet} closeLabel={t("بستن", "Close")}>
        {sheet === "import" && <ConfigEditor lang={state.lang} onImport={addProfiles} onSubscription={(url) => { setIncomingUrl(url); setEditingSub(undefined); setSheet("subscription"); }} />}
        {sheet === "subscription" && <SubscriptionForm key={editingSub?.id || "new"} lang={state.lang} initial={editingSub} incomingUrl={incomingUrl} onSave={async (value) => {
          requireIdle(); if (subscriptionBusy.current) throw new AppError("REQUEST_TIMEOUT");
          subscriptionBusy.current = true;
          const sub: Subscription = { id: editingSub?.id || uid(), name: value.name, url: value.url, enabled: editingSub?.enabled !== false, autoUpdate: value.autoUpdate };
          setBusySub(sub.id);
          try { commitSubscription(sub, value.body.trim() || await fetchSubscription(sub.url)); closeSheet(); setTab("subs"); notify(t("اشتراک ذخیره شد", "Subscription saved")); }
          finally { subscriptionBusy.current = false; setBusySub(null); }
        }} />}
        {sheet === "detail" && activeDetail && <ProfileDetail key={activeDetail.id} profile={activeDetail} state={state} lang={state.lang} locked={tunnel.locked || !!busySub} onToast={notify} onSave={(profile) => { requireIdle(); setState((old) => ({ ...old, profiles: old.profiles.map((p) => p.id === profile.id ? profile : p) })); closeSheet(); notify(t("کانفیگ ذخیره شد", "Configuration saved")); }} onSelect={() => { choose(activeDetail.id); closeSheet(); setTab("home"); }} onDelete={() => removeProfile(activeDetail)} onTest={() => testProfile(activeDetail)} />}
        {sheet === "getapp" && <GetApp lang={state.lang} native={tunnel.status.available} onError={fail} />}
        {sheet === "logs" && <div className="space-y-4"><p className="text-[11px] leading-6 text-white/40">{t("فقط رویدادهای واقعی برنامه؛ رمزها و ساب‌لینک در گزارش ثبت نمی‌شوند.", "Actual application events only. Credentials and subscription URLs are not logged.")}</p>{hasNativeCore() && <Button className="w-full" onClick={() => void nativeRequest("openScreen", { screen: "logs" }).catch(fail)}><FileText size={15} />{t("باز کردن گزارش زنده هسته", "Open native core log")}</Button>}<div className="min-h-40 rounded-xl bg-black/25 p-3">{logs.length ? logs.map((entry) => <div key={entry.id} className="border-b border-white/4 py-2 text-[11px] leading-5"><time className="latin me-2 text-white/25">{new Date(entry.time).toLocaleTimeString()}</time><span className={entry.level === "err" ? "text-rose-300" : entry.level === "ok" ? "text-teal-200" : "text-white/60"}>{entry.message}</span></div>) : <p className="py-12 text-center text-[12px] text-white/30">{t("هنوز رویدادی ثبت نشده", "No events yet")}</p>}</div><div className="grid grid-cols-2 gap-2"><Button onClick={() => setLogs([])}>{t("پاک کردن", "Clear")}</Button><Button disabled={!logs.length} onClick={() => void exportText(logs.map((entry) => `${new Date(entry.time).toISOString()} [${entry.level}] ${entry.message}`).join("\n"), "khoram-log.txt").catch(fail)}>{t("خروجی گزارش", "Export log")}</Button></div></div>}
        {sheet === "confirm" && confirmation && <div className="space-y-4"><h3 className="text-[15px]">{confirmation.title}</h3>{confirmation.hint && <p className="text-[12px] leading-6 text-white/45">{confirmation.hint}</p>}{confirmError != null && <Notice danger>{errorMessage(confirmError, state.lang)}</Notice>}<div className="grid grid-cols-2 gap-3"><Button onClick={closeSheet} disabled={confirmBusy}>{t("انصراف", "Cancel")}</Button><Button tone="danger" busy={confirmBusy} onClick={async () => { if (confirmBusy) return; setConfirmBusy(true); try { await confirmation.accept(); closeSheet(); } catch (e) { setConfirmError(e); } finally { setConfirmBusy(false); } }}>{t("تأیید", "Confirm")}</Button></div></div>}
      </Dialog>}
      {toast && <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex justify-center px-5" role="status"><div className="animate-toast max-w-full rounded-2xl bg-white/95 px-4 py-3 text-[12px] leading-6 text-zinc-950 shadow-xl">{toast}</div></div>}
    </div>
  </div>;
}

function safeOrigin(url: string) { try { return new URL(url).host; } catch { return ""; } }

function ProtocolMark({ profile }: { profile: Profile }) {
  return <div className={cn("latin flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-[10px] font-semibold text-zinc-950", protoColor(profile.protocol))}>{profile.protocol === "custom" ? "{ }" : profile.protocol.slice(0, 2).toUpperCase()}</div>;
}

function Empty({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <div className="flex flex-col items-center px-3 py-16 text-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-300/5"><Server size={29} strokeWidth={1.2} className="text-teal-200/70" /></div><h3 className="mt-5 text-[16px] font-medium">{title}</h3><p className="mt-2 max-w-[270px] text-[12px] leading-7 text-white/40">{description}</p><Button tone="primary" className="mt-5" onClick={onAction}><Plus size={16} />{action}</Button></div>;
}

function Home({ t, selected, status, busy, error, routing, onRouting, onConnect, onChoose, onAdd, onGetApp, onTest, testing, smartActive, smartText, autoOn, native }: {
  t: Text; selected: Profile | null; status: TunnelStatus; busy: boolean; error: string | null;
  routing: AppState["routing"]; onRouting: (r: AppState["routing"]) => void;
  onConnect: () => void; onChoose: () => void; onAdd: () => void; onGetApp: () => void;
  onTest: () => void; testing: boolean;
  smartActive: boolean; smartText: string; autoOn: boolean; native: boolean;
}) {
  const connected = status.available && status.state === "connected";
  const pending = smartActive || busy || status.state === "connecting" || status.state === "disconnecting";
  const statusText = smartActive && smartText ? smartText : pending ? t("در انتظار سرویس اندروید", "Waiting for Android service") : connected ? t("تونل VPN فعال است", "VPN tunnel is running") : t("متصل نیست", "Disconnected");
  return <div className="flex flex-col px-5 pb-5">
    <div className="flex justify-center gap-2">
      <span className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]", connected ? "bg-teal-300/10 text-teal-200" : "bg-white/5 text-white/45")}><span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-teal-300" : pending ? "animate-pulse bg-amber-300" : "bg-white/30")} />{statusText}</span>
      {native && autoOn && !connected && !pending && <span className="flex items-center gap-1 rounded-full bg-teal-300/8 px-2.5 py-1.5 text-[10px] text-teal-200/80"><Sparkles size={11} />{t("خودکار", "Auto")}</span>}
    </div>
    <div className="relative mx-auto mt-6 flex h-[214px] w-[214px] items-center justify-center">
      {connected && <><div className="animate-ring absolute inset-5 rounded-full border border-teal-300/20" /><div className="animate-ring absolute inset-5 rounded-full border border-teal-300/15" style={{ animationDelay: ".9s" }} /></>}
      <div className="absolute inset-3 rounded-full border border-white/[.025]" />
      <button aria-label={smartActive ? t("لغو اتصال خودکار", "Cancel smart connect") : connected ? t("قطع VPN", "Disconnect VPN") : t("اتصال هوشمند VPN", "Smart VPN connect")} disabled={busy && !smartActive} onClick={onConnect} className={cn("relative flex h-[148px] w-[148px] items-center justify-center rounded-full transition duration-300 active:scale-95 disabled:cursor-wait", connected ? "animate-orb bg-gradient-to-b from-teal-300 to-emerald-500 text-zinc-950" : "bg-gradient-to-b from-[#20252e] to-[#11151c] text-white/75 shadow-[0_10px_35px_#0005] ring-1 ring-white/10")}>
        {pending ? <Loader2 className="h-12 w-12 animate-spin text-teal-200" strokeWidth={1.5} /> : <Power className="h-14 w-14" strokeWidth={1.5} />}
      </button>
    </div>
    <p className="text-center text-[12px] text-white/40">{smartActive ? t("برای لغو، دوباره لمس کن", "Tap again to cancel") : !selected ? t("اول، کانفیگ خودت را اضافه کن", "Start by adding your configuration") : connected ? t("برای قطع اتصال لمس کن", "Tap to disconnect") : t("اتصال هوشمند: آپدیت، سریع‌ترین سرور، وصل شدن", "Smart connect: update, fastest server, connect")}</p>
    <button onClick={selected ? onChoose : onAdd} className="mt-6 flex items-center gap-3 rounded-2xl bg-white/4 p-3.5 text-start ring-1 ring-white/7">
      {selected ? <ProtocolMark profile={selected} /> : <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5"><Plus size={21} className="text-teal-200/80" /></div>}
      <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-medium">{selected ? selected.name : t("انتخاب سرور", "Select a server")}</p><p className={cn("mt-1 truncate text-[11px] text-white/35", selected && "latin")} dir={selected ? "ltr" : undefined}>{selected ? `${selected.host}${selected.port ? `:${selected.port}` : ""}` : t("فقط سرورهایی که خودت وارد می‌کنی", "Only servers you import")}</p></div><ChevronRight size={16} className="text-white/30 rtl:rotate-180" />
    </button>
    <div className="mt-5 grid grid-cols-3 divide-x divide-white/6 rtl:divide-x-reverse"><Metric icon={<ArrowDown size={13} />} label={t("دریافت", "Downloaded")} value={status.downloaded == null ? "-" : formatBytes(status.downloaded)} /><Metric icon={<ArrowUp size={13} />} label={t("ارسال", "Uploaded")} value={status.uploaded == null ? "-" : formatBytes(status.uploaded)} /><Metric icon={<Timer size={13} />} label={t("مدت اتصال", "Duration")} value={connected ? formatDuration(status.elapsedMs) : "-"} /></div>
    <div className="mt-5"><p className="mb-2 flex items-center gap-1.5 text-[11px] text-white/35"><Globe size={13} />{t("مسیریابی", "Routing")}</p><div className="grid grid-cols-3 gap-2">{([{ key: "smart", label: t("هوشمند", "Smart") }, { key: "global", label: t("سراسری", "Global") }, { key: "direct", label: t("مستقیم", "Direct") }] as const).map((item) => <button key={item.key} onClick={() => onRouting(item.key)} disabled={connected || pending} className={cn("h-10 rounded-xl text-[12px] ring-1 transition disabled:opacity-60", routing === item.key ? "bg-teal-300/10 text-teal-200 ring-teal-300/20" : "bg-white/3 text-white/40 ring-white/6")}>{item.label}</button>)}</div></div>
    {routing === "direct" && <p className="mt-2 text-[11px] leading-5 text-amber-200/75">{t("حالت مستقیم: ترافیک از سرور پراکسی عبور نمی‌کند.", "Direct mode does not route traffic through the proxy server.")}</p>}
    {error && <div className="mt-4"><Notice danger>{error}</Notice></div>}
    {status.available ? <div className="mt-5 border-t border-white/6 pt-4"><div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 text-[11px] text-teal-200/75"><Shield size={14} />Xray / Android VPN</p><button onClick={onTest} disabled={!selected || testing} className="flex items-center gap-1 text-[11px] text-white/50">{testing ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}{selected?.latency != null ? `${selected.latency} ms` : t("تست اتصال", "Test connection")}</button></div><p className="mt-2 text-[10px] leading-5 text-white/30">{t("وضعیت بالا مربوط به تونل است؛ تست اتصال، دسترسی واقعی از پراکسی را بررسی می‌کند.", "Tunnel status is not an internet check. Test connection to verify proxy reachability.")}</p></div> : <button onClick={onGetApp} className="mt-5 flex items-start gap-2.5 border-t border-white/6 pt-4 text-start"><Smartphone size={17} className="mt-1 shrink-0 text-amber-200/60" /><div className="flex-1"><p className="text-[11px] text-white/65">{t("نسخه وب؛ هسته VPN در دسترس نیست", "Web edition; VPN core unavailable")}</p><p className="mt-1 text-[10px] leading-6 text-white/30">{t("مدیریت کانفیگ فعال است. اتصال واقعی به APK دارای هسته نیاز دارد.", "Configuration management works here. A real tunnel needs the native APK.")}</p></div><CircleHelp size={14} className="mt-1 text-white/25" /></button>}
  </div>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="px-3"><p className="flex items-center justify-center gap-1 text-[10px] text-white/35">{icon}{label}</p><p className="latin mt-2 text-center text-[15px] font-medium text-white/75" dir="ltr">{value}</p></div>;
}