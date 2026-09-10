package com.fitai.app;

import android.app.Activity;
import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.SoundEffectConstants;
import android.view.View;
import com.getcapacitor.Bridge;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** A subtle system tap for navigation, respecting the device's feedback settings. */
@CapacitorPlugin(name = "VekiraNavigationFeedback")
public final class NavigationFeedbackPlugin extends Plugin {
    @PluginMethod
    public void tap(PluginCall call) {
        Bridge bridge = getBridge();
        Activity activity = bridge == null ? null : bridge.getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                View view = bridge.getWebView();
                if (activity.isFinishing() || activity.isDestroyed()
                    || view == null || !view.isAttachedToWindow() || !view.hasWindowFocus()) {
                    return;
                }

                int effect = Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                    ? HapticFeedbackConstants.SEGMENT_FREQUENT_TICK
                    : HapticFeedbackConstants.CLOCK_TICK;
                try {
                    // No ignore-setting flags or stronger waveform fallback.
                    view.performHapticFeedback(effect);
                } catch (RuntimeException unavailable) {
                    // Feedback is optional and must never interrupt navigation.
                }
                try {
                    // The system controls both the click sound and its volume.
                    view.playSoundEffect(SoundEffectConstants.CLICK);
                } catch (RuntimeException unavailable) {
                    // A missing audio service must not affect navigation or haptics.
                }
            } finally {
                call.resolve();
            }
        });
    }
}
