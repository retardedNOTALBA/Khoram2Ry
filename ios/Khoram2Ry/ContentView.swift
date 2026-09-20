import SwiftUI
import WebKit

struct ContentView: View {
    var body: some View {
        KhoramWebView()
            .ignoresSafeArea(.container, edges: [.bottom])
            .background(Color.black)
    }
}

struct KhoramWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController.add(context.coordinator, name: "khoramIOS")
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.contentInsetAdjustmentBehavior = .never

        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "dist") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            web.loadHTMLString("<html><body style='background:#05060a;color:white;font-family:-apple-system'><h2>Khoram2Ry</h2><p>Build the Vite web app bundle is missing from the iOS target.</p></body></html>", baseURL: nil)
        }
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            // Native iOS bridge is intentionally kept separate from the web UI.
            // Connect this handler to the PacketTunnelManager once an iOS Xray core
            // (or another supported core) is linked into the Packet Tunnel target.
        }
    }
}
