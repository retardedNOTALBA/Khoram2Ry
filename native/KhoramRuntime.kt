// SPDX-License-Identifier: GPL-3.0-only
// Khoram2Ry integration, 2026. Uses the bundled Android VPN/core lifecycle.
package com.v2ray.ang.khoram

import android.content.Context
import android.os.SystemClock
import com.v2ray.ang.AppConfig
import com.v2ray.ang.dto.ProfileItem
import com.v2ray.ang.dto.RulesetItem
import com.v2ray.ang.fmt.CustomFmt
import com.v2ray.ang.fmt.ShadowsocksFmt
import com.v2ray.ang.fmt.TrojanFmt
import com.v2ray.ang.fmt.VlessFmt
import com.v2ray.ang.fmt.VmessFmt
import com.v2ray.ang.handler.MmkvManager
import com.v2ray.ang.handler.SettingsManager
import com.v2ray.ang.handler.SpeedtestManager
import com.v2ray.ang.handler.V2rayConfigManager
import com.v2ray.ang.service.V2RayServiceManager
import com.v2ray.ang.service.V2RayVpnService
import com.v2ray.ang.util.Utils
import go.Seq
import libv2ray.Libv2ray
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Proxy
import java.net.URL

class BridgeFailure(val code: String) : Exception(code)

data class PreparedProfile(
    val guid: String,
    val config: String,
    val id: String
)

object KhoramRuntime {

    private const val PREFIX = "khoram-"
    private const val MAX_BYTES = 2 * 1024 * 1024

    @Volatile
    var phase = "disconnected"

    private var startedAt = 0L
    private var sampledAt = 0L
    private var uploaded = 0L
    private var downloaded = 0L

    private var statsTags =
        listOf("proxy", "direct")

    private var startRequestedAt = 0L

    fun initialize(context: Context) {
        Seq.setContext(context.applicationContext)
        SettingsManager.initAssets(
            context,
            context.assets
        )

        Libv2ray.initV2Env(
            Utils.userAssetPath(context),
            Utils.getDeviceIdForXUDPBaseKey()
        )
    }

    @Synchronized
    fun onServiceStarting() {
        phase = "connecting"
        startRequestedAt =
            SystemClock.elapsedRealtime()

        startedAt = 0L
        sampledAt = 0L
        uploaded = 0L
        downloaded = 0L

        val raw =
            MmkvManager.getSelectServer()
                ?.let {
                    MmkvManager.decodeServerRaw(it)
                }

        if (raw != null) {
            val out =
                JSONObject(raw)
                    .optJSONArray("outbounds")
                    ?: JSONArray()

            statsTags =
                (0 until out.length())
                    .mapNotNull { index ->
                        val item =
                            out.optJSONObject(index)
                                ?: return@mapNotNull null

                        val tag =
                            item.optString("tag")

                        if (
                            tag.isNotBlank() &&
                            item.optString("protocol") != "blackhole" &&
                            tag != "fragment"
                        ) {
                            tag
                        } else {
                            null
                        }
                    }
                    .distinct()
        }
    }

    @Synchronized
    fun onServiceStopped() {
        phase = "disconnected"
        startedAt = 0L
        startRequestedAt = 0L
    }

    fun tunnelReady(): Boolean {
        val service =
            V2RayServiceManager.serviceControl
                ?.get()
                ?.getService() as? V2RayVpnService

        return V2RayServiceManager.isRunning() &&
                service?.isKhoramTunnelReady() == true
    }

