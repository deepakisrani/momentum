package com.momentum.training

import android.os.Bundle
import android.net.Uri
import android.content.pm.ApplicationInfo
import android.webkit.WebSettings
import androidx.activity.result.contract.ActivityResultContracts
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import com.getcapacitor.BridgeActivity
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : BridgeActivity() {
    private var permissionCall: PluginCall? = null
    private val permissionRequest = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) {
        permissionCall?.resolve()
        permissionCall = null
    }

    private var pendingExport: Pair<PluginCall, String>? = null
    private val createCsv = registerForActivityResult(ActivityResultContracts.CreateDocument("text/csv"), ::writeExport)
    private val createJson = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json"), ::writeExport)

    private fun writeExport(uri: Uri?) {
        val (call, text) = pendingExport ?: return
        if (uri == null) {
            pendingExport = null
            call.resolve(JSObject().put("saved", false))
            return
        }
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val stream = checkNotNull(contentResolver.openOutputStream(uri))
                    stream.bufferedWriter(Charsets.UTF_8).use { it.write(text) }
                }
                call.resolve(JSObject().put("saved", true))
            } catch (error: Exception) {
                call.reject("Could not save the export", error)
            } finally {
                pendingExport = null
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(MomentumAndroidPlugin::class.java)
        super.onCreate(savedInstanceState)
        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            // The debug network policy only permits HTTP to the USB-forwarded loopback address.
            bridge.webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
    }

    fun requestHealthPermissions(call: PluginCall, permissions: Set<String>) {
        if (permissionCall != null) {
            call.reject("A permission request is already open")
            return
        }
        permissionCall = call
        try {
            permissionRequest.launch(permissions)
        } catch (error: Exception) {
            permissionCall = null
            call.reject("Could not open Health Connect permissions", error)
        }
    }

    fun saveExport(call: PluginCall, filename: String, text: String, mime: String?) {
        if (pendingExport != null) {
            call.reject("An export is already open")
            return
        }
        pendingExport = call to text
        try {
            if (mime == "application/json") createJson.launch(filename) else createCsv.launch(filename)
        } catch (error: Exception) {
            pendingExport = null
            call.reject("Could not open the file picker", error)
        }
    }
}
