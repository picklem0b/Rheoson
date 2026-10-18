package com.lethabo.rheoson;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Order matters, twice over.
        //
        // 1. CrashLogger first: it must be installed before anything else can
        //    throw, so a crash during startup — the most valuable one — is
        //    captured rather than lost.
        // 2. Plugins BEFORE super.onCreate(). BridgeActivity.registerPlugin()
        //    forwards to its Bridge.Builder, and Builder.create() (run inside
        //    super.onCreate via load()) is what actually registers them. A
        //    call made after super.onCreate() lands in a builder nobody reads
        //    again, which is how DownloadForeground silently never existed —
        //    Capacitor.Plugins.DownloadForeground was undefined in JS, the
        //    foreground service never started, and downloads died whenever the
        //    screen locked.
        CrashLogger.install(getApplicationContext());
        registerPlugin(DownloadForegroundPlugin.class);
        registerPlugin(CrashLogPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
