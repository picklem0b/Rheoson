package com.lethabo.rheoson;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * Runs inside the page. Returns what it did so native knows whether to
     * leave the app:
     *   handled — an open sheet/card closed itself (listens for rheoson:back)
     *   back    — stepped back through router history
     *   home    — was on a deep page with no history, went to Home
     *   exit    — already at Home with nothing to close
     */
    private static final String BACK_JS =
        "(function(){"
        + "var e=new Event('rheoson:back',{cancelable:true});"
        + "if(!window.dispatchEvent(e))return 'handled';"
        + "var i=(history.state&&history.state.idx)||0;"
        + "if(i>0){history.back();return 'back';}"
        + "if(location.pathname!=='/'){history.pushState(null,'','/');"
        + "window.dispatchEvent(new PopStateEvent('popstate'));return 'home';}"
        + "return 'exit';})()";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Explicit registration: the bridge plugin is app code, not an npm
        // capacitor plugin, so auto-discovery never sees it.
        registerPlugin(DownloadForegroundPlugin.class);

        // The back button / gesture goes back inside the app and never kills
        // it: at the very top it sends the app to the background instead.
        // Added after super.onCreate so it outranks Capacitor's own callback.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web == null) {
                    moveTaskToBack(true);
                    return;
                }
                web.evaluateJavascript(BACK_JS, result -> {
                    if (result != null && result.contains("exit")) {
                        moveTaskToBack(true);
                    }
                });
            }
        });
    }
}
