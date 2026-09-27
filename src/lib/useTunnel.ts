import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, Profile, TunnelStatus } from "../types";
import { browserStatus, connectionPayload, hasNativeCore, nativeRequest, supportsNative } from "./native";
import { AppError } from "./errors";

const ACTIVE_POLL_MS = 1_250;
const IDLE_POLL_MS = 5_000;
const BACKGROUND_POLL_MS = 15_000;

function sameStatus(a: TunnelStatus, b: TunnelStatus) {
  return a.available === b.available &&
    a.state === b.state &&
    a.core === b.core &&
    a.profileId === b.profileId &&
    a.uploaded === b.uploaded &&
    a.downloaded === b.downloaded &&
    a.elapsedMs === b.elapsedMs;
}

/**
 * Keeps native telemetry responsive without keeping the WebView's main thread busy.
 * Status checks are intentionally slower while disconnected or in the background;
 * connecting and connected tunnels continue to report live traffic.
 */
export function useTunnel() {
  const [status, setStatus] = useState<TunnelStatus>(browserStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const commandInFlight = useRef(false);
  const busyRef = useRef(false);
  const pollError = useRef(false);
  const stateRef = useRef(status.state);
  stateRef.current = status.state;
  busyRef.current = busy;

  useEffect(() => {
    if (!hasNativeCore()) return;
    let closed = false;
    let hidden = document.visibilityState === "hidden";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polling = false;

    const delayFor = () => {
      if (hidden) return BACKGROUND_POLL_MS;
      const active = busyRef.current || stateRef.current === "connecting" || stateRef.current === "disconnecting" || stateRef.current === "connected";
      return active ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    };

    const schedule = (delay = delayFor()) => {
      if (!closed) timer = setTimeout(poll, delay);
    };

    const poll = async () => {
      if (closed || polling) return;
      polling = true;
      try {
        const result = await nativeRequest<TunnelStatus>("status", {}, 7_000);
        if (!closed) {
          setStatus((previous) => sameStatus(previous, result) ? previous : result);
          // Do not erase a connect/disconnect error just because telemetry recovered.
          if (pollError.current) setError(null);
          pollError.current = false;
        }
      } catch (nextError) {
        if (!closed) {
          pollError.current = true;
          setError(nextError);
          setStatus((previous) => sameStatus(previous, browserStatus) ? previous : browserStatus);
        }
      } finally {
        polling = false;
        schedule();
      }
    };

    const onVisibilityChange = () => {
      hidden = document.visibilityState === "hidden";
      if (!hidden && !polling) {
        if (timer) clearTimeout(timer);
        schedule(0);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void poll();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const command = useCallback(async (action: "connect" | "disconnect", profile?: Profile, app?: AppState) => {
    if (commandInFlight.current) return;
    if (!hasNativeCore()) throw new AppError("NATIVE_REQUIRED");
    if (profile && !supportsNative(profile)) throw new AppError("UNSUPPORTED_PROTOCOL");
    commandInFlight.current = true;
    pollError.current = false;
    setBusy(true);
    setError(null);
    try {
      await nativeRequest(action, profile && app ? connectionPayload(profile, app) : {}, action === "connect" ? 180_000 : 20_000);
      try {
        const next = await nativeRequest<TunnelStatus>("status", {}, 7_000);
        setStatus((previous) => sameStatus(previous, next) ? previous : next);
      } catch {
        // The scheduled poll will correct the state without interrupting the command result.
      }
    } catch (nextError) {
      setError(nextError);
      throw nextError;
    } finally {
      commandInFlight.current = false;
      setBusy(false);
    }
  }, []);

  return { status, busy, error, command, locked: busy || status.state !== "disconnected" };
}
