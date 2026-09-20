# Config Free مدیریت

لیست کانفیگ‌های رایگان از `public/config-free.json` خوانده می‌شود.

برای اضافه کردن کانفیگ:
1. فایل `public/config-free.json` را باز کن.
2. داخل `configs` یک آیتم جدید اضافه کن.
3. `id` را یکتا بگذار.
4. `name` نامی است که کاربر می‌بیند.
5. `raw` لینک کامل کانفیگ است (`vless://`, `vmess://`, `trojan://`, `ss://` یا JSON معتبر).
6. برای مخفی کردن موقت یک مورد، `"enabled": false` بگذار.
7. تغییرات را commit/push کن.

نمونه:

```json
{
  "version": 2,
  "updatedAt": "2026-09-20T12:00:00Z",
  "configs": [
    {
      "id": "server-1",
      "name": "Free Server 1",
      "note": "Germany",
      "enabled": true,
      "raw": "vless://..."
    }
  ]
}
```

بعد از انتشار، کاربران داخل `Config Free` روی `به‌روزرسانی` می‌زنند و لیست جدید را دریافت می‌کنند.

## آپدیت اجباری برنامه

نسخه فعلی برنامه در `src/lib/appVersion.ts` قرار دارد.

برای انتشار نسخه جدید:
- `APP_VERSION` را افزایش بده.
- نسخه Android در `native/prepare.py` را هم به همان نسخه تغییر بده.
- در `public/app-version.json` مقدار `latestVersion` را نسخه جدید قرار بده.
- اگر می‌خواهی نسخه‌های قدیمی حتماً مسدود شوند، `minVersion` را هم همان نسخه قرار بده.
- `updateUrl` را به صفحه دریافت APK/Release خودت تغییر بده.

برنامه نسخه راه دور را بررسی می‌کند و اگر نسخه فعلی قدیمی باشد صفحه `You need update` را نشان می‌دهد و تا آپدیت شدن ادامه نمی‌دهد.
