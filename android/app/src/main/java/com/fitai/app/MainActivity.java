package com.fitai.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Let the WebView draw behind both system bars. Capacitor 8's bundled
        // SystemBars plugin exposes the real insets to CSS, where only
        // interactive content is moved away from the status and gesture bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Transparent bars are required for edge-to-edge on Android 14 and
        // below. Android 15+ already enforces transparent system bars.
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        // Drop the translucent grey contrast scrim the system draws behind the bars.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }
}
