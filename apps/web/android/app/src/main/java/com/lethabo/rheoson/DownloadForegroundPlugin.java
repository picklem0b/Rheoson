package com.lethabo.rheoson;

import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for DownloadForegroundService.
 *
 * Permission reality check (API 34+): FOREGROUND_SERVICE_DATA_SYNC is a
 * manifest-level declaration, not a runtime prompt. The runtime prompt
 * exists only for the notification permission (POST_NOTIFICATIONS, API
 * 33+), which the JS layer requests through the standard Capacitor
 * permissions API below.
 */
@CapacitorPlugin(name = "DownloadForeground")
public class DownloadForegroundPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        // Every method resolves — an exception escaping a plugin method
        // takes the whole app down, and a notification can never be worth
        // a crash. start/stop/update degrade to "no notification shown".
        try {
            String title = call.getString("title", "");
            int count = call.getInt("count", 1);
            boolean visible = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || hasNotificationPermission();
            DownloadForegroundService.start(getContext(), title, count);
            JSObject ret = new JSObject();
            ret.put("started", true);
            ret.put("notificationVisible", visible);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("started", false);
            ret.put("notificationVisible", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            DownloadForegroundService.stop(getContext());
        } catch (Exception ignored) {
            // Already stopped or the OS refused — either way we're done.
        }
        JSObject ret = new JSObject();
        ret.put("started", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void update(PluginCall call) {
        try {
            String title = call.getString("title", "");
            int count = call.getInt("count", 1);
            DownloadForegroundService.start(getContext(), title, count);
        } catch (Exception ignored) {
            // Notification text stays stale; downloads are unaffected.
        }
        call.resolve();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        call.resolve(ret);
    }

    private boolean hasNotificationPermission() {
        return getActivity() != null
            && androidx.core.content.ContextCompat.checkSelfPermission(
                   getActivity(), android.Manifest.permission.POST_NOTIFICATIONS)
               == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }
}
