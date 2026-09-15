package com.lethabo.rheoson;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Explicit registration: the bridge plugin is app code, not an npm
        // capacitor plugin, so auto-discovery never sees it.
        registerPlugin(DownloadForegroundPlugin.class);
    }
}
