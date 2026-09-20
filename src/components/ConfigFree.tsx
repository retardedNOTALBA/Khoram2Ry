
import { useEffect, useState } from "react";
import { Check, Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import type { Lang, Profile } from "../types";
import { Button, Notice, type Text } from "./ui";
import { fetchConfigFree, type ConfigFreeResult } from "../lib/configFree";

export function ConfigFree({
  lang,
  t,
  installed,
  onAdd,
}: {
  lang: Lang;
  t: Text;
  installed: Profile[];
  onAdd: (profile: Profile) => void;
}) {
  const [items, setItems] = useState<ConfigFreeResult[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await fetchConfigFree();
      setItems(result.items);
      setUpdatedAt(result.feed.updatedAt || "");
    } catch {
      setError(
        t(
          "دریافت لیست کانفیگ‌های رایگان انجام نشد. اتصال اینترنت یا آدرس مخزن را بررسی کن.",
          "Could not load free configurations. Check the internet connection or repository URL."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const isInstalled = (item: ConfigFreeResult) =>
    installed.some((profile) => profile.raw === item.raw);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-teal-300/5 p-4 ring-1 ring-teal-300/10">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-300/10">
            <ShieldCheck size={19} className="text-teal-200" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-medium">
              {t("Config Free", "Config Free")}
            </h3>

            <p className="mt-1 text-[11px] leading-6 text-white/40">
              {t(
                "کانفیگ‌های منتشرشده در مخزن مرکزی را ببین و هرکدام را خواستی به سرورهای خودت اضافه کن.",
                "Browse configurations from the central repository and add the ones you want."
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-white/35">
          {items.length}{" "}
          {t("کانفیگ قابل دریافت", "available configurations")}
          {updatedAt
            ? ` · ${new Date(updatedAt).toLocaleDateString(
                lang === "fa" ? "fa-IR" : "en-US"
              )}`
            : ""}
        </p>

        <Button
          onClick={() => void load()}
          disabled={loading}
          className="h-9 min-h-9 px-3 text-[11px]"
        >
          <RefreshCw
            size={13}
            className={loading ? "animate-spin" : ""}
          />
          {t("به‌روزرسانی", "Refresh")}
        </Button>
      </div>

      {error && <Notice danger>{error}</Notice>}

      {loading && !items.length && (
        <div className="flex items-center justify-center py-14 text-white/40">
          <Loader2 size={24} className="animate-spin" />
        </div>
      )}

      {!loading && !error && !items.length && (
        <p className="py-14 text-center text-[12px] text-white/35">
          {t(
            "فعلاً کانفیگی در مخزن منتشر نشده.",
            "No configurations are published yet."
          )}
        </p>
      )}

      <div className="space-y-2.5">
        {items.map((item) => {
          const added = isInstalled(item);

          return (
            <div
              key={item.id}
              className="rounded-2xl bg-white/3 p-4 ring-1 ring-white/7"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {item.name}
                  </p>

                  <p
                    className="latin mt-1 truncate text-[10px] text-white/35"
                    dir="ltr"
                  >
                    {item.profile.protocol.toUpperCase()} ·{" "}
                    {item.profile.host}
                    {item.profile.port ? `:${item.profile.port}` : ""}
                  </p>

                  {item.note && (
                    <p className="mt-2 text-[10px] leading-5 text-white/35">
                      {item.note}
                    </p>
                  )}
                </div>

                <Button
                  tone={added ? "secondary" : "primary"}
                  disabled={added}
                  onClick={() => onAdd(item.profile)}
                  className="shrink-0 px-3 text-[11px]"
                >
                  {added ? (
                    <>
                      <Check size={13} />
                      {t("دریافت شد", "Added")}
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      {t("دریافت", "Get")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