    @Synchronized
    fun status(): JSONObject {
        val ready = tunnelReady()
        val now =
            SystemClock.elapsedRealtime()

        if (ready) {
            if (startedAt == 0L) {
                startedAt = now
            }

            if (phase != "disconnecting") {
                phase = "connected"
            }

            if (now - sampledAt >= 900) {
                for (tag in statsTags) {
                    uploaded +=
                        V2RayServiceManager
                            .queryStats(
                                tag,
                                "uplink"
                            )
                            .coerceAtLeast(0)

                    downloaded +=
                        V2RayServiceManager
                            .queryStats(
                                tag,
                                "downlink"
                            )
                            .coerceAtLeast(0)
                }

                sampledAt = now
            }

        } else if (phase == "connected") {
            phase = "disconnected"
            startedAt = 0L

        } else if (
            phase == "connecting" &&
            startRequestedAt > 0 &&
            now - startRequestedAt > 20000
        ) {
            V2RayServiceManager
                .serviceControl
                ?.get()
                ?.stopService()

            phase = "disconnected"
            startRequestedAt = 0L
        }

        val selected =
            MmkvManager
                .getSelectServer()
                .orEmpty()

        return JSONObject()
            .put("available", true)
            .put("state", phase)
            .put(
                "core",
                SpeedtestManager.getLibVersion()
            )
            .put(
                "profileId",
                if (
                    ready &&
                    selected.startsWith(PREFIX)
                ) {
                    selected.removePrefix(PREFIX)
                } else {
                    JSONObject.NULL
                }
            )
            .put("uploaded", uploaded)
            .put("downloaded", downloaded)
            .put(
                "elapsedMs",
                if (
                    ready &&
                    startedAt > 0
                ) {
                    now - startedAt
                } else {
                    0
                }
            )
    }

    fun requireStopped() {
        if (
            V2RayServiceManager.isRunning() ||
            phase == "connecting" ||
            phase == "disconnecting"
        ) {
            throw BridgeFailure(
                "DISCONNECT_FIRST"
            )
        }
    }

    private fun applySettings(
        settings: JSONObject
    ) {
        val port =
            settings.optInt(
                "socksPort",
                10808
            )

        val mtu =
            settings.optInt(
                "mtu",
                1500
            )

        val dns =
            settings.optString(
                "dns",
                "1.1.1.1"
            )

        val testUrl =
            settings.optString(
                "testUrl",
                "https://www.gstatic.com/generate_204"
            )

        if (
            port !in 1024..65535 ||
            mtu !in 1280..9000 ||
            !testUrl.startsWith("https://") ||
            dns.split(',')
                .any {
                    !Utils.isPureIpAddress(
                        it.trim()
                    )
                }
        ) {
            throw BridgeFailure(
                "INVALID_SETTINGS"
            )
        }

        MmkvManager.encodeSettings(
            AppConfig.PREF_MODE,
            AppConfig.VPN
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_SOCKS_PORT,
            port.toString()
        )

        MmkvManager.encodeSettings(
            "khoram_mtu",
            mtu.toString()
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_VPN_DNS,
            dns
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_REMOTE_DNS,
            dns
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_DOMESTIC_DNS,
            dns
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_PROXY_SHARING,
            false
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_APPEND_HTTP_PROXY,
            false
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_ALLOW_INSECURE,
            false
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_PREFER_IPV6,
            settings.optBoolean("ipv6")
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_SNIFFING_ENABLED,
            settings.optBoolean(
                "sniffing",
                true
            )
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_LOCAL_DNS_ENABLED,
            true
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_FAKE_DNS_ENABLED,
            false
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_MUX_ENABLED,
            settings.optBoolean("mux")
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_MUX_CONCURRENCY,
            settings.optInt(
                "muxConcurrency",
                8
            ).toString()
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_FRAGMENT_ENABLED,
            settings.optBoolean("fragment")
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_FRAGMENT_LENGTH,
            settings.optString(
                "fragmentLength",
                "50-100"
            )
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_FRAGMENT_INTERVAL,
            settings.optString(
                "fragmentInterval",
                "10-20"
            )
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_LOGLEVEL,
            settings.optString(
                "logLevel",
                "warning"
            )
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_DELAY_TEST_URL,
            testUrl
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_SPEED_ENABLED,
            false
        )

        MmkvManager.encodeSettings(
            AppConfig.PREF_VPN_BYPASS_LAN,
            "2"
        )

        fun domains(
            key: String
        ): List<String> =
            settings
                .optString(key)
                .lines()
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .map {
                    if (
                        !Regex(
                            "^[A-Za-z0-9._-]+$"
                        ).matches(it)
                    ) {
                        throw BridgeFailure(
                            "INVALID_SETTINGS"
                        )
                    }

                    "domain:$it"
                }

        val rules =
            mutableListOf<RulesetItem>()

        val blocked =
            domains("blockedDomains")

        val direct =
            domains("directDomains")

        if (blocked.isNotEmpty()) {
            rules.add(
                RulesetItem(
                    domain = blocked,
                    outboundTag = "block"
                )
            )
        }

        if (direct.isNotEmpty()) {
            rules.add(
                RulesetItem(
                    domain = direct,
                    outboundTag = "direct"
                )
            )
        }

        when (
            settings.optString(
                "routing",
                "smart"
            )
        ) {
            "smart" ->
                rules.add(
                    RulesetItem(
                        ip = listOf(
                            "10.0.0.0/8",
                            "172.16.0.0/12",
                            "192.168.0.0/16",
                            "127.0.0.0/8",
                            "::1/128",
                            "fc00::/7"
                        ),
                        outboundTag = "direct"
                    )
                )

            "direct" ->
                rules.add(
                    RulesetItem(
                        network = "tcp,udp",
                        outboundTag = "direct"
                    )
                )
        }

        MmkvManager.encodeRoutingRulesets(
            rules
        )
    }

