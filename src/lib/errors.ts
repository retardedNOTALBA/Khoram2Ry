import type { Lang } from "../types";

export class AppError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "AppError";
  }
}

const messages: Record<string, [string, string]> = {
  NATIVE_REQUIRED: ["اتصال و تست واقعی به نسخه اندروید با هسته Xray نیاز دارد؛ مرورگر تونل VPN ندارد.", "A real tunnel and proxy test require the native Android Xray app, not a browser."],
  INVALID_LINK: ["لینک یا کانفیگ معتبر نیست. آدرس، پورت و اطلاعات ورود را بررسی کنید.", "Invalid configuration. Check the address, port and credentials."],
  INVALID_JSON: ["JSON باید یک کانفیگ کامل Xray با inbounds و outbounds باشد.", "Use a complete Xray JSON configuration with inbounds and outbounds."],
  INVALID_PORT: ["پورت باید عددی بین ۱ و ۶۵۵۳۵ باشد.", "Port must be an integer from 1 to 65535."],
  INVALID_REALITY: ["برای Reality، مقدار SNI، کلید عمومی و Short ID معتبر لازم است.", "Reality requires an SNI, a valid public key and a valid short ID."],
  INVALID_UUID: ["UUID معتبر نیست.", "Invalid UUID."],
  EMPTY_IMPORT: ["هیچ کانفیگ معتبری پیدا نشد؛ سروری اضافه نشد.", "No valid configurations found. Nothing was added."],
  INVALID_URL: ["آدرس اشتراک باید با https:// شروع شود.", "The subscription URL must start with https://."],
  FETCH_FAILED: ["دریافت مستقیم ناموفق بود. در وب ممکن است CORS مانع شود؛ فایل یا محتوای ساب را وارد کنید. لینک شما به واسطه ارسال نشد.", "Direct fetch failed, possibly due to browser CORS. Import the file or body instead. Your URL was not sent to a relay."],
  REQUEST_TIMEOUT: ["پاسخ در زمان تعیین‌شده دریافت نشد. وضعیت اتصال را دوباره بررسی کنید.", "The request timed out. Check the connection status again."],
  TOO_LARGE: ["حداکثر اندازه فایل کانفیگ ۲ مگابایت است.", "Configuration files must be smaller than 2 MB."],
  INVALID_BACKUP: ["ساختار فایل پشتیبان معتبر نیست؛ اطلاعات فعلی تغییر نکرد.", "Invalid backup. Existing data has not changed."],
  STORAGE_FULL: ["ذخیره‌سازی دستگاه در دسترس نیست یا پر شده است. پشتیبان بگیرید.", "Device storage is unavailable or full. Export a backup."],
  CLIPBOARD: ["دسترسی به کلیپ‌بورد ممکن نشد؛ متن را دستی بچسبانید.", "Clipboard access failed. Paste manually."],
  UNSUPPORTED_PROTOCOL: ["این پروتکل در هسته این نسخه پشتیبانی نمی‌شود؛ لینک را می‌توانید نگه دارید و خروجی بگیرید.", "This core does not support this protocol. You can still store and export the link."],
  VPN_PERMISSION_DENIED: ["مجوز VPN اندروید تأیید نشد؛ اتصال برقرار نشد.", "Android VPN permission was denied. No connection was started."],
  CORE_CONFIG_INVALID: ["هسته Xray این کانفیگ را نپذیرفت. پارامترها را بررسی کنید.", "Xray rejected this configuration. Check its parameters."],
  CORE_START_FAILED: ["هسته یا رابط VPN شروع نشد. گزارش اندروید را بررسی کنید.", "The core or VPN interface failed to start. Check the Android log."],
  DISCONNECT_FIRST: ["ابتدا اتصال را قطع کنید تا تنظیمات یا سرور فعال تغییر کند.", "Disconnect before changing the active profile or core settings."],
  TEST_FAILED: ["درخواست آزمایشی از پراکسی پاسخ نگرفت.", "The test request did not receive a response through the proxy."],
  QR_NOT_FOUND: ["QR معتبر در تصویر پیدا نشد.", "No readable QR code was found in this image."],
  INVALID_SETTINGS: ["DNS، پورت، MTU، آدرس تست یا بازه‌های Fragment معتبر نیستند.", "Check the DNS, port, MTU, test URL and fragment ranges."],
  CUSTOM_SOCKS_REQUIRED: ["کانفیگ JSON باید ورودی SOCKS بدون رمز روی 127.0.0.1 با UDP فعال داشته باشد.", "Custom JSON needs a no-auth SOCKS inbound on 127.0.0.1 with UDP enabled."],
  BUILD_EXPORT_FAILED: ["فایل‌های پروژه دریافت نشدند؛ دوباره تلاش کنید.", "Could not collect the project files. Please try again."],
  CANCELLED: ["عملیات لغو شد.", "Operation cancelled."],
  NO_SUPPORTED: ["هیچ سرور قابل اتصالی پیدا نشد. یک کانفیگ VLESS / VMess / Trojan / Shadowsocks یا JSON معتبر اضافه کنید.", "No connectable server found. Add a valid VLESS / VMess / Trojan / Shadowsocks or JSON configuration."],
  ALL_FAILED: ["اتصال به هیچ‌کدام از سرورها برقرار نشد. ساب‌لینک را به‌روز کنید یا سرور دیگری امتحان کنید.", "Could not connect to any server. Refresh your subscription or try another server."],
  NO_PROFILES: ["هنوز سروری اضافه نشده. اول ساب‌لینک یا کانفیگ خودت را وارد کن.", "No servers yet. Import your subscription or configuration first."],
};

export function errorMessage(error: unknown, lang: Lang): string {
  const code = error instanceof AppError ? error.code : "UNKNOWN";
  return messages[code]?.[lang === "fa" ? 0 : 1] || (lang === "fa" ? "عملیات ناموفق بود؛ گزارش را بررسی کنید." : "The operation failed. Check the log.");
}