package com.fitai.app.music;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONObject;

@CapacitorPlugin(name = "MusicSession")
public final class MusicSessionPlugin extends Plugin {
    private static final String EVENT_SESSION_CHANGED = "sessionChanged";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private MediaSessionManager mediaSessionManager;
    private ComponentName listenerComponent;
    private MusicSessionAccess sessionAccess;
    private boolean activeSessionsListenerRegistered;
    private boolean destroyed;
    private MediaController selectedController;
    private MusicSessionPayload selectedPayload;

    private final MediaSessionManager.OnActiveSessionsChangedListener activeSessionsListener =
        this::handleActiveSessionsChanged;

    private final MediaController.Callback controllerCallback = new MediaController.Callback() {
        @Override
        public void onMetadataChanged(MediaMetadata metadata) {
            refreshFromSystem(true);
        }

        @Override
        public void onPlaybackStateChanged(PlaybackState state) {
            refreshFromSystem(true);
        }

        @Override
        public void onSessionDestroyed() {
            refreshFromSystem(true);
        }
    };

    @Override
    public void load() {
        destroyed = false;
        Context context = getContext();
        mediaSessionManager = (MediaSessionManager) context.getSystemService(
            Context.MEDIA_SESSION_SERVICE
        );
        listenerComponent = new ComponentName(
            context,
            VekiraNotificationListenerService.class
        );
        sessionAccess = new MusicSessionAccess(context);
        synchronizeAuthorization(false);
    }

    @PluginMethod
    public void getAuthorizationStatus(PluginCall call) {
        boolean authorized = sessionAccess != null && sessionAccess.isAuthorized();
        if (!authorized) {
            unregisterActiveSessionsListener();
            clearUnavailableSession(false);
        }
        JSObject result = new JSObject();
        result.put("status", authorized ? "granted" : "not_granted");
        call.resolve(result);
    }

    @PluginMethod
    public void openNotificationListenerSettings(PluginCall call) {
        Intent settingsIntent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(settingsIntent);
        } catch (RuntimeException unavailable) {
            try {
                getContext().startActivity(
                    new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                );
            } catch (RuntimeException ignored) {
                // Settings are optional; the JS contract still resolves safely.
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getCurrentSession(PluginCall call) {
        synchronizeAuthorization(false);
        call.resolve(wrapSnapshot(selectedPayload));
    }

    @PluginMethod
    public void play(PluginCall call) {
        synchronizeAuthorization(false);
        if (selectedController != null && selectedPayload != null && selectedPayload.canPlay()) {
            try {
                selectedController.getTransportControls().play();
            } catch (RuntimeException ignored) {
                clearUnavailableSession(true);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        synchronizeAuthorization(false);
        if (selectedController != null && selectedPayload != null && selectedPayload.canPause()) {
            try {
                selectedController.getTransportControls().pause();
            } catch (RuntimeException ignored) {
                clearUnavailableSession(true);
            }
        }
        call.resolve();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        synchronizeAuthorization(true);
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        unregisterActiveSessionsListener();
        selectController(null, null, false);
        super.handleOnDestroy();
    }

    private void synchronizeAuthorization(boolean emitChange) {
        if (destroyed) {
            return;
        }
        if (sessionAccess == null || mediaSessionManager == null || listenerComponent == null) {
            clearUnavailableSession(emitChange);
            return;
        }
        if (!sessionAccess.isAuthorized()) {
            unregisterActiveSessionsListener();
            clearUnavailableSession(emitChange);
            return;
        }
        if (!activeSessionsListenerRegistered) {
            activeSessionsListenerRegistered = sessionAccess.addActiveSessionsChangedListener(
                mediaSessionManager,
                activeSessionsListener,
                listenerComponent
            );
            if (!activeSessionsListenerRegistered) {
                clearUnavailableSession(emitChange);
                return;
            }
        }
        refreshFromSystem(emitChange);
    }

    private void refreshFromSystem(boolean emitChange) {
        if (destroyed) {
            return;
        }
        if (sessionAccess == null || !sessionAccess.isAuthorized()) {
            unregisterActiveSessionsListener();
            clearUnavailableSession(emitChange);
            return;
        }
        selectFromControllers(
            sessionAccess.getActiveSessions(mediaSessionManager, listenerComponent),
            emitChange
        );
    }

    private void handleActiveSessionsChanged(List<MediaController> controllers) {
        if (destroyed) {
            return;
        }
        if (sessionAccess == null || !sessionAccess.isAuthorized()) {
            unregisterActiveSessionsListener();
            clearUnavailableSession(true);
            return;
        }
        selectFromControllers(
            controllers == null ? Collections.emptyList() : controllers,
            true
        );
    }

    private void selectFromControllers(
        List<MediaController> controllers,
        boolean emitChange
    ) {
        List<MusicSessionPayload> candidates = new ArrayList<>();
        List<MediaController> mappedControllers = new ArrayList<>();
        for (MediaController controller : controllers) {
            MusicSessionPayload payload = MusicSessionMapper.map(getContext(), controller);
            if (payload != null) {
                candidates.add(payload);
                mappedControllers.add(controller);
            }
        }

        MusicSessionPayload nextPayload = MusicSessionPolicy.selectFirst(
            candidates,
            getContext().getPackageName()
        );
        MediaController nextController = null;
        if (nextPayload != null) {
            nextController = mappedControllers.get(candidates.indexOf(nextPayload));
        }
        selectController(nextController, nextPayload, emitChange);
    }

    private void selectController(
        MediaController nextController,
        MusicSessionPayload nextPayload,
        boolean emitChange
    ) {
        if (selectedController != nextController) {
            if (selectedController != null) {
                try {
                    selectedController.unregisterCallback(controllerCallback);
                } catch (RuntimeException ignored) {
                    // The old session may already be gone.
                }
            }
            selectedController = nextController;
            selectedPayload = nextPayload;
            if (selectedController != null) {
                try {
                    selectedController.registerCallback(controllerCallback, mainHandler);
                } catch (RuntimeException unavailable) {
                    selectedController = null;
                    selectedPayload = null;
                }
            }
        } else {
            selectedPayload = nextPayload;
        }
        if (emitChange) {
            notifyListeners(EVENT_SESSION_CHANGED, wrapSnapshot(selectedPayload));
        }
    }

    private void clearUnavailableSession(boolean emitChange) {
        selectController(null, null, emitChange);
    }

    private void unregisterActiveSessionsListener() {
        if (!activeSessionsListenerRegistered || sessionAccess == null) {
            return;
        }
        sessionAccess.removeActiveSessionsChangedListener(
            mediaSessionManager,
            activeSessionsListener
        );
        activeSessionsListenerRegistered = false;
    }

    private static JSObject wrapSnapshot(MusicSessionPayload snapshot) {
        JSObject event = new JSObject();
        event.put(
            "snapshot",
            snapshot == null ? JSONObject.NULL : snapshot.toJSObject()
        );
        return event;
    }
}