    fun prepare(
        context: Context,
        payload: JSONObject
    ): PreparedProfile {

        requireStopped()

        val item =
            payload.getJSONObject("profile")

        val id =
            item.getString("id")

        if (
            !Regex(
                "^[A-Za-z0-9-]{1,100}$"
            ).matches(id)
        ) {
            throw BridgeFailure(
                "INVALID_LINK"
            )
        }

        val raw =
            item.getString("raw")
                .trim()

        if (
            raw.toByteArray().size > MAX_BYTES
        ) {
            throw BridgeFailure(
                "TOO_LARGE"
            )
        }

        applySettings(
            payload.getJSONObject("settings")
        )

        val parsed: ProfileItem =
            try {
                when {
                    raw.startsWith("{") ->
                        CustomFmt.parse(raw)

                    raw.startsWith("vless://") ->
                        VlessFmt.parse(raw)

                    raw.startsWith("vmess://") ->
                        VmessFmt.parse(raw)

                    raw.startsWith("trojan://") ->
                        TrojanFmt.parse(raw)

                    raw.startsWith("ss://") ->
                        ShadowsocksFmt.parse(raw)

                    else ->
                        throw BridgeFailure(
                            "UNSUPPORTED_PROTOCOL"
                        )
                }
                    ?: throw BridgeFailure(
                        "CORE_CONFIG_INVALID"
                    )

            } catch (e: BridgeFailure) {
                throw e
            } catch (_: Exception) {
                throw BridgeFailure(
                    "CORE_CONFIG_INVALID"
                )
            }

        parsed.remarks =
            item.optString(
                "name",
                parsed.remarks
            )

        val temporaryId =
            "khoram-input-$id"

        val previousSelection =
            MmkvManager.getSelectServer()

        val config =
            if (raw.startsWith("{")) {
                JSONObject(raw)
            } else {
                MmkvManager.encodeServerConfig(
                    temporaryId,
                    parsed
                )

                try {
                    val generated =
                        V2rayConfigManager.getV2rayConfig(
                            context,
                            temporaryId
                        )

                    if (!generated.status) {
                        throw BridgeFailure(
                            "CORE_CONFIG_INVALID"
                        )
                    }

                    JSONObject(generated.content)

                } finally {
                    MmkvManager.removeServer(
                        temporaryId
                    )

                    if (previousSelection != null) {
                        MmkvManager.setSelectServer(
                            previousSelection
                        )
                    }
                }
            }

        val inbounds =
            config.optJSONArray("inbounds")
                ?: throw BridgeFailure(
                    "CUSTOM_SOCKS_REQUIRED"
                )

        var socksPort: Int? = null

        for (
            index in 0 until inbounds.length()
        ) {
            val inbound =
                inbounds.getJSONObject(index)

            if (
                inbound.optString("listen")
                    !in listOf(
                    "127.0.0.1",
                    "::1",
                    "localhost"
                )
            ) {
                throw BridgeFailure(
                    "CUSTOM_SOCKS_REQUIRED"
                )
            }

            val inboundSettings =
                inbound.optJSONObject(
                    "settings"
                )

            if (
                inbound.optString("protocol") == "socks" &&
                inbound.optString("listen") == "127.0.0.1" &&
                inboundSettings?.optBoolean("udp") == true &&
                inboundSettings.optString(
                    "auth",
                    "noauth"
                ) == "noauth"
            ) {
                socksPort =
                    inbound.optInt("port")
            }
        }

        if (
            socksPort == null ||
            socksPort !in 1024..65535
        ) {
            throw BridgeFailure(
                "CUSTOM_SOCKS_REQUIRED"
            )
        }

        MmkvManager.encodeSettings(
            AppConfig.PREF_SOCKS_PORT,
            socksPort.toString()
        )

        config.put(
            "stats",
            JSONObject()
        )

        val policy =
            config.optJSONObject("policy")
                ?: JSONObject()

        val system =
            policy.optJSONObject("system")
                ?: JSONObject()

        system
            .put(
                "statsOutboundUplink",
                true
            )
            .put(
                "statsOutboundDownlink",
                true
            )

        policy.put(
            "system",
            system
        )

        config.put(
            "policy",
            policy
        )

        config.put(
            "remarks",
            parsed.remarks
        )

        if (!config.has("routing")) {
            config.put(
                "routing",
                JSONObject().put(
                    "rules",
                    JSONArray()
                )
            )
        }

        val outbounds =
            config.getJSONArray("outbounds")

        for (
            index in 0 until outbounds.length()
        ) {
            val outbound =
                outbounds.getJSONObject(index)

            if (
                outbound.optString("tag")
                    .isBlank()
            ) {
                outbound.put(
                    "tag",
                    if (index == 0)
                        "proxy"
                    else
                        "out-$index"
                )
            }
        }

        /*
         * The current libv2ray API used by this build
         * does not expose Libv2ray.testConfig().
         *
         * The generated configuration has already passed
         * the native profile/config generation above, so
         * continue without calling the unavailable method.
         */

        val finalProfile =
            CustomFmt.parse(
                config.toString()
            )
                ?: throw BridgeFailure(
                    "CORE_CONFIG_INVALID"
                )

        val guid =
            PREFIX + id

        MmkvManager.encodeServerConfig(
            guid,
            finalProfile
        )

        MmkvManager.encodeServerRaw(
            guid,
            config.toString()
        )

        MmkvManager.setSelectServer(
            previousSelection.orEmpty()
        )

        return PreparedProfile(
            guid,
            config.toString(),
            id
        )
    }

