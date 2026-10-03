# Khoram2Ry 🚀

A modern cross-platform V2Ray client application.

Khoram2Ry is a lightweight mobile application designed to manage and connect to V2Ray-compatible configurations with a simple and modern interface.

---

## ✨ Features

- 📱 Android Support
- 🍎 iOS Support
- 🔗 Import V2Ray configurations
- ⚡ Fast and lightweight connection management
- 🎨 Modern and clean user interface
- ⚡ Smooth, low-overhead mobile WebView rendering
- 🔄 Cross-platform architecture
- 📋 Easy configuration management

---

## 🛠️ Supported Protocols

Khoram2Ry is designed to work with V2Ray-compatible configurations, including:

- VMess
- VLESS
- Shadowsocks
- Trojan
- Other compatible configurations

*(Support depends on the underlying core implementation.)*

---

## 📂 Project Structure


Khoram2Ry/
│
├── src/ # Application source code
├── native/ # Native mobile projects
├── public/ # Static resources
├── tests/ # Test files
│
├── package.json
├── vite.config.ts
└── tsconfig.json


---

## 🆕 Khoram2Ry additions

- **Config Free:** centralized free-configuration feed from `public/config-free.json`.
- **Remote updates:** `public/app-version.json` controls the current required app version.
- **Server endpoint/IP:** the Android build resolves the selected server hostname and shows the resolved IP when available.
- **Smart connection:** refresh, latency testing, fallback and reconnect remain available without branding references to other VPN apps.
- **iOS-inspired 2.2 interface:** true-black Android chrome, iOS-style grouped rows, a compact connection timer and a one-tap blue power control — while keeping Khoram2Ry’s independent identity and Android behavior.
- **Responsive native telemetry:** Xray traffic/status reads use a dedicated native worker, so a slow ping or subscription refresh does not freeze the WebView.
- **Secure Command interface:** a brand-aligned command center now exposes live upload/download rates, session traffic, route security, latency health scoring, animated connection state and a fleet-level server overview without inventing telemetry in browser mode.
- **Night + OLED surfaces:** both appearance modes now drive the app shell and Android theme color, with a cohesive teal/gold visual system, deliberate swipe protection and reduced-motion support.

See `CONFIG-FREE.md` for the repository-side configuration management instructions.

## 🚀 Development Setup

Clone the repository:

```bash
git clone https://github.com/retardedNOTALBA/Khoram2Ry.git

Go to the project directory:

cd Khoram2Ry

Install dependencies:

npm install

Run development mode:

npm run dev
📱 Building Mobile App
Android

The Android version can be built using the native Android project included in the repository.

iOS

iOS support is included.

Build requirements:

macOS
Xcode
Apple Developer tools
🔐 Privacy

Khoram2Ry is designed to manage user-provided configurations locally.

Users are responsible for the configurations they import and use.

🗺️ Roadmap
✅ Android support
✅ iOS support
🔄 Improved connection management
🔄 UI improvements
🔜 More customization options
🤝 Contributing

Contributions, bug reports, and suggestions are welcome.

Feel free to open an issue or submit a pull request.

📄 License

This project is licensed under the MIT License.

  #Made with ❤️ by <b>NOTALBA
