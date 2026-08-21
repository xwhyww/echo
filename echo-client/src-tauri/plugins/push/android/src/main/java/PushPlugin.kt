package com.echo.plugin.push

import android.Manifest
import android.app.Activity
import android.os.Build
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.firebase.messaging.FirebaseMessaging

/**
 * The Android counterpart of PushPlugin.swift.
 *
 * Two things differ from iOS and both shape this file:
 *
 * 1. The token is not delivered to a delegate — it is asked for, and the request
 *    returns a Task. `getToken` is therefore asynchronous all the way through,
 *    and the Rust side is handed `null` while it is in flight exactly as it is
 *    on iOS while APNs has not answered.
 * 2. Notification permission only exists from Android 13 (API 33). Below that
 *    nothing has to be granted, so `requestPermission` answers true without
 *    pretending there is a dialog to show.
 */
@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = PushPlugin.ALIAS),
    ],
)
class PushPlugin(private val activity: Activity) : Plugin(activity) {

    /** Cached once FCM answers, so later calls do not re-issue the request. */
    private var cachedToken: String? = null

    @Command
    fun requestPermission(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Pre-13: notifications are allowed unless the user turned them off
            // in system settings, and there is no runtime permission to ask for.
            resolveGranted(invoke, true)
            return
        }

        if (getPermissionState(ALIAS) == PermissionState.GRANTED) {
            resolveGranted(invoke, true)
            return
        }

        // Asked through the plugin base rather than with a raw
        // requestPermissions call: that is what routes the system dialog's
        // answer back to *this* invoke instead of to an activity callback with
        // nobody listening.
        requestPermissionForAlias(ALIAS, invoke, "permissionCallback")
    }

    @PermissionCallback
    fun permissionCallback(invoke: Invoke) {
        resolveGranted(invoke, getPermissionState(ALIAS) == PermissionState.GRANTED)
    }

    /**
     * The FCM registration token, or null while the request is still in flight.
     *
     * Null is not an error — the frontend hook polls, the same way it does on
     * iOS. A genuine failure (almost always a missing or malformed
     * google-services.json) is reported the same way on purpose, so one bad
     * launch does not break the caller's retry loop.
     */
    @Command
    fun getToken(invoke: Invoke) {
        val cached = cachedToken
        if (cached != null) {
            resolveToken(invoke, cached)
            return
        }

        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            val token = if (task.isSuccessful) task.result else null
            if (token != null) cachedToken = token
            resolveToken(invoke, token)
        }
    }

    /**
     * Present only so the three commands match iOS's shape.
     *
     * FCM has no sandbox/production split — one token works against one project,
     * and the server ignores this field for Android rows. `production` is the
     * least misleading constant to answer with.
     */
    @Command
    fun environment(invoke: Invoke) {
        val result = JSObject()
        result.put("environment", "production")
        invoke.resolve(result)
    }

    private fun resolveGranted(invoke: Invoke, granted: Boolean) {
        val result = JSObject()
        result.put("granted", granted)
        invoke.resolve(result)
    }

    private fun resolveToken(invoke: Invoke, token: String?) {
        val result = JSObject()
        result.put("token", token)
        invoke.resolve(result)
    }

    companion object {
        const val ALIAS = "postNotification"
    }
}