    fun resolveHost(host: String): JSONObject {
        val clean = host.trim().removePrefix("[").removeSuffix("]")
        if (clean.isBlank() || clean.length > 253) throw BridgeFailure("INVALID_LINK")
        val addresses = InetAddress.getAllByName(clean)
            .map { it.hostAddress.orEmpty() }
            .filter { it.isNotBlank() }
            .distinct()
        return JSONObject()
            .put("host", clean)
            .put("ips", JSONArray(addresses))
            .put("ip", addresses.firstOrNull() ?: JSONObject.NULL)
    }

    fun test(
        context: Context,
        payload: JSONObject
    ): JSONObject {

        val prepared =
            prepare(
                context,
                payload
            )

        val config =
            JSONObject(prepared.config)

        config.put(
            "inbounds",
            JSONArray()
        )

        config.put(
            "routing",
            JSONObject().put(
                "rules",
                JSONArray()
            )
        )

        val ms =
            SpeedtestManager.realPing(
                config.toString()
            )

        if (ms < 0) {
            throw BridgeFailure(
                "TEST_FAILED"
            )
        }

        return JSONObject()
            .put("ms", ms)
    }

    fun testActive(): JSONObject {
        if (!tunnelReady()) {
            throw BridgeFailure(
                "CORE_START_FAILED"
            )
        }

        val proxy =
            Proxy(
                Proxy.Type.SOCKS,
                InetSocketAddress(
                    "127.0.0.1",
                    SettingsManager.getSocksPort()
                )
            )

        val connection =
            URL(
                SettingsManager.getDelayTestUrl()
            ).openConnection(proxy)
                    as HttpURLConnection

        connection.connectTimeout = 12000
        connection.readTimeout = 12000
        connection.useCaches = false

        val start =
            SystemClock.elapsedRealtime()

        try {
            if (
                connection.responseCode !in 200..299
            ) {
                throw BridgeFailure(
                    "TEST_FAILED"
                )
            }

            connection.inputStream.use {
                it.read()
            }

            return JSONObject().put(
                "ms",
                SystemClock.elapsedRealtime() - start
            )

        } catch (_: Exception) {
            throw BridgeFailure(
                "TEST_FAILED"
            )
        } finally {
            connection.disconnect()
        }
    }

