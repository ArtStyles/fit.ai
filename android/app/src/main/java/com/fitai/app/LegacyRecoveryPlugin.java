package com.fitai.app;

import android.os.Handler;
import android.os.Looper;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONTokener;

/** Reads only the signed-in account's v2 drafts from the old WebView origin. */
@CapacitorPlugin(name = "LegacyRecovery")
public final class LegacyRecoveryPlugin extends Plugin {
    private static final String ORIGIN = "https://fit-ai-kohl.vercel.app/";
    private final AtomicBoolean reading = new AtomicBoolean(false);

    @PluginMethod
    public void readSessions(PluginCall call) {
        String userId = call.getString("userId", "");
        if (!userId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            call.reject("Conecta la cuenta original para recuperar sus sesiones.");
            return;
        }
        if (!reading.compareAndSet(false, true)) {
            call.reject("Ya hay una recuperación en curso.");
            return;
        }
        getActivity().runOnUiThread(() -> readOnMainThread(call, userId));
    }

    private void readOnMainThread(PluginCall call, String userId) {
        WebView storageView = new WebView(getContext());
        Handler handler = new Handler(Looper.getMainLooper());
        AtomicBoolean done = new AtomicBoolean(false);
        Runnable cleanup = () -> {
            storageView.stopLoading();
            storageView.destroy();
            reading.set(false);
        };
        Runnable timeout = () -> {
            if (done.compareAndSet(false, true)) {
                cleanup.run();
                call.reject("No se pudo leer la sesión anterior. Sus datos originales se conservaron.");
            }
        };
        WebSettings settings = storageView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setBlockNetworkLoads(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        storageView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (done.get()) return;
                String script = "(() => { const prefix='fitai_session_v2_" + userId + "_'; const rows=[]; let bytes=0; "
                    + "for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);"
                    + "if(key && key.startsWith(prefix)){const raw=localStorage.getItem(key);"
                    + "if(raw){bytes+=raw.length;if(bytes>2000000 || rows.length>=100)throw new Error('backup-too-large');"
                    + "try{const row=JSON.parse(raw);if(row.version===2 && row.userId==='" + userId + "')rows.push(row);}catch(e){}}}}"
                    + "return JSON.stringify(rows);})()";
                view.evaluateJavascript(script, result -> {
                    if (!done.compareAndSet(false, true)) return;
                    handler.removeCallbacks(timeout);
                    try {
                        Object decoded = new JSONTokener(result).nextValue();
                        if (!(decoded instanceof String)) throw new IllegalStateException("Invalid legacy response");
                        JSObject output = new JSObject();
                        output.put("snapshots", new JSONArray((String) decoded));
                        call.resolve(output);
                    } catch (Exception invalid) {
                        call.reject("No se pudo leer el respaldo anterior. Sus datos originales se conservaron.");
                    } finally {
                        cleanup.run();
                    }
                });
            }
        });
        handler.postDelayed(timeout, 10000);
        // A local empty page with the old HTTPS origin can read its DOM storage.
        // Network loads are blocked: no remote page, scripts or credentials are loaded.
        storageView.loadDataWithBaseURL(ORIGIN, "<!doctype html><html><head></head><body></body></html>", "text/html", "UTF-8", null);
    }
}
