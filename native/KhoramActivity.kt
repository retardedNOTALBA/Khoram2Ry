// SPDX-License-Identifier: GPL-3.0-only
package com.v2ray.ang.khoram

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import com.v2ray.ang.handler.MmkvManager
import com.v2ray.ang.service.V2RayServiceManager
import com.v2ray.ang.ui.LogcatActivity
import com.v2ray.ang.ui.PerAppProxyActivity
import org.json.JSONObject
import java.util.concurrent.Executors

class KhoramActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()

    private var pendingStart: Pair<String, PreparedProfile>? = null
    private var pendingSave: Pair<String, String>? = null
    private var pendingImport: String? = null
    private var pageLoaded = false
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private var starting = false
    private var stopping = false

    private val permission =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val pending = pendingStart
            pendingStart = null

            if (pending != null) {
                if (result.resultCode == Activity.RESULT_OK) {
                    startPrepared(pending.first, pending.second)
                } else {
                    starting = false
                    reply(pending.first, error = "VPN_PERMISSION_DENIED")
                }
            }
        }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private val saveDocument =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val pending = pendingSave
            pendingSave = null

            if (pending != null) {
                val uri = result.data?.data

                if (result.resultCode != Activity.RESULT_OK || uri == null) {
                    reply(pending.first, error = "CANCELLED")
                } else {
                    io.execute {
                        try {
                            val stream = contentResolver.openOutputStream(uri)
                                ?: throw BridgeFailure("BUILD_EXPORT_FAILED")

                            stream.use {
                                it.write(pending.second.toByteArray(Charsets.UTF_8))
                            }

                            reply(pending.first, JSONObject())
                        } catch (_: Exception) {
                            reply(pending.first, error = "BUILD_EXPORT_FAILED")
                        }
                    }
                }
            }
        }

    private val chooseDocument =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            fileCallback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(
                    result.resultCode,
                    result.data
                )
            )
            fileCallback = null
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        KhoramRuntime.initialize(applicationContext)

        window.statusBarColor = Color.rgb(7, 8, 12)
        window.navigationBarColor = Color.rgb(11, 13, 18)

        val assets = WebViewAssetLoader.Builder()
            .addPathHandler(
                "/",
                WebViewAssetLoader.AssetsPathHandler(this)
            )
            .build()

        web = WebView(this)

        web.setBackgroundColor(Color.rgb(7, 8, 12))

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = true
        web.settings.mixedContentMode =
            WebSettings.MIXED_CONTENT_NEVER_ALLOW
        web.settings.javaScriptCanOpenWindowsAutomatically = false

        web.addJavascriptInterface(Bridge(), "KhoramNative")

        web.webViewClient = object : WebViewClient() {

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val response = assets.shouldInterceptRequest(request.url)

                if (response != null && response.mimeType == "text/html") {
                    response.responseHeaders = mapOf(
                        "Content-Security-Policy" to
                            "default-src 'self'; " +
                            "script-src 'self' 'unsafe-inline'; " +
                            "style-src 'self' 'unsafe-inline'; " +
                            "img-src 'self' data: blob:; " +
                            "font-src 'self' data:; " +
                            "connect-src 'self' https:; " +
                            "object-src 'none'; " +
                            "frame-src 'none'; " +
                            "base-uri 'self'"
                    )
                }

                return response
            }

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                if (
                    request.url.scheme == "https" &&
                    request.url.host == "appassets.androidplatform.net"
                ) {
                    return false
                }

                if (
                    request.hasGesture() &&
                    request.url.scheme == "https"
                ) {
                    try {
                        startActivity(
                            Intent(
                                Intent.ACTION_VIEW,
                                request.url
                            )
                        )
                    } catch (_: Exception) {
                    }
                }

                return true
            }

            override fun onPageFinished(
                view: WebView,
                url: String
            ) {
                pageLoaded = true

                pendingImport?.let {
                    deliverImport(it)
                    pendingImport = null
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback

                return try {
                    chooseDocument.launch(params.createIntent())
                    true
                } catch (_: Exception) {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = null
                    false
                }
            }
        }

        setContentView(web)

        handleLaunchIntent(intent)

        ViewCompat.setOnApplyWindowInsetsListener(web) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars()
            )

            view.setPadding(
                bars.left,
                bars.top,
                bars.right,
                bars.bottom
            )

            insets
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    web.evaluateJavascript(
                        "(function(){" +
                                "if(document.querySelector('[role=dialog]')){" +
                                "document.dispatchEvent(new KeyboardEvent('keydown'," +
                                "{key:'Escape',bubbles:true}));" +
                                "return true;" +
                                "}" +
                                "return false;" +
                                "})()"
                    ) { handled ->
                        if (handled != "true") {
                            finish()
                        }
                    }
                }
            }
        )

        web.loadUrl(
            "https://appassets.androidplatform.net/index.html"
        )
    }

    private fun reply(
        id: String,
        result: JSONObject? = null,
        error: String? = null
    ) {
        val response = JSONObject().put("id", id)

        if (error != null) {
            response.put("error", error)
        } else {
            response.put(
                "result",
                result ?: JSONObject()
            )
        }

        main.post {
            if (!isDestroyed) {
                web.evaluateJavascript(
                    "window.dispatchEvent(" +
                            "new CustomEvent(" +
                            "'khoram-native-response'," +
                            "{detail:JSON.parse(" +
                            "${JSONObject.quote(response.toString())}" +
                            ")}" +
                            ")" +
                            ");",
                    null
                )
            }
        }
    }

    private fun background(
        id: String,
        work: () -> JSONObject
    ) {
        io.execute {
            try {
                reply(id, work())
            } catch (e: BridgeFailure) {
                reply(id, error = e.code)
            } catch (_: Exception) {
                reply(id, error = "CORE_CONFIG_INVALID")
            }
        }
    }

    private fun startPrepared(
        id: String,
        prepared: PreparedProfile
    ) {
        try {
            if (
                Build.VERSION.SDK_INT >= 33 &&
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermission.launch(
                    Manifest.permission.POST_NOTIFICATIONS
                )
            }

            KhoramRuntime.phase = "connecting"

            MmkvManager.setSelectServer(prepared.guid)

            V2RayServiceManager.startVService(
                this,
                prepared.guid
            )

            awaitState(id, true, 40)

        } catch (_: Exception) {
            starting = false
            KhoramRuntime.phase = "disconnected"
            reply(id, error = "CORE_START_FAILED")
        }
    }

    private fun awaitState(
        id: String,
        wantRunning: Boolean,
        attempts: Int
    ) {
        val reached =
            if (wantRunning) {
                KhoramRuntime.tunnelReady()
            } else {
                !V2RayServiceManager.isRunning() &&
                        !KhoramRuntime.tunnelReady()
            }

        if (reached) {
            starting = false
            stopping = false

            KhoramRuntime.phase =
                if (wantRunning) "connected"
                else "disconnected"

            reply(id, KhoramRuntime.status())

        } else if (attempts <= 0) {
            starting = false
            stopping = false

            if (wantRunning) {
                V2RayServiceManager.stopVService(this)
            }

            KhoramRuntime.phase =
                if (KhoramRuntime.tunnelReady())
                    "connected"
                else
                    "disconnected"

            reply(id, error = "CORE_START_FAILED")

        } else {
            main.postDelayed(
                {
                    awaitState(
                        id,
                        wantRunning,
                        attempts - 1
                    )
                },
                400
            )
        }
    }

    inner class Bridge {

        @JavascriptInterface
        fun request(
            id: String,
            method: String,
            json: String
        ) {
            if (
                json.length > 3 * 1024 * 1024 ||
                id.length > 100
            ) {
                reply(id, error = "TOO_LARGE")
                return
            }

            val data =
                try {
                    JSONObject(json)
                } catch (_: Exception) {
                    reply(id, error = "INVALID_LINK")
                    return
                }

            main.post {
                try {
                    when (method) {

                        "status" ->
                            reply(
                                id,
                                KhoramRuntime.status()
                            )

                        "connect" -> {
                            if (starting || stopping) {
                                throw BridgeFailure(
                                    "DISCONNECT_FIRST"
                                )
                            }

                            KhoramRuntime.requireStopped()
                            starting = true

                            io.execute {
                                try {
                                    val prepared =
                                        KhoramRuntime.prepare(
                                            this@KhoramActivity,
                                            data
                                        )

                                    main.post {
                                        if (isDestroyed) {
                                            starting = false
                                            return@post
                                        }

                                        val intent =
                                            VpnService.prepare(
                                                this@KhoramActivity
                                            )

                                        if (intent != null) {
                                            pendingStart =
                                                id to prepared

                                            permission.launch(intent)
                                        } else {
                                            startPrepared(
                                                id,
                                                prepared
                                            )
                                        }
                                    }

                                } catch (e: BridgeFailure) {
                                    starting = false
                                    reply(
                                        id,
                                        error = e.code
                                    )
                                } catch (_: Exception) {
                                    starting = false
                                    reply(
                                        id,
                                        error = "CORE_CONFIG_INVALID"
                                    )
                                }
                            }
                        }

                        "disconnect" -> {
                            if (starting) {
                                throw BridgeFailure(
                                    "DISCONNECT_FIRST"
                                )
                            }

                            stopping = true
                            KhoramRuntime.phase =
                                "disconnecting"

                            V2RayServiceManager.stopVService(
                                this@KhoramActivity
                            )

                            awaitState(
                                id,
                                false,
                                40
                            )
                        }

                        "test" ->
                            background(id) {
                                KhoramRuntime.test(
                                    this@KhoramActivity,
                                    data
                                )
                            }

                        "testActive" ->
                            background(id) {
                                KhoramRuntime.testActive()
                            }

                        "exportConfig" ->
                            background(id) {
                                JSONObject().put(
                                    "config",
                                    KhoramRuntime.prepare(
                                        this@KhoramActivity,
                                        data
                                    ).config
                                )
                            }

                        "fetchSubscription" ->
                            background(id) {
                                KhoramRuntime.fetchSubscription(
                                    data.getString("url")
                                )
                            }

                        "removeProfile" -> {
                            KhoramRuntime.removeProfile(
                                data.getString("id")
                            )
                            reply(id)
                        }

                        "clearProfiles" -> {
                            KhoramRuntime.clearProfiles()
                            reply(id)
                        }

                        "clipboardRead" -> {
                            val clipboard =
                                getSystemService(
                                    Context.CLIPBOARD_SERVICE
                                ) as ClipboardManager

                            reply(
                                id,
                                JSONObject().put(
                                    "text",
                                    clipboard.primaryClip
                                        ?.getItemAt(0)
                                        ?.coerceToText(
                                            this@KhoramActivity
                                        )
                                        ?.toString()
                                        .orEmpty()
                                )
                            )
                        }

                        "clipboardWrite" -> {
                            val clipboard =
                                getSystemService(
                                    Context.CLIPBOARD_SERVICE
                                ) as ClipboardManager

                            clipboard.setPrimaryClip(
                                ClipData.newPlainText(
                                    "Khoram2Ry",
                                    data.getString("text")
                                )
                            )

                            reply(id)
                        }

                        "share" -> {
                            val send =
                                Intent(Intent.ACTION_SEND)
                                    .setType("text/plain")
                                    .putExtra(
                                        Intent.EXTRA_TEXT,
                                        data.getString("text")
                                    )

                            startActivity(
                                Intent.createChooser(
                                    send,
                                    "Khoram2Ry"
                                )
                            )

                            reply(id)
                        }

                        "saveFile" -> {
                            if (pendingSave != null) {
                                throw BridgeFailure(
                                    "CANCELLED"
                                )
                            }

                            pendingSave =
                                id to data.getString("text")

                            saveDocument.launch(
                                Intent(
                                    Intent.ACTION_CREATE_DOCUMENT
                                )
                                    .addCategory(
                                        Intent.CATEGORY_OPENABLE
                                    )
                                    .setType(
                                        data.optString(
                                            "mime",
                                            "text/plain"
                                        )
                                    )
                                    .putExtra(
                                        Intent.EXTRA_TITLE,
                                        data.optString(
                                            "filename",
                                            "khoram-export.txt"
                                        )
                                    )
                            )
                        }

                        "openScreen" -> {
                            val target =
                                when (
                                    data.optString("screen")
                                ) {
                                    "perApp" -> {
                                        KhoramRuntime.requireStopped()
                                        PerAppProxyActivity::class.java
                                    }

                                    "logs" ->
                                        LogcatActivity::class.java

                                    else ->
                                        throw BridgeFailure(
                                            "INVALID_LINK"
                                        )
                                }

                            startActivity(
                                Intent(
                                    this@KhoramActivity,
                                    target
                                )
                            )

                            reply(id)
                        }

                        "notifications" -> {
                            if (Build.VERSION.SDK_INT >= 33) {
                                notificationPermission.launch(
                                    Manifest.permission.POST_NOTIFICATIONS
                                )
                            }

                            reply(id)
                        }

                        else ->
                            reply(
                                id,
                                error = "INVALID_LINK"
                            )
                    }

                } catch (e: BridgeFailure) {
                    reply(id, error = e.code)
                } catch (_: Exception) {
                    reply(
                        id,
                        error = "CORE_CONFIG_INVALID"
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleLaunchIntent(intent)
    }

    private fun handleLaunchIntent(intent: Intent?) {
        if (intent == null) return

        val text =
            when (intent.action) {
                Intent.ACTION_SEND ->
                    intent.getStringExtra(
                        Intent.EXTRA_TEXT
                    )

                Intent.ACTION_VIEW ->
                    intent.dataString

                else -> null
            }?.trim().orEmpty()

        if (
            text.isEmpty() ||
            text.length > 2 * 1024 * 1024
        ) {
            return
        }

        if (pageLoaded) {
            deliverImport(text)
        } else {
            pendingImport = text
        }
    }

    private fun deliverImport(text: String) {
        val quoted = JSONObject.quote(text)

        main.post {
            if (!isDestroyed) {
                web.evaluateJavascript(
                    "window.dispatchEvent(" +
                            "new CustomEvent(" +
                            "'khoram-import'," +
                            "{detail:{text:$quoted}}" +
                            ")" +
                            ");",
                    null
                )
            }
        }
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)

        web.removeJavascriptInterface(
            "KhoramNative"
        )

        web.destroy()
        io.shutdown()

        super.onDestroy()
    }
}
