package com.fitai.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // App background, matching the web <body> (hsl(240 5% 4%)).
    private static final int APP_BACKGROUND = Color.parseColor("#0A0A0B");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Draw edge-to-edge and own the system-bar layout ourselves. On Android
        // 15+ (targetSdk 35+) edge-to-edge is mandatory and statusBarColor /
        // navigationBarColor are ignored, so instead of colouring the bars we
        // inset the WebView and paint those areas with the app background.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Transparent bars: honoured on Android 14 and below; a no-op on 15+,
        // where the bars are already transparent under enforced edge-to-edge.
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        // Drop the translucent grey contrast scrim the system draws behind the bars.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }

        // White icons, since the bars now sit on the dark app background.
        WindowInsetsControllerCompat insetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(false);
        insetsController.setAppearanceLightNavigationBars(false);

        // Inset the content by the system bars and fill those areas with the app
        // background, so the status / navigation bars match the page (no grey).
        final View content = findViewById(android.R.id.content);
        content.setBackgroundColor(APP_BACKGROUND);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
    }
}
