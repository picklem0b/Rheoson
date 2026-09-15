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
        String title = call.getString("title", "");
        int count = call.getInt("count", 1);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!hasNotificationPermission()) {
                // Still start the service — Android 13+ simply hides the
                // notification while the foreground slot remains held.
                // But tell the caller so the UI can explain missing UI.
                DownloadForegroundService.start(getContext(), title, count);
                JSObject ret = new JSObject();
                ret.put("started", true);
                ret.put("notificationVisible", false);
                call.resolve(ret);
                return;
            }
        }
        DownloadForegroundService.start(getContext(), title, count);
        JSObject ret = new JSObject();
        ret.put("started", true);
        ret.put("notificationVisible", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        DownloadForegroundService.stop(getContext());
        JSObject ret = new JSObject();
        ret.put("started", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void update(PluginCall call) {
        String title = call.getString("title", "");
        int count = call.getInt("count", 1);
        DownloadForegroundService.start(getContext(), title, count);
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
