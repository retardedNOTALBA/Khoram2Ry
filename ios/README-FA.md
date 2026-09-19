# نسخه iOS Khoram2Ry

سورس iOS اضافه شده و شامل:

- رابط SwiftUI
- نمایش رابط وب فعلی داخل WKWebView
- Target جدا برای `Packet Tunnel` با Network Extension
- Entitlements و Info.plist لازم برای ساختار VPN
- آماده برای اتصال هسته Xray سازگار با iOS

## نکته مهم

هسته Android پروژه (`V2RayServiceManager` و `VpnService`) روی iOS قابل استفاده مستقیم نیست. برای اتصال واقعی VPN باید یک هسته Xray/LibXray سازگار با iOS به Target `Khoram2RyPacketTunnel` لینک شود و بعد منطق `startTunnel` به آن متصل شود.

برای آماده کردن UI:

```bash
npm install
npm run build
```

محتویات `dist/` را به Target اصلی iOS اضافه کنید و `index.html` را در Copy Bundle Resources قرار دهید.

سپس در Xcode:

1. یک iOS App با SwiftUI به نام `Khoram2Ry` بسازید.
2. فایل‌های `Khoram2Ry/` را به Target اصلی اضافه کنید.
3. یک Network Extension از نوع Packet Tunnel اضافه کنید و `PacketTunnelProvider.swift` را جایگزین کنید.
4. App Group/Network Extension entitlement را با Team و Bundle ID واقعی خودتان تنظیم کنید.
5. هسته Xray سازگار با iOS را به Packet Tunnel اضافه کنید.
6. برای انتشار روی App Store، قابلیت Network Extension و signing باید با حساب Apple Developer تنظیم شود.

نسخه فعلی عمداً ادعا نمی‌کند که بدون لینک شدن هسته، VPN واقعی iOS فعال است.
