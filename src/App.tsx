import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Activity, ArrowDown, ArrowUp, Check, ChevronRight, CircleGauge, Code2, Download, FileText, Gauge, Globe, House, KeyRound, Layers, Link2, Loader2, LockKeyhole, Network, Plus, Power, Radio, RefreshCw, Route, Search, Server, Settings2, Shield, Smartphone, Sparkles, Star, Trash2, Wifi, Zap } from "lucide-react";
import { cn } from "./utils/cn";
import type { AppLog, AppState, Profile, Subscription, Tab, TunnelStatus } from "./types";
import { defaultState, downloadBackup, loadState, restoreBackup, saveState } from "./lib/storage";
import { AppError, errorMessage } from "./lib/errors";
import { fetchSubscription, inspectImport, MAX_CONFIG_SIZE, parseProfile, validateSubscriptionUrl } from "./lib/parseShare";
import { CONNECT_LIMIT, STALE_SUB_MS, needProbe, rankCandidates, smartStepText } from "./lib/autoConnect";
import { browserStatus, connectionPayload, exportText, hasNativeCore, nativeRequest, supportsNative } from "./lib/native";
import { useTunnel } from "./lib/useTunnel";
import { formatBytes, formatDuration, formatRate, latencyColor, latencyScore, uid } from "./lib/format";
import { Button, Choice, Dialog, Notice, textFor, Toggle, type Text } from "./components/ui";
import { ConfigEditor, SubscriptionForm } from "./components/ConfigEditor";
import { ProfileDetail } from "./components/ProfileDetail";
import { SettingsPanel } from "./components/SettingsPanel";
import { GetApp } from "./components/GetApp";
import { ConfigFree } from "./components/ConfigFree";
import { KhoramMark } from "./components/KhoramMark";
import { APP_UPDATE_URL, APP_VERSION, APP_VERSION_URL, compareVersions } from "./lib/appVersion";

type Sheet = "import" | "subscription" | "detail" | "logs" | "getapp" | "confirm" | null;

type TrafficTelemetry = {
  downloadRate: number;
  uploadRate: number;
  history: number[];
};

const EMPTY_TRAFFIC: TrafficTelemetry = {
  downloadRate: 0,
  uploadRate: 0,
  history: Array.from({ length: 16 }, () => 0),
};

