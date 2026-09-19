import NetworkExtension

final class PacketTunnelProvider: NEPacketTunnelProvider {
    override func startTunnel(options: [String : NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        // The Network Extension is ready for the iOS VPN target.
        // A real proxy tunnel must be provided by an embedded Xray-compatible
        // core/library here. Apple does not allow the Android service to run on iOS.
        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "192.0.2.1")
        settings.ipv4Settings = NEIPv4Settings(
            addresses: ["192.0.2.2"],
            subnetMasks: ["255.255.255.0"]
        )
        settings.ipv4Settings?.includedRoutes = [NEIPv4Route.default()]
        settings.dnsSettings = NEDNSSettings(servers: ["1.1.1.1"])
        setTunnelNetworkSettings(settings) { error in
            completionHandler(error ?? NSError(
                domain: "Khoram2Ry",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Xray iOS core is not linked yet."]
            ))
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        completionHandler()
    }
}
