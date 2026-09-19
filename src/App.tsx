function Home({ t, selected, status, busy, error, routing, onRouting, onConnect, onChoose, onAdd, onGetApp, onTest, testing, smartActive, smartText, geo, autoOn, native }: {
  t: Text;
  selected: Profile | null;
  status: TunnelStatus;
  busy: boolean;
  error: string | null;
  routing: AppState["routing"];
  onRouting: (r: AppState["routing"]) => void;
  onConnect: () => void;
  onChoose: () => void;
  onAdd: () => void;
  onGetApp: () => void;
  onTest: () => void;
  testing: boolean;
  smartActive: boolean;
  smartText: string;
  geo?: Profile["geo"];
  autoOn: boolean;
  native: boolean;
}) {
  const connected = status.available && status.state === "connected";
  const pending =
    smartActive ||
    busy ||
    status.state === "connecting" ||
    status.state === "disconnecting";

  const statusText =
    smartActive && smartText
      ? smartText
      : pending
        ? t("در انتظار سرویس اندروید", "Waiting for Android service")
        : connected
          ? t("تونل VPN فعال است", "VPN tunnel is running")
          : t("متصل نیست", "Disconnected");

  return (
    <div className="flex flex-col px-5 pb-5">
      <div className="flex justify-center gap-2">
        <span
          className={cn(
            "flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]",
            connected
              ? "bg-teal-300/10 text-teal-200"
              : "bg-white/5 text-white/45",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected
                ? "bg-teal-300"
                : pending
                  ? "animate-pulse bg-amber-300"
                  : "bg-white/30",
            )}
          />
          {statusText}
        </span>

        {native && autoOn && !connected && !pending && (
          <span className="flex items-center gap-1 rounded-full bg-teal-300/8 px-2.5 py-1.5 text-[10px] text-teal-200/80">
            <Sparkles size={11} />
            {t("خودکار", "Auto")}
          </span>
        )}
      </div>

      <div className="relative mx-auto mt-6 flex h-[214px] w-[214px] items-center justify-center">
        {connected && (
          <>
            <div className="animate-ring absolute inset-5 rounded-full border border-teal-300/20" />
            <div
              className="animate-ring absolute inset-5 rounded-full border border-teal-300/15"
              style={{ animationDelay: ".9s" }}
            />
          </>
        )}

        <div className="absolute inset-3 rounded-full border border-white/[.025]" />

        <button
          aria-label={
            smartActive
              ? t("لغو اتصال خودکار", "Cancel smart connect")
              : connected
                ? t("قطع VPN", "Disconnect VPN")
                : t("اتصال هوشمند VPN", "Smart VPN connect")
          }
          disabled={busy && !smartActive}
          onClick={onConnect}
          className={cn(
            "relative flex h-[148px] w-[148px] items-center justify-center rounded-full transition duration-300 active:scale-95 disabled:cursor-wait",
            connected
              ? "animate-orb bg-gradient-to-b from-teal-300 to-emerald-500 text-zinc-950"
              : "bg-gradient-to-b from-[#20252e] to-[#11151c] text-white/75 shadow-[0_10px_35px_#0005] ring-1 ring-white/10",
          )}
        >
          {pending ? (
            <Loader2
              className="h-12 w-12 animate-spin text-teal-200"
              strokeWidth={1.5}
            />
          ) : (
            <Power className="h-14 w-14" strokeWidth={1.5} />
          )}
        </button>
      </div>

      <p className="text-center text-[12px] text-white/40">
        {smartActive
          ? t("برای لغو، دوباره لمس کن", "Tap again to cancel")
          : !selected
            ? t(
                "اول، کانفیگ خودت را اضافه کن",
                "Start by adding your configuration",
              )
            : connected
              ? t("برای قطع اتصال لمس کن", "Tap to disconnect")
              : t(
                  "اتصال هوشمند: آپدیت، سریع‌ترین سرور، وصل شدن",
                  "Smart connect: update, fastest server, connect",
                )}
      </p>

      <button
        onClick={selected ? onChoose : onAdd}
        className="mt-6 flex items-center gap-3 rounded-2xl bg-white/4 p-3.5 text-start ring-1 ring-white/7"
      >
        {selected ? (
          <ProtocolMark profile={selected} />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
            <Plus size={21} className="text-teal-200/80" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">
            {selected
              ? selected.name
              : t("انتخاب سرور", "Select a server")}
          </p>

          <p
            className={cn(
              "mt-1 truncate text-[11px] text-white/35",
              selected && "latin",
            )}
            dir={selected ? "ltr" : undefined}
          >
            {selected
              ? `${selected.host}${selected.port ? `:${selected.port}` : ""}`
              : t(
                  "فقط سرورهایی که خودت وارد می‌کنی",
                  "Only servers you import",
                )}
          </p>
        </div>

        <ChevronRight
          size={16}
          className="text-white/30 rtl:rotate-180"
        />
      </button>

      {selected && (
        <div className="mt-2 rounded-xl bg-white/[.025] px-3 py-2 text-[10px] text-white/35">
          {geo ? (
            <div className="grid grid-cols-2 gap-2">
              <span className="flex items-center gap-1.5">
                <Globe size={11} />
                {geo.country || t("کشور نامشخص", "Unknown country")}
                {geo.countryCode ? ` (${geo.countryCode})` : ""}
              </span>

              <span
                className="latin flex items-center gap-1.5"
                dir="ltr"
              >
                <MapPin size={11} />
                {geo.ip}
              </span>

              {geo.city && (
                <span>
                  {geo.city}
                  {geo.region ? `, ${geo.region}` : ""}
                </span>
              )}

              {geo.isp && (
                <span className="truncate">
                  {geo.isp}
                </span>
              )}
            </div>
          ) : (
            <span>
              {t(
                "در حال دریافت IP و موقعیت سرور…",
                "Resolving server IP and location…",
              )}
            </span>
          )}
        </div>
      )}

      <div className="mt-5 grid grid-cols-3 divide-x divide-white/6 rtl:divide-x-reverse">
        <Metric
          icon={<ArrowDown size={13} />}
          label={t("دریافت", "Downloaded")}
          value={
            status.downloaded == null
              ? "-"
              : formatBytes(status.downloaded)
          }
        />

        <Metric
          icon={<ArrowUp size={13} />}
          label={t("ارسال", "Uploaded")}
          value={
            status.uploaded == null
              ? "-"
              : formatBytes(status.uploaded)
          }
        />

        <Metric
          icon={<Timer size={13} />}
          label={t("مدت اتصال", "Duration")}
          value={connected ? formatDuration(status.elapsedMs) : "-"}
        />
      </div>

      <div className="mt-5">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-white/35">
          <Globe size={13} />
          {t("مسیریابی", "Routing")}
        </p>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              {
                key: "smart",
                label: t("هوشمند", "Smart"),
              },
              {
                key: "global",
                label: t("سراسری", "Global"),
              },
              {
                key: "direct",
                label: t("مستقیم", "Direct"),
              },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => onRouting(item.key)}
              disabled={connected || pending}
              className={cn(
                "h-10 rounded-xl text-[12px] ring-1 transition disabled:opacity-60",
                routing === item.key
                  ? "bg-teal-300/10 text-teal-200 ring-teal-300/20"
                  : "bg-white/3 text-white/40 ring-white/6",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {routing === "direct" && (
        <p className="mt-2 text-[11px] leading-5 text-amber-200/75">
          {t(
            "حالت مستقیم: ترافیک از سرور پراکسی عبور نمی‌کند.",
            "Direct mode does not route traffic through the proxy server.",
          )}
        </p>
      )}

      {error && (
        <div className="mt-4">
          <Notice danger>{error}</Notice>
        </div>
      )}

      {status.available ? (
        <div className="mt-5 border-t border-white/6 pt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[11px] text-teal-200/75">
              <Shield size={14} />
              Xray / Android VPN
            </p>

            <button
              onClick={onTest}
              disabled={!selected || testing}
              className="flex items-center gap-1 text-[11px] text-white/50"
            >
              {testing ? (
                <Loader2
                  size={13}
                  className="animate-spin"
                />
              ) : (
                <Activity size={13} />
              )}

              {selected?.latency != null
                ? `${selected.latency} ms`
                : t("تست اتصال", "Test connection")}
            </button>
          </div>

          <p className="mt-2 text-[10px] leading-5 text-white/30">
            {t(
              "وضعیت بالا مربوط به تونل است؛ تست اتصال، دسترسی واقعی از پراکسی را بررسی می‌کند.",
              "Tunnel status is not an internet check. Test connection to verify proxy reachability.",
            )}
          </p>
        </div>
      ) : (
        <button
          onClick={onGetApp}
          className="mt-5 flex items-start gap-2.5 border-t border-white/6 pt-4 text-start"
        >
          <Smartphone
            size={17}
            className="mt-1 shrink-0 text-amber-200/60"
          />

          <div className="flex-1">
            <p className="text-[11px] text-white/65">
              {t(
                "نسخه وب؛ هسته VPN در دسترس نیست",
                "Web edition; VPN core unavailable",
              )}
            </p>

            <p className="mt-1 text-[10px] leading-6 text-white/30">
              {t(
                "مدیریت کانفیگ فعال است. اتصال واقعی به APK دارای هسته نیاز دارد.",
                "Configuration management works here. A real tunnel needs the native APK.",
              )}
            </p>
          </div>

          <CircleHelp
            size={14}
            className="mt-1 text-white/25"
          />
        </button>
      )}
    </div>
  );
}