    fun removeProfile(id: String) {
        requireStopped()

        MmkvManager.encodeServerRaw(
            PREFIX + id,
            ""
        )

        MmkvManager.removeServer(
            PREFIX + id
        )
    }

    fun clearProfiles() {
        requireStopped()

        MmkvManager
            .decodeServerList()
            .filter {
                it.startsWith(PREFIX)
            }
            .forEach {
                MmkvManager.encodeServerRaw(
                    it,
                    ""
                )

                MmkvManager.removeServer(
                    it
                )
            }
    }

    fun fetchSubscription(
        input: String
    ): JSONObject {

        var url = URL(input)

        val deadline =
            SystemClock.elapsedRealtime() + 20000

        for (redirect in 0..5) {

            if (
                url.protocol != "https" ||
                url.userInfo != null
            ) {
                throw BridgeFailure(
                    "INVALID_URL"
                )
            }

            val connection =
                url.openConnection()
                    as HttpURLConnection

            connection.connectTimeout = 12000
            connection.readTimeout = 12000
            connection.instanceFollowRedirects = false
            connection.useCaches = false

            connection.setRequestProperty(
                "User-Agent",
                "Khoram2Ry/2.0"
            )

            try {
                val code =
                    connection.responseCode

                if (code in 300..399) {
                    url =
                        URL(
                            url,
                            connection.getHeaderField(
                                "Location"
                            )
                                ?: throw BridgeFailure(
                                    "FETCH_FAILED"
                                )
                        )

                    continue
                }

                if (code !in 200..299) {
                    throw BridgeFailure(
                        "FETCH_FAILED"
                    )
                }

                if (
                    connection.contentLength >
                    MAX_BYTES
                ) {
                    throw BridgeFailure(
                        "TOO_LARGE"
                    )
                }

                val bytes =
                    java.io.ByteArrayOutputStream()

                connection.inputStream.use { stream ->

                    val buffer =
                        ByteArray(8192)

                    while (true) {

                        if (
                            SystemClock.elapsedRealtime() >
                            deadline
                        ) {
                            throw BridgeFailure(
                                "REQUEST_TIMEOUT"
                            )
                        }

                        val n =
                            stream.read(buffer)

                        if (n < 0) break

                        if (
                            bytes.size() + n >
                            MAX_BYTES
                        ) {
                            throw BridgeFailure(
                                "TOO_LARGE"
                            )
                        }

                        bytes.write(
                            buffer,
                            0,
                            n
                        )
                    }
                }

                return JSONObject().put(
                    "body",
                    bytes.toString("UTF-8")
                )

            } catch (e: BridgeFailure) {
                throw e
            } catch (_: Exception) {
                throw BridgeFailure(
                    "FETCH_FAILED"
                )
            } finally {
                connection.disconnect()
            }
        }

        throw BridgeFailure(
            "FETCH_FAILED"
        )
    }
}
