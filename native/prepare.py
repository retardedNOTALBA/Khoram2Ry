#!/usr/bin/env python3
"""Apply the Khoram2Ry integration to a verified, pinned v2rayNG checkout."""
import argparse
import html
import re
import shutil
import subprocess
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

UPSTREAM_COMMIT = "5b9f24c1f0799b19f6bf43fa8d4b325df8ee137f"
ANDROID = "{http://schemas.android.com/apk/res/android}"
ET.register_namespace("android", "http://schemas.android.com/apk/res/android")
ET.register_namespace("tools", "http://schemas.android.com/tools")


class ScriptSources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attributes):
        if tag == "script":
            self.sources.append(dict(attributes).get("src", ""))


def replace_checked(path, before, after):
    content = path.read_text(encoding="utf-8")
    if content.count(before) != 1:
        raise RuntimeError(f"Upstream API changed: expected exactly one patch location in {path.name}")
    path.write_text(content.replace(before, after), encoding="utf-8")


def prepare(upstream: Path, web: Path):
    commit = subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip()
    if commit != UPSTREAM_COMMIT:
        raise RuntimeError("Refusing to patch an unreviewed upstream version")
    if not (web / "index.html").is_file():
        raise RuntimeError("Build the web application before assembling Android")
    # The source exporter embeds source text in JS strings; inspect actual script tags.
    scripts = ScriptSources()
    scripts.feed((web / "index.html").read_text(encoding="utf-8"))
    if any("/src/" in src or "/@vite/" in src for src in scripts.sources):
        raise RuntimeError("The APK must contain production assets, not a dev-server page")

    source = Path(__file__).resolve().parent
    app = upstream / "V2rayNG/app"
    java = app / "src/main/java/com/v2ray/ang"
    destination = java / "khoram"
    destination.mkdir(parents=True, exist_ok=True)
    for name in ["KhoramActivity.kt", "KhoramRuntime.kt"]:
        shutil.copy2(source / name, destination / name)

    gradle = app / "build.gradle.kts"
    replace_checked(gradle, "compileSdk = 35", 'compileSdk = 35\n    ndkVersion = "29.0.13113456"')
    replace_checked(gradle, 'applicationId = "com.v2ray.ang"', 'applicationId = "com.khoram2ry.app"')
    replace_checked(gradle, 'versionName = "1.9.46"', 'versionName = "2.0.0"')
    replace_checked(gradle, "dependencies {", 'dependencies {\n    implementation("androidx.webkit:webkit:1.12.1")')

    manifest = app / "src/main/AndroidManifest.xml"
    tree = ET.parse(manifest)
    application = tree.getroot().find("application")
    application.set(ANDROID + "label", "Khoram2Ry")
    application.set(ANDROID + "icon", "@drawable/khoram_icon")
    application.set(ANDROID + "allowBackup", "false")
    for activity in application.findall("activity"):
        if activity.get(ANDROID + "name") == ".ui.MainActivity":
            for intent_filter in list(activity.findall("intent-filter")):
                if any(action.get(ANDROID + "name") == "android.intent.action.MAIN" for action in intent_filter.findall("action")):
                    activity.remove(intent_filter)
        if activity.get(ANDROID + "name") == ".ui.UrlSchemeActivity":
            # The old application must not claim v2rayNG's public deep links.
            activity.set(ANDROID + "exported", "false")
            for intent_filter in list(activity.findall("intent-filter")):
                activity.remove(intent_filter)
    activity = ET.SubElement(application, "activity", {
        ANDROID + "name": ".khoram.KhoramActivity", ANDROID + "exported": "true",
        ANDROID + "process": ":RunSoLibV2RayDaemon", ANDROID + "launchMode": "singleTask",
        ANDROID + "configChanges": "orientation|screenSize|keyboardHidden|uiMode",
        ANDROID + "theme": "@style/AppThemeDayNight.NoActionBar",
        ANDROID + "windowSoftInputMode": "adjustResize",
    })
    intent_filter = ET.SubElement(activity, "intent-filter")
    ET.SubElement(intent_filter, "action", {ANDROID + "name": "android.intent.action.MAIN"})
    ET.SubElement(intent_filter, "category", {ANDROID + "name": "android.intent.category.LAUNCHER"})
    # automatic: appear in Android's Share sheet so configs land straight in the app.
    send_filter = ET.SubElement(activity, "intent-filter")
    ET.SubElement(send_filter, "action", {ANDROID + "name": "android.intent.action.SEND"})
    ET.SubElement(send_filter, "category", {ANDROID + "name": "android.intent.category.DEFAULT"})
    ET.SubElement(send_filter, "data", {ANDROID + "mimeType": "text/plain"})
    # Deep link for one-tap subscription install: khoram2ry://import?sub=<url>
    view_filter = ET.SubElement(activity, "intent-filter")
    ET.SubElement(view_filter, "action", {ANDROID + "name": "android.intent.action.VIEW"})
    ET.SubElement(view_filter, "category", {ANDROID + "name": "android.intent.category.DEFAULT"})
    ET.SubElement(view_filter, "category", {ANDROID + "name": "android.intent.category.BROWSABLE"})
    ET.SubElement(view_filter, "data", {ANDROID + "scheme": "khoram2ry", ANDROID + "host": "import"})
    tree.write(manifest, encoding="utf-8", xml_declaration=True)

    service = java / "service/V2RayVpnService.kt"
    replace_checked(service, "private const val VPN_MTU = 1500", 'private val VPN_MTU: Int get() = (MmkvManager.decodeSettingsString("khoram_mtu")?.toIntOrNull() ?: 1500).coerceIn(1280, 9000)')
    replace_checked(service, "    override fun onRevoke() {", """    fun isKhoramTunnelReady(): Boolean {
        if (!isRunning || !::mInterface.isInitialized || !::process.isInitialized) return false
        if (!mInterface.fileDescriptor.valid()) return false
        return try { process.exitValue(); false } catch (_: IllegalThreadStateException) { true }
    }

    override fun onRevoke() {""")
    replace_checked(service, "        V2RayServiceManager.startV2rayPoint()", "        com.v2ray.ang.khoram.KhoramRuntime.onServiceStarting()\n        V2RayServiceManager.startV2rayPoint()")
    replace_checked(service, "    override fun onDestroy() {", "    override fun onDestroy() {\n        com.v2ray.ang.khoram.KhoramRuntime.onServiceStopped()")
    replace_checked(service, "        V2RayServiceManager.serviceControl = SoftReference(this)", "        com.v2ray.ang.khoram.KhoramRuntime.initialize(this)\n        V2RayServiceManager.serviceControl = SoftReference(this)")

    notifications = java / "service/NotificationService.kt"
    replace_checked(notifications, "Intent(service, MainActivity::class.java)", "Intent(service, com.v2ray.ang.khoram.KhoramActivity::class.java)")

    # Keep the namespace for upstream classes, but isolate IPC from installed v2rayNG.
    for path in (app / "src/main").rglob("*"):
        if path.suffix not in [".kt", ".xml"]:
            continue
        text = path.read_text(encoding="utf-8")
        text = text.replace("com.v2ray.ang.action.", "com.khoram2ry.app.action.")
        text = re.sub(r'(<string\s+name="(?:app_name|app_tile_name)"[^>]*>)[^<]*(</string>)', r'\1Khoram2Ry\2', text)
        path.write_text(text, encoding="utf-8")

    assets = app / "src/main/assets"
    shutil.copytree(web, assets, dirs_exist_ok=True)
    license_text = (upstream / "LICENSE").read_text(encoding="utf-8")
    (assets / "native-license.html").write_text("<!doctype html><meta charset=utf-8><title>Licenses</title><h1>Khoram2Ry</h1><p>Modified v2rayNG integration, 2026. GPL-3.0. No warranty. Not an official v2rayNG build.</p><pre>" + html.escape(license_text) + "</pre>", encoding="utf-8")
    icons = app / "src/main/res/drawable-nodpi"
    icons.mkdir(parents=True, exist_ok=True)
    shutil.copy2(web / "icon.png", icons / "khoram_icon.png")
    print("Native integration prepared. No servers or credentials have been bundled.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--web", type=Path, default=Path("dist"))
    args = parser.parse_args()
    prepare(args.upstream.resolve(), args.web.resolve())