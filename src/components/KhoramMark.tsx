import { cn } from "../utils/cn";

/**
 * Khoram2Ry's compact network mark: a custom shield silhouette crossed by a
 * forward lightning route. It stays legible at the small size used by the
 * connection command center and exposes state classes for subtle animation.
 */
export function KhoramMark({ state = "idle", className }: {
  state?: "idle" | "pending" | "connected";
  className?: string;
}) {
  return <svg
    viewBox="0 0 72 72"
    role="presentation"
    aria-hidden="true"
    focusable="false"
    className={cn("khoram-mark", `is-${state}`, className)}
  >
    <circle className="khoram-mark-scan" cx="36" cy="36" r="32" />
    <path
      className="khoram-mark-shield"
      d="M36 6.5c6.7 6.1 14.7 9.8 23 11.1v16.7c0 14.2-8.2 24.8-23 31.2-14.8-6.4-23-17-23-31.2V17.6C21.3 16.3 29.3 12.6 36 6.5Z"
    />
    <path
      className="khoram-mark-inner"
      d="M36 13.7c5.2 4 10.8 6.7 16.8 8v12.5c0 10.5-5.6 18.5-16.8 24.1-11.2-5.6-16.8-13.6-16.8-24.1V21.7c6-1.3 11.6-4 16.8-8Z"
    />
    <path
      className="khoram-mark-bolt"
      d="m40.6 11.8-20 28.4h12.2l-3.7 20.4 22.3-31H39.2l1.4-17.8Z"
    />
    <path className="khoram-mark-glint" d="m40.6 11.8-20 28.4h7.1l13.7-19.6-.8-8.8Z" />
  </svg>;
}
