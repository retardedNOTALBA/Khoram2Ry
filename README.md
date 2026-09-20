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
