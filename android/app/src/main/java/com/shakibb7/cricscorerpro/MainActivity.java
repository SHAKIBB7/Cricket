package com.shakibb7.cricscorerpro;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep web content (including the fixed bottom navigation pill)
        // out from under the Android system bars: apply the system-bar
        // and display-cutout insets as padding on the WebView itself.
        // CSS env(safe-area-inset-*) reports 0 inside Android WebView,
        // so without this the app's bottom UI can slide under the
        // gesture/navigation bar on device and overlap page text
        // (reported by TAIMUR on the first on-device APK test,
        // 2026-11-25).
        Bridge bridge = getBridge();
        if (bridge == null) {
            return;
        }
        WebView webView = bridge.getWebView();
        if (webView == null) {
            return;
        }
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, insets) -> {
            Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