/** Derives live rates from the native core's cumulative byte counters. */
function useTrafficTelemetry(status: TunnelStatus): TrafficTelemetry {
  const previous = useRef<{ downloaded: number; uploaded: number; sampledAt: number } | null>(null);
  const [traffic, setTraffic] = useState<TrafficTelemetry>(EMPTY_TRAFFIC);

  useEffect(() => {
    if (status.state !== "connected" || status.downloaded == null || status.uploaded == null) {
      previous.current = null;
      setTraffic((current) => current.downloadRate || current.uploadRate || current.history.some(Boolean) ? EMPTY_TRAFFIC : current);
      return;
    }

    const now = performance.now();
    const last = previous.current;
    previous.current = { downloaded: status.downloaded, uploaded: status.uploaded, sampledAt: now };
    if (!last) return;

    const seconds = Math.max(0.25, (now - last.sampledAt) / 1000);
    const down = Math.max(0, status.downloaded - last.downloaded) / seconds;
    const up = Math.max(0, status.uploaded - last.uploaded) / seconds;
    setTraffic((current) => {
      // A little smoothing keeps native polling jitter from making the UI flicker.
      const downloadRate = current.downloadRate ? current.downloadRate * 0.35 + down * 0.65 : down;
      const uploadRate = current.uploadRate ? current.uploadRate * 0.35 + up * 0.65 : up;
      return {
        downloadRate,
        uploadRate,
        history: [...current.history.slice(-15), downloadRate + uploadRate],
      };
    });
  }, [status.state, status.downloaded, status.uploaded]);

  return traffic;
}

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
  const [logs, setLogs] = useState<AppLog[]>(() => loadLogs());
  const [busySub, setBusySub] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testProgress, setTestProgress] = useState("");
  const [confirmation, setConfirmation] = useState<{ title: string; hint?: string; accept: () => Promise<void> | void } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<unknown>(null);
  const [updateInfo, setUpdateInfo] = useState<{ latestVersion: string; minVersion?: string; updateUrl?: string; message?: string } | null>(null);
  const updateRequired = !!updateInfo?.minVersion && compareVersions(APP_VERSION, updateInfo.minVersion) < 0;
  const [updateChecking, setUpdateChecking] = useState(true);
  const [resolvedIp, setResolvedIp] = useState("");
  const backupInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionBusy = useRef(false);
  const testBusy = useRef(false);
  const cancelTests = useRef(false);
  const autoUpdated = useRef(false);
  const alive = useRef(true);
  // Smart auto-connect: update → fastest → connect → fallback → reconnect.
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
  const traffic = useTrafficTelemetry(tunnel.status);
  const t = textFor(state.lang);
  const selected = state.profiles.find((p) => p.id === state.selectedId) || null;
  const activeDetail = state.profiles.find((p) => p.id === detailId);
  useEffect(() => {
    setResolvedIp("");
    if (!selected?.host || !hasNativeCore()) return;
    let cancelled = false;
    void nativeRequest<{ ip: string | null }>("resolveHost", { host: selected.host }, 10_000)
      .then((result) => { if (!cancelled) setResolvedIp(result.ip || ""); })
      .catch(() => { if (!cancelled) setResolvedIp(""); });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.host]);
  const closeSheet = useCallback(() => setSheet(null), []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  const log = useCallback((level: AppLog["level"], message: string) => setLogs((old) => [{ id: uid(), time: Date.now(), level, message }, ...old].slice(0, 200)), []);
  const fail = (error: unknown) => { const message = errorMessage(error, state.lang); notify(message); log("err", message); };

  useEffect(() => {
    try { saveState(state); setStorageError(null); } catch (e) { setStorageError(e); }
  }, [state]);
  useEffect(() => {
    try { localStorage.setItem("khoram2ry:logs:v1", JSON.stringify(logs.slice(0, 200))); } catch { /* logging must never break the app */ }
  }, [logs]);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch(`${APP_VERSION_URL}?v=${Date.now()}`, { cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("UPDATE_CHECK_FAILED");
        const remote = await response.json() as { latestVersion?: string; minVersion?: string; updateUrl?: string; message?: string };
        if (!cancelled && remote.latestVersion && compareVersions(APP_VERSION, remote.latestVersion) < 0) setUpdateInfo({
          latestVersion: remote.latestVersion,
          minVersion: remote.minVersion,
          updateUrl: remote.updateUrl || APP_UPDATE_URL,
          message: remote.message,
        });
      } catch {
        // A temporary update-server failure must not lock users out of the app.
      } finally {
        if (!cancelled) setUpdateChecking(false);
      }
    };
    void check();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "fa" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = state.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", state.theme === "oled" ? "#000000" : "#07100f");
  }, [state.lang, state.theme]);
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
  const serverInsights = useMemo(() => {
    const measured = state.profiles.filter((profile) => profile.latency != null);
    const fastest = measured.reduce<Profile | null>((best, profile) => !best || (profile.latency ?? Infinity) < (best.latency ?? Infinity) ? profile : best, null);
    return {
      measured: measured.length,
      favorites: state.profiles.filter((profile) => profile.favorite).length,
      protocols: new Set(state.profiles.map((profile) => profile.protocol)).size,
      fastest,
    };
  }, [state.profiles]);

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
    // Tapping while smart-connect runs cancels the current connection workflow.
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

  const titles = { import: t("افزودن کانفیگ", "Import configuration"), configfree: t("Config Free", "Config Free"), subscription: t("مدیریت اشتراک", "Subscription"), detail: activeDetail?.name || t("جزئیات سرور", "Server details"), logs: t("گزارش فعالیت", "Activity log"), getapp: t("اتصال واقعی در اندروید", "Native Android connection"), confirm: t("تأیید عملیات", "Confirm action") };

  return <div className="relative flex min-h-dvh items-center justify-center bg-[#020504] lg:p-8">
    <div className={cn("app-shell relative flex h-dvh w-full max-w-[440px] flex-col overflow-hidden lg:h-[min(880px,calc(100dvh-64px))] lg:rounded-[36px] lg:shadow-[0_30px_110px_#000c] lg:ring-1 lg:ring-white/10", state.theme === "oled" ? "theme-oled" : "theme-night")}>
      <header inert={sheet !== null} className="nova-header relative z-10 flex shrink-0 items-center justify-between px-5 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="nova-brand"><img src="/icon.png" alt="" /><div><h1 className="latin">Khoram2Ry</h1><p className="latin">SECURE COMMAND</p></div></div>
        <div className="flex items-center gap-1.5">
          <span className={cn("nova-core-state", tunnel.status.state === "connected" && "is-online", (smartActive || tunnel.busy) && "is-pending")} title={t("وضعیت هسته اتصال", "Connection core status")}><span />{tunnel.status.state === "connected" ? t("امن", "SECURE") : smartActive || tunnel.busy ? t("فعال", "ACTIVE") : hasNativeCore() ? t("آماده", "READY") : "WEB"}</span>
          <button onClick={() => setSheet("import")} title={titles.import} aria-label={titles.import} className="nova-header-button"><Plus size={19} /></button>
          <button onClick={() => setSheet("logs")} title={titles.logs} aria-label={titles.logs} className="nova-header-button"><FileText size={16} /></button>
        </div>
      </header>
      {storageError != null && <div className="px-5 pb-2"><Notice danger>{errorMessage(storageError, state.lang)}</Notice></div>}
      <main inert={sheet !== null} className="relative z-10 min-h-0 flex-1 overflow-y-auto scroll-thin">
        <div key={tab} className="animate-fade-up">
          {tab === "home" && <Home t={t} selected={selected} status={tunnel.status} traffic={traffic} busy={tunnel.busy} error={tunnel.error ? errorMessage(tunnel.error, state.lang) : null} routing={state.routing} onRouting={(routing) => { try { requireIdle(); patch({ routing }); } catch (e) { fail(e); } }} onChoose={() => setTab("servers")} resolvedIp={resolvedIp} onAdd={() => setSheet("import")} onGetApp={() => setSheet("getapp")} onTest={() => { if (selected) void testProfile(selected).catch(fail); }} testing={!!testingId} smartActive={smartActive} smartText={smartActive && smartPhase ? smartStepText(state.lang, smartPhase, smartDetail) : ""} autoOn={state.autoFastest || state.autoReconnect} native={hasNativeCore()} />}
          {tab === "servers" && <div className="fleet-page px-5 pb-7">
            <div className="fleet-heading">
              <div><p className="fleet-kicker latin">SERVER FLEET</p><h2>{t("مرکز سرورها", "Server command")}</h2><p>{t("انتخاب، پایش و مدیریت اتصال‌ها", "Select, measure and manage every route")}</p></div>
              <Button tone="primary" aria-label={titles.import} className="fleet-add h-11 min-h-11 w-11 rounded-[14px] px-0" onClick={() => setSheet("import")}><Plus size={19} /></Button>
            </div>

            {state.profiles.length > 0 && <section className="fleet-overview">
              <div className="fleet-overview-top">
                <div className="fleet-overview-icon"><Network size={20} /></div>
                <div><strong>{t("وضعیت ناوگان", "Fleet intelligence")}</strong><small>{serverInsights.measured ? t(`${serverInsights.measured} سرور با داده واقعی`, `${serverInsights.measured} servers with live measurements`) : t("برای تحلیل، تست سرعت را اجرا کن", "Run a speed test to build intelligence")}</small></div>
                <span className="fleet-health"><span />{serverInsights.measured ? t("فعال", "LIVE") : t("آماده", "READY")}</span>
              </div>
              <div className="fleet-metrics">
                <div><span>{t("سرورها", "Servers")}</span><strong className="latin">{state.profiles.length}</strong></div>
                <div><span>{t("پروتکل", "Protocols")}</span><strong className="latin">{serverInsights.protocols}</strong></div>
                <div><span>{t("منتخب", "Saved")}</span><strong className="latin">{serverInsights.favorites}</strong></div>
              </div>
              {serverInsights.fastest && <button className="fleet-fastest" onClick={() => choose(serverInsights.fastest!.id)}><Zap size={14} /><span>{t("بهترین مسیر", "Best route")}</span><strong>{serverInsights.fastest.name}</strong><b className="latin">{serverInsights.fastest.latency} ms</b><ChevronRight size={15} className="rtl:rotate-180" /></button>}
            </section>}

            <div className="fleet-shortcuts"><Button onClick={() => setTab("subs")}><Link2 size={14} />{t("اشتراک‌ها", "Subscriptions")}<span className="latin">{state.subs.length}</span></Button><Button onClick={() => setTab("configfree")}><Download size={14} />Config Free</Button></div>

            {state.profiles.length > 0 && <section className="fleet-tools">
              <div className="fleet-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("نام، آدرس یا پروتکل…", "Name, host or protocol…")} aria-label={t("جستجوی سرور", "Search servers")} /></div>
              <div className="fleet-filters"><Choice label={t("نمایش", "Show")} value={filter} onChange={setFilter} options={[{ value: "all", label: t("همه سرورها", "All servers") }, { value: "fav", label: t("علاقه‌مندی‌ها", "Favorites") }, ...Array.from(new Set(state.profiles.map((p) => p.protocol))).map((value) => ({ value, label: value.toUpperCase() }))]} /><Choice label={t("مرتب‌سازی", "Sort by")} value={sort} onChange={setSort} options={[{ value: "added", label: t("جدیدترین", "Newest") }, { value: "latency", label: t("کمترین تأخیر", "Lowest latency") }, { value: "name", label: t("نام", "Name") }]} /></div>
              <div className="fleet-toolbar"><div><span className="latin">{filtered.length}</span> {t("نتیجه", "results")}</div><div><button disabled={tunnel.locked || !filtered.length || (!!testingId && !testProgress)} onClick={() => void testAll()}><Zap size={14} />{testProgress ? `${t("توقف", "Cancel")} ${testProgress}` : t("تحلیل همه", "Analyze all")}</button><button aria-label={t("خروجی سرورهای فیلترشده", "Export filtered servers")} disabled={!filtered.length} onClick={() => void exportText(filtered.map((p) => p.raw).join("\n"), "khoram-servers.txt").catch(fail)}><Download size={15} /></button></div></div>
            </section>}

            {state.profiles.length === 0 ? <Empty title={t("اولین مسیر امن را بساز", "Build your first secure route")} description={t("لینک، ساب‌لینک یا کانفیگ شخصی خودت را اضافه کن؛ هیچ سروری از قبل نصب نشده است.", "Import your own link, subscription or configuration. Nothing is preloaded.")} action={t("افزودن کانفیگ", "Import configuration")} onAction={() => setSheet("import")} /> : !filtered.length ? <p className="py-16 text-center text-[12px] text-white/40">{t("سروری با این فیلتر پیدا نشد.", "No servers match these filters.")}</p> : <div className="server-stack">{filtered.map((p) => {
              const isSelected = state.selectedId === p.id;
              return <article key={p.id} className={cn("server-command-card", isSelected && "is-selected")}>
                <button className="server-command-main" onClick={() => choose(p.id)} aria-pressed={isSelected}>
                  <ProtocolMark profile={p} />
                  <span className="server-command-copy"><span className="server-command-title"><strong>{p.name}</strong>{isSelected && <em><Check size={10} />{t("منتخب", "SELECTED")}</em>}</span><span className="server-command-meta latin" dir="ltr"><b>{p.protocol.toUpperCase()}</b><i />{p.security && p.security !== "none" ? p.security.toUpperCase() : "STANDARD"}<i />{p.host}</span></span>
                </button>
                <div className="server-command-side">
                  <span className={cn("server-latency latin", latencyColor(p.latency), p.latency != null && p.latency < 180 && "is-good")}><span />{testingId === p.id ? <Loader2 size={13} className="animate-spin" /> : p.latency != null ? `${p.latency} ms` : p.testedAt ? t("ناموفق", "Failed") : t("تست نشده", "Untested")}</span>
                  <div><button aria-label={t("علاقه‌مندی", "Favorite")} aria-pressed={!!p.favorite} onClick={() => setState((old) => ({ ...old, profiles: old.profiles.map((item) => item.id === p.id ? { ...item, favorite: !item.favorite } : item) }))}><Star size={14} className={p.favorite ? "fill-[#d8b36b] text-[#d8b36b]" : "text-white/25"} /></button><button aria-label={t("جزئیات و ویرایش", "Details and editing")} onClick={() => { setDetailId(p.id); setSheet("detail"); }}><ChevronRight size={15} className="rtl:rotate-180" /></button></div>
                </div>
              </article>;
            })}</div>}
          </div>}
          {tab === "configfree" && <div className="px-5 pb-7"><ConfigFree lang={state.lang} t={t} installed={state.profiles} onAdd={(profile) => addProfiles([profile])} /></div>}
          {tab === "subs" && <div className="px-5 pb-7"><div className="flex items-center justify-between"><div><h2 className="text-[19px] font-semibold">{t("اشتراک‌های من", "My subscriptions")}</h2><p className="mt-1 text-[11px] text-white/40">{t("سرورهای خودت، همیشه به‌روز", "Your servers, kept up to date")}</p></div><Button tone="primary" className="h-10 min-h-10 w-10 rounded-full px-0" aria-label={t("افزودن اشتراک", "Add subscription")} onClick={() => { setEditingSub(undefined); setIncomingUrl(""); setSheet("subscription"); }}><Plus size={18} /></Button></div>
            {!state.subs.length ? <Empty title={t("ساب‌لینکی اضافه نشده", "No subscriptions yet")} description={t("آدرس اشتراکی که از ارائه‌دهنده‌ات داری را وارد کن.", "Add the subscription URL from your provider.")} action={t("افزودن ساب‌لینک", "Add subscription")} onAction={() => { setEditingSub(undefined); setIncomingUrl(""); setSheet("subscription"); }} /> : <><Button className="my-4 w-full" busy={!!busySub} disabled={tunnel.locked} onClick={() => void refreshSubscriptions(state.subs)}><RefreshCw size={15} />{t("به‌روزرسانی همه", "Refresh all")}</Button><div className="space-y-3">{state.subs.map((sub) => <div key={sub.id} className="rounded-[12px] bg-[#1c1c1e] p-4 ring-1 ring-white/10"><div className="flex items-start justify-between gap-3"><button className="min-w-0 text-start" onClick={() => { setEditingSub(sub); setSheet("subscription"); }}><p className="truncate text-[14px] font-medium">{sub.name}</p><p className="latin mt-1 truncate text-[11px] text-white/35" dir="ltr">{safeOrigin(sub.url)}</p></button><Link2 size={18} className="mt-1 shrink-0 text-amber-200/65" /></div><p className="mt-3 text-[11px] text-white/40">{state.profiles.filter((p) => p.subId === sub.id).length} {t("سرور", "servers")} / {sub.lastUpdated ? new Date(sub.lastUpdated).toLocaleString(state.lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" }) : t("هنوز دریافت نشده", "Not fetched yet")}</p><Toggle label={t("فعال", "Enabled")} value={sub.enabled} disabled={!!busySub || tunnel.locked} onChange={(enabled) => patch({ subs: state.subs.map((s) => s.id === sub.id ? { ...s, enabled } : s) })} />{sub.error && <Notice danger>{sub.error}</Notice>}<div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><Button busy={busySub === sub.id} disabled={!!busySub || tunnel.locked || !sub.enabled} onClick={() => void refreshSubscriptions([sub])}><RefreshCw size={14} />{t("به‌روزرسانی", "Refresh")}</Button><Button tone="danger" disabled={!!busySub || tunnel.locked} onClick={() => removeSub(sub)} aria-label={t("حذف اشتراک", "Delete subscription")}><Trash2 size={15} /></Button></div></div>)}</div></>}
            <p className="mt-5 flex gap-2 text-[11px] leading-6 text-white/35"><Shield size={15} className="mt-1 shrink-0" />{t("ساب‌لینک شما خصوصی است و از طریق سرویس واسطه دریافت نمی‌شود.", "Your subscription URL stays private. No third-party relay is used.")}</p>
          </div>}
          {tab === "settings" && <SettingsPanel state={state} locked={tunnel.locked || !!testingId || !!busySub} onPatch={patch} onBackup={() => void downloadBackup(state).catch(fail)} onRestore={() => backupInput.current?.click()} onGetApp={() => setSheet("getapp")} onNativeTools={(screen) => void nativeRequest("openScreen", { screen }).catch(fail)} onClear={() => confirm({ title: t("همه سرورها و اشتراک‌ها پاک شوند؟", "Clear all profiles and subscriptions?"), hint: t("این کار قابل برگشت نیست؛ ابتدا پشتیبان بگیر.", "This cannot be undone. Export a backup first."), accept: async () => { requireIdle(); if (hasNativeCore()) await nativeRequest("clearProfiles"); setState({ ...defaultState(), lang: state.lang, theme: state.theme }); setLogs([]); } })} />}
        </div>
      </main>
      {tab === "home" && sheet === null && <ConnectButton t={t} connected={tunnel.status.available && tunnel.status.state === "connected"} pending={smartActive || tunnel.busy || tunnel.status.state === "connecting" || tunnel.status.state === "disconnecting"} disabled={tunnel.busy && !smartActive} onTrigger={() => void toggleConnection()} />}
      <nav inert={sheet !== null} aria-label={t("منوی اصلی", "Main navigation")} className="app-nav relative z-10 grid shrink-0 grid-cols-3 border-t border-white/6 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">{([{ id: "home", icon: House, label: t("خانه", "Home") }, { id: "servers", icon: Server, label: t("کانفیگ‌ها", "Configs") }, { id: "settings", icon: Settings2, label: t("تنظیمات", "Settings") }] as const).map(({ id, icon: Icon, label }) => { const active = tab === id || (id === "servers" && (tab === "configfree" || tab === "subs")); return <button key={id} onClick={() => setTab(id)} aria-current={active ? "page" : undefined} className={cn("app-nav-item flex flex-col items-center gap-1.5 py-2 text-[10px] transition", active ? "text-[#5ee6d5]" : "text-white/35")}><span className="app-nav-icon"><Icon size={19} strokeWidth={active ? 2.2 : 1.6} /></span>{label}</button>; })}</nav>
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
        {sheet === "logs" && <div className="space-y-4"><p className="text-[11px] leading-6 text-white/40">{t("فقط رویدادهای واقعی برنامه؛ رمزها و ساب‌لینک در گزارش ثبت نمی‌شوند.", "Actual application events only. Credentials and subscription URLs are not logged.")}</p>{hasNativeCore() && <Button className="w-full" onClick={() => void nativeRequest("openScreen", { screen: "logs" }).catch(fail)}><FileText size={15} />{t("باز کردن گزارش زنده هسته", "Open native core log")}</Button>}<div className="min-h-40 rounded-xl bg-black/25 p-3">{logs.length ? logs.map((entry) => <div key={entry.id} className="border-b border-white/4 py-2 text-[11px] leading-5"><time className="latin me-2 text-white/25">{new Date(entry.time).toLocaleTimeString()}</time><span className={entry.level === "err" ? "text-rose-300" : entry.level === "ok" ? "text-[#57dccb]" : "text-white/60"}>{entry.message}</span></div>) : <p className="py-12 text-center text-[12px] text-white/30">{t("هنوز رویدادی ثبت نشده", "No events yet")}</p>}</div><div className="grid grid-cols-2 gap-2"><Button onClick={() => setLogs([])}>{t("پاک کردن", "Clear")}</Button><Button disabled={!logs.length} onClick={() => void exportText(logs.map((entry) => `${new Date(entry.time).toISOString()} [${entry.level}] ${entry.message}`).join("\n"), "khoram-log.txt").catch(fail)}>{t("خروجی گزارش", "Export log")}</Button></div></div>}
        {sheet === "confirm" && confirmation && <div className="space-y-4"><h3 className="text-[15px]">{confirmation.title}</h3>{confirmation.hint && <p className="text-[12px] leading-6 text-white/45">{confirmation.hint}</p>}{confirmError != null && <Notice danger>{errorMessage(confirmError, state.lang)}</Notice>}<div className="grid grid-cols-2 gap-3"><Button onClick={closeSheet} disabled={confirmBusy}>{t("انصراف", "Cancel")}</Button><Button tone="danger" busy={confirmBusy} onClick={async () => { if (confirmBusy) return; setConfirmBusy(true); try { await confirmation.accept(); closeSheet(); } catch (e) { setConfirmError(e); } finally { setConfirmBusy(false); } }}>{t("تأیید", "Confirm")}</Button></div></div>}
      </Dialog>}
      {toast && <div className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex justify-center px-5" role="status"><div className="animate-toast max-w-full rounded-2xl bg-white/95 px-4 py-3 text-[12px] leading-6 text-zinc-950 shadow-xl">{toast}</div></div>}
      {!updateChecking && updateInfo && !updateRequired && (
        <div className="absolute inset-x-0 top-3 z-[90] flex justify-center px-4">
          <div className="flex w-full max-w-[520px] items-center gap-3 rounded-2xl bg-[#151820]/95 p-3 ring-1 ring-[#57dccb]/20 shadow-xl backdrop-blur-md">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#57dccb]/10"><Download size={18} className="text-[#57dccb]" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{t("نسخه جدید موجود است", "New version available")}</p>
              <p className="mt-1 text-[10px] text-white/40"><span className="latin">v{APP_VERSION}</span><span className="mx-1">→</span><span className="latin text-[#57dccb]">v{updateInfo.latestVersion}</span></p>
            </div>
            <a href={updateInfo.updateUrl || APP_UPDATE_URL} target="_blank" rel="noreferrer" className="shrink-0 rounded-xl bg-[#57dccb] px-3 py-2 text-[11px] font-semibold text-zinc-950">{t("آپدیت", "Update")}</a>
          </div>
        </div>
      )}
      {!updateChecking && updateInfo && updateRequired && <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 p-5 backdrop-blur-md">
        <div className="w-full max-w-[360px] rounded-[28px] bg-[#151820] p-6 ring-1 ring-[#57dccb]/15 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#57dccb]/10"><RefreshCw size={25} className="text-[#57dccb]" /></div>
          <h2 className="mt-5 text-center text-[19px] font-semibold">{t("نیاز به آپدیت", "You need update")}</h2>
          <p className="mt-3 text-center text-[12px] leading-7 text-white/45">{updateInfo.message || t("این نسخه دیگر پشتیبانی نمی‌شود. لطفاً برنامه را به‌روز کن.", "This version is no longer supported. Please update the app.")}</p>
          <div className="mt-4 rounded-2xl bg-white/4 p-3 text-center text-[11px] text-white/45">
            <span className="latin">v{APP_VERSION}</span><span className="mx-2">→</span><span className="latin text-[#57dccb]">v{updateInfo.latestVersion}</span>
          </div>
          <a href={updateInfo.updateUrl || APP_UPDATE_URL} target="_blank" rel="noreferrer" className="mt-5 flex h-11 items-center justify-center rounded-xl bg-[#57dccb] px-4 text-[12px] font-semibold text-zinc-950">{t("دریافت آپدیت", "Get update")}</a>
        </div>
      </div>}
    </div>
  </div>;
}

function loadLogs(): AppLog[] {
  try {
    const raw = localStorage.getItem("khoram2ry:logs:v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is AppLog => entry && typeof entry.id === "string" && typeof entry.time === "number" && ["info", "ok", "warn", "err"].includes(entry.level) && typeof entry.message === "string").slice(0, 200);
  } catch {
    return [];
  }
}

function safeOrigin(url: string) { try { return new URL(url).host; } catch { return ""; } }

function ProtocolMark({ profile }: { profile: Profile }) {
  const Icon = profile.protocol === "vless" ? KeyRound : profile.protocol === "vmess" ? Globe : profile.protocol === "trojan" ? LockKeyhole : profile.protocol === "ss" ? Wifi : profile.protocol === "ssr" ? Layers : profile.protocol === "hy2" ? Zap : profile.protocol === "tuic" ? Radio : profile.protocol === "custom" ? Code2 : Server;
  const label = profile.protocol === "custom" ? "Custom" : profile.protocol.toUpperCase();
  return <span title={label} aria-label={label} className="protocol-mark flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#57dccb]/15 text-[#57dccb]"><Icon size={17} strokeWidth={2.2} /></span>;
}

function Empty({ title, description, action, onAction }: { title: string; description: string; action: string; onAction: () => void }) {
  return <div className="flex flex-col items-center px-3 py-16 text-center"><div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#57dccb]/5"><Server size={29} strokeWidth={1.2} className="text-[#57dccb]/70" /></div><h3 className="mt-5 text-[16px] font-medium">{title}</h3><p className="mt-2 max-w-[270px] text-[12px] leading-7 text-white/40">{description}</p><Button tone="primary" className="mt-5" onClick={onAction}><Plus size={16} />{action}</Button></div>;
}

function Home({ t, selected, status, traffic, busy, error, routing, onRouting, onChoose, onAdd, onGetApp, onTest, testing, smartActive, smartText, autoOn, native, resolvedIp }: {
  t: Text; selected: Profile | null; status: TunnelStatus; traffic: TrafficTelemetry; busy: boolean; error: string | null;
  routing: AppState["routing"]; onRouting: (r: AppState["routing"]) => void;
  onChoose: () => void; onAdd: () => void; onGetApp: () => void;
  onTest: () => void; testing: boolean;
  smartActive: boolean; smartText: string; autoOn: boolean; native: boolean; resolvedIp: string;
}) {
  const connected = status.available && status.state === "connected";
  const pending = smartActive || busy || status.state === "connecting" || status.state === "disconnecting";
  const disconnecting = status.state === "disconnecting";
  const statusText = smartActive && smartText
    ? smartText
    : disconnecting
      ? t("در حال قطع اتصال…", "Disconnecting…")
      : pending
        ? t("در حال ساخت تونل امن…", "Building secure tunnel…")
        : connected
          ? t("ترافیک شما محافظت می‌شود", "Your traffic is protected")
          : t("آماده برای ساخت تونل امن", "Ready to build a secure tunnel");
  const serverMeta = selected ? `${selected.host}${selected.port ? `:${selected.port}` : ""}` : t("یک کانفیگ برای شروع اضافه کن", "Add a configuration to begin");
  const routeText = routing === "smart" ? t("هوشمند", "Smart") : routing === "global" ? t("سراسری", "Global") : t("مستقیم", "Direct");
  const score = latencyScore(selected?.latency);
  const quality = score == null ? t("نامشخص", "Unrated") : score >= 85 ? t("عالی", "Excellent") : score >= 65 ? t("پایدار", "Stable") : score >= 40 ? t("متوسط", "Fair") : t("ضعیف", "Poor");
  const security = selected?.security && selected.security !== "none" ? selected.security.toUpperCase() : t("استاندارد", "Standard");
  const transport = selected?.transport?.toUpperCase() || "TCP";
  const graphMax = Math.max(1, ...traffic.history);
  const routeOptions: { id: AppState["routing"]; label: string; hint: string }[] = [
    { id: "smart", label: t("هوشمند", "Smart"), hint: "AUTO" },
    { id: "global", label: t("سراسری", "Global"), hint: "VPN" },
    { id: "direct", label: t("مستقیم", "Direct"), hint: "BYPASS" },
  ];

  return <div className="nova-home px-5 pb-7">
    <section className={cn("command-hero", connected && "is-connected", pending && "is-pending")} aria-live="polite">
      <div className="command-hero-grid" aria-hidden="true" />
      <div className="command-hero-top">
        <span className="command-eyebrow"><span /> KHORAM SECURE NETWORK</span>
        <span className={cn("command-auto", autoOn && "is-enabled")}><Sparkles size={11} />{autoOn ? t("محافظ هوشمند", "SMART GUARD") : t("دستی", "MANUAL")}</span>
      </div>

      <div className="command-hero-body">
        <div className="command-orbit" aria-hidden="true">
          <span className="orbit-ring orbit-one" /><span className="orbit-ring orbit-two" /><span className="orbit-ring orbit-three" />
          <span className="orbit-node node-one" /><span className="orbit-node node-two" /><span className="orbit-node node-three" />
          <span className="command-core"><KhoramMark state={pending ? "pending" : connected ? "connected" : "idle"} /></span>
        </div>
        <div className="command-status-copy">
          <p>{statusText}</p>
          <h2>{connected ? t("تونل امن فعال است", "Secure tunnel active") : pending ? t("در حال همگام‌سازی", "Synchronizing") : t("کنترل کامل اتصال", "Connection control")}</h2>
          <div className="command-session"><Activity size={13} /><span>{connected ? t("زمان نشست", "SESSION TIME") : t("وضعیت شبکه", "NETWORK STATE")}</span><strong className="latin" dir="ltr">{connected ? formatDuration(status.elapsedMs) : "STANDBY"}</strong></div>
        </div>
      </div>

      {pending && <div className="command-progress"><span /><span /><span /><span /></div>}
      <div className="command-hero-bottom">
        <div><span>{t("مسیر", "ROUTE")}</span><strong>{routeText}</strong></div>
        <div><span>{t("هسته", "ENGINE")}</span><strong className="latin">{native ? status.core || "XRAY" : "WEB"}</strong></div>
        <div><span>{t("رمزنگاری", "SECURITY")}</span><strong className="latin">{selected ? security : "—"}</strong></div>
      </div>
    </section>

    <section className="nova-section command-section">
      <div className="command-section-heading"><div><p className="nova-section-title">{t("مسیر انتخاب‌شده", "SELECTED ROUTE")}</p><h3>{t("هویت سرور و کیفیت مسیر", "Server identity & route quality")}</h3></div>{selected && <button onClick={onChoose}>{t("تغییر", "Change")}<ChevronRight size={14} className="rtl:rotate-180" /></button>}</div>
      <button className={cn("route-card", !selected && "is-empty")} onClick={selected ? onChoose : onAdd}>
        <span className="route-icon">{selected ? <ProtocolMark profile={selected} /> : <Plus size={22} />}</span>
        <span className="route-copy">
          <span className="route-name"><strong>{selected?.name || t("انتخاب کانفیگ", "Choose a configuration")}</strong>{selected && <em className="latin">{selected.protocol.toUpperCase()}</em>}</span>
          <small className={selected ? "latin" : ""} dir={selected ? "ltr" : undefined}>{serverMeta}{resolvedIp ? ` · ${resolvedIp}` : ""}</small>
          {selected && <span className="route-tags"><i>{security}</i><i>{transport}</i>{selected.sni && <i>SNI</i>}</span>}
        </span>
        {selected ? <span className="route-score" style={{ "--score": `${score ?? 0}%` } as CSSProperties}><span><strong className="latin">{score ?? "—"}</strong><small>{quality}</small></span></span> : <ChevronRight size={18} className="nova-chevron rtl:rotate-180" />}
      </button>
    </section>

    <section className="nova-section telemetry-panel">
      <div className="telemetry-heading"><div><p className="nova-section-title">{t("تله‌متری زنده", "LIVE TELEMETRY")}</p><h3>{t("جریان این نشست", "Session throughput")}</h3></div><span className={connected ? "is-live" : ""}><i />{connected ? "LIVE" : "IDLE"}</span></div>
      <div className="telemetry-grid">
        <div><span className="telemetry-icon down"><ArrowDown size={14} /></span><p>{t("سرعت دریافت", "Download")}</p><strong className="latin" dir="ltr">{formatRate(traffic.downloadRate)}</strong></div>
        <div><span className="telemetry-icon up"><ArrowUp size={14} /></span><p>{t("سرعت ارسال", "Upload")}</p><strong className="latin" dir="ltr">{formatRate(traffic.uploadRate)}</strong></div>
        <div><span className="telemetry-icon ping"><Gauge size={14} /></span><p>{t("تأخیر مسیر", "Latency")}</p><strong className="latin" dir="ltr">{selected?.latency != null ? `${selected.latency} ms` : "—"}</strong></div>
      </div>
      <div className="telemetry-chart" aria-hidden="true">{traffic.history.map((value, index) => <span key={index} className={value > 0 ? "is-active" : ""} style={{ height: `${value > 0 ? Math.max(9, (value / graphMax) * 100) : 7}%` }} />)}</div>
      <div className="telemetry-totals"><span><ArrowDown size={12} />{t("کل دریافت", "Total down")} <b className="latin">{status.downloaded == null ? "0 B" : formatBytes(status.downloaded)}</b></span><i /><span><ArrowUp size={12} />{t("کل ارسال", "Total up")} <b className="latin">{status.uploaded == null ? "0 B" : formatBytes(status.uploaded)}</b></span></div>
    </section>

    <section className="nova-section control-deck">
      <div className="command-section-heading"><div><p className="nova-section-title">{t("مسیریابی", "TRAFFIC POLICY")}</p><h3>{t("رفتار شبکه را انتخاب کن", "Choose how traffic should flow")}</h3></div><Route size={17} /></div>
      <div className="route-segments">{routeOptions.map((option) => <button key={option.id} aria-pressed={routing === option.id} disabled={connected || pending} onClick={() => onRouting(option.id)}><span>{option.label}</span><small className="latin">{option.hint}</small></button>)}</div>
      <button className="connection-test" onClick={onTest} disabled={!selected || testing || !native}>
        <span className="connection-test-icon">{testing ? <Loader2 size={18} className="animate-spin" /> : <CircleGauge size={18} />}</span>
        <span><strong>{testing ? t("در حال تحلیل مسیر…", "Analyzing route…") : t("تحلیل کیفیت اتصال", "Analyze connection quality")}</strong><small>{selected?.latency != null ? `${quality} · ${selected.latency} ms` : t("درخواست واقعی از داخل پراکسی", "Real request through the proxy")}</small></span>
        <ChevronRight size={17} className="rtl:rotate-180" />
      </button>
    </section>

    {error && <div className="mt-4"><Notice danger>{error}</Notice></div>}
    {!native && <button onClick={onGetApp} className="ios-native-note"><Smartphone size={17} /><span><strong>{t("برای اتصال واقعی، نسخه اندروید را بگیر", "Get Android for a real VPN tunnel")}</strong><small>{t("در وب می‌توانی همه کانفیگ‌ها را امن مدیریت کنی.", "The web app securely manages your configurations.")}</small></span><ChevronRight size={17} className="rtl:rotate-180" /></button>}
  </div>;
}

function ConnectButton({ t, connected, pending, disabled, onTrigger }: { t: Text; connected: boolean; pending: boolean; disabled: boolean; onTrigger: () => void }) {
  const cancellable = pending && !disabled;
  const label = pending
    ? cancellable
      ? t("لغو اتصال هوشمند", "Cancel smart connection")
      : t("در حال ایمن‌سازی اتصال…", "Securing connection…")
    : connected
      ? t("قطع اتصال امن", "Disconnect secure tunnel")
      : t("اتصال امن", "Connect securely");
  const hint = pending
    ? cancellable
      ? t("برای توقف عملیات لمس کن", "Tap to stop the current operation")
      : t("هسته در حال آماده‌سازی تونل است", "The core is preparing your tunnel")
    : connected
      ? t("با یک لمس تونل را خاموش کن", "One tap safely stops the tunnel")
      : t("بهترین سرور به‌صورت هوشمند انتخاب می‌شود", "The best server will be selected automatically");

  return <div className="quick-connect-shell" aria-live="polite">
    <button
      type="button"
      className={cn("quick-connect", connected && "is-connected", pending && "is-pending", cancellable && "is-cancellable")}
      aria-label={label}
      aria-pressed={connected}
      aria-busy={pending && disabled}
      disabled={disabled}
      onClick={onTrigger}
    >
      <span className="quick-connect-power">{pending ? <Loader2 size={23} className="animate-spin" /> : <Power size={23} />}</span>
      <span className="quick-connect-copy"><strong>{label}</strong><small>{hint}</small></span>
      <span className="quick-connect-badge latin"><i />{connected ? "LIVE" : pending ? cancellable ? "CANCEL" : "SYNC" : "READY"}</span>
    </button>
  </div>;
}
