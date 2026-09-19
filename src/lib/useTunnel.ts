import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState, Profile, TunnelStatus } from "../types";
import { browserStatus, connectionPayload, hasNativeCore, nativeRequest, supportsNative } from "./native";
import { AppError } from "./errors";

export function useTunnel() {
  const [status, setStatus] = useState<TunnelStatus>(browserStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const commandInFlight = useRef(false);
  const busyRef = useRef(false);
  const stateRef = useRef(status.state);
  stateRef.current = status.state;
  busyRef.current = busy;

  useEffect(() => {
    if (!hasNativeCore()) return;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await nativeRequest<TunnelStatus>("status", {}, 5000);
        if (!closed) setStatus(result);
      } catch (e) {
        if (!closed) { setError(e); setStatus(browserStatus); }
      }
      if (closed) return;
      // Poll faster while a transition is in progress so the UI feels instant.
      const active =
        busyRef.current ||
        stateRef.current === "connecting" ||
        stateRef.current === "disconnecting";
      timer = setTimeout(poll, active ? 600 : 1500);
    };
    void poll();
    return () => { closed = true; clearTimeout(timer); };
  }, []);

  const command = useCallback(async (action: "connect" | "disconnect", profile?: Profile, app?: AppState) => {
    if (commandInFlight.current) return;
    if (!hasNativeCore()) throw new AppError("NATIVE_REQUIRED");
    if (profile && !supportsNative(profile)) throw new AppError("UNSUPPORTED_PROTOCOL");
    commandInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await nativeRequest(action, profile && app ? connectionPayload(profile, app) : {}, action === "connect" ? 180_000 : 20_000);
      try {
        setStatus(await nativeRequest<TunnelStatus>("status"));
      } catch {
        /* polling will correct the state */
      }
    } catch (e) {
      setError(e);
      throw e;
    } finally { commandInFlight.current = false; setBusy(false); }
  }, []);

  return { status, busy, error, command, locked: busy || status.state !== "disconnected" };
}
