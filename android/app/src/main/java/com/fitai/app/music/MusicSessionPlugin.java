package com.fitai.app.music;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

@CapacitorPlugin(name = "MusicSession")
public final class MusicSessionPlugin extends Plugin {
    private static final String EVENT_SESSION_CHANGED = "sessionChanged";
    private static final String UNAVAILABLE_ERROR_CODE =
        MusicSessionCoordinator.UNAVAILABLE_ERROR_CODE;
    private static final String UNAVAILABLE_ERROR_MESSAGE =
        MusicSessionCoordinator.UNAVAILABLE_ERROR_MESSAGE;

    private final AtomicReference<MusicSessionCoordinator> coordinatorRef =
        new AtomicReference<>();

    @Override
    public void load() {
        Context context = getContext();
        MusicSessionHandlerThreadDispatcher dispatcher =
            new MusicSessionHandlerThreadDispatcher();
        AndroidRuntime runtime = new AndroidRuntime(
            context,
            dispatcher.getHandler()
        );
        MusicSessionCoordinator coordinator = new MusicSessionCoordinator(
            dispatcher,
            runtime,
            context.getPackageName()
        );
        MusicSessionCoordinator previous = coordinatorRef.getAndSet(coordinator);
        if (previous != null) {
            previous.destroy();
        }
        coordinator.start();
    }

    @PluginMethod
    public void getAuthorizationStatus(PluginCall call) {
        MusicSessionCoordinator coordinator = coordinatorRef.get();
        if (coordinator == null || !coordinator.getAuthorizationStatus(
            new MusicSessionCoordinator.Result<String>() {
                @Override
                public void resolve(String status) {
                    JSObject result = new JSObject();
                    result.put("status", status);
                    call.resolve(result);
                }

                @Override
                public void reject(String code, String message) {
                    call.reject(message, code);
                }
            }
        )) {
            rejectUnavailable(call);
        }
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
        MusicSessionCoordinator coordinator = coordinatorRef.get();
        if (coordinator == null || !coordinator.getCurrentSession(
            new MusicSessionCoordinator.Result<MusicSessionSnapshotEnvelope>() {
                @Override
                public void resolve(MusicSessionSnapshotEnvelope envelope) {
                    call.resolve(serialize(envelope));
                }

                @Override
                public void reject(String code, String message) {
                    call.reject(message, code);
                }
            }
        )) {
            rejectUnavailable(call);
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        dispatchControl(call, true);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        dispatchControl(call, false);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        MusicSessionCoordinator coordinator = coordinatorRef.get();
        if (coordinator != null) {
            coordinator.resume();
        }
    }

    @Override
    protected void handleOnDestroy() {
        MusicSessionCoordinator coordinator = coordinatorRef.getAndSet(null);
        if (coordinator != null) {
            coordinator.destroy();
        }
        super.handleOnDestroy();
    }

    private void dispatchControl(PluginCall call, boolean play) {
        MusicSessionCoordinator coordinator = coordinatorRef.get();
        if (coordinator == null) {
            rejectUnavailable(call);
            return;
        }
        MusicSessionCoordinator.Completion completion =
            new MusicSessionCoordinator.Completion() {
                @Override
                public void resolve() {
                    call.resolve();
                }

                @Override
                public void reject(String code, String message) {
                    call.reject(message, code);
                }
            };
        boolean dispatched = play
            ? coordinator.play(completion)
            : coordinator.pause(completion);
        if (!dispatched) {
            rejectUnavailable(call);
        }
    }

    private static void rejectUnavailable(PluginCall call) {
        call.reject(UNAVAILABLE_ERROR_MESSAGE, UNAVAILABLE_ERROR_CODE);
    }

    private static JSObject serialize(MusicSessionSnapshotEnvelope envelope) {
        JSObject event = new JSObject();
        MusicSessionPayload snapshot = envelope.getSnapshot();
        event.put(
            MusicSessionSnapshotEnvelope.SNAPSHOT_KEY,
            snapshot == null ? JSONObject.NULL : snapshot.toJSObject()
        );
        return event;
    }

    private final class AndroidRuntime implements MusicSessionCoordinator.Runtime {
        private final Context context;
        private final Handler ownerHandler;
        private final MediaSessionManager mediaSessionManager;
        private final ComponentName listenerComponent;
        private final MusicSessionAccess sessionAccess;
        private Runnable sessionsChanged;

        private final MediaSessionManager.OnActiveSessionsChangedListener androidListener =
            controllers -> {
                Runnable callback = sessionsChanged;
                if (callback != null) {
                    callback.run();
                }
            };

        private AndroidRuntime(Context context, Handler ownerHandler) {
            Context applicationContext = context.getApplicationContext();
            this.context = applicationContext == null ? context : applicationContext;
            this.ownerHandler = ownerHandler;
            this.mediaSessionManager = (MediaSessionManager) this.context.getSystemService(
                Context.MEDIA_SESSION_SERVICE
            );
            this.listenerComponent = new ComponentName(
                this.context,
                VekiraNotificationListenerService.class
            );
            this.sessionAccess = new MusicSessionAccess(this.context);
        }

        @Override
        public boolean isAuthorized() {
            return mediaSessionManager != null && sessionAccess.isAuthorized();
        }

        @Override
        public boolean registerActiveSessionsListener(Runnable listener) {
            sessionsChanged = listener;
            boolean registered = sessionAccess.addActiveSessionsChangedListener(
                mediaSessionManager,
                androidListener,
                listenerComponent,
                ownerHandler
            );
            if (!registered) {
                sessionsChanged = null;
            }
            return registered;
        }

        @Override
        public void unregisterActiveSessionsListener() {
            sessionsChanged = null;
            sessionAccess.removeActiveSessionsChangedListener(
                mediaSessionManager,
                androidListener
            );
        }

        @Override
        public List<MusicSessionCoordinator.Session> getActiveSessions() {
            List<MediaController> controllers = sessionAccess.getActiveSessions(
                mediaSessionManager,
                listenerComponent
            );
            List<MusicSessionCoordinator.Session> sessions = new ArrayList<>(
                controllers.size()
            );
            for (MediaController controller : controllers) {
                sessions.add(new AndroidSession(controller));
            }
            return sessions;
        }

        @Override
        public void emitSnapshot(MusicSessionSnapshotEnvelope envelope) {
            notifyListeners(EVENT_SESSION_CHANGED, serialize(envelope));
        }

        private final class AndroidSession implements MusicSessionCoordinator.Session {
            private final MediaController controller;
            private Runnable changed;

            private final MediaController.Callback androidCallback =
                new MediaController.Callback() {
                    @Override
                    public void onMetadataChanged(MediaMetadata metadata) {
                        notifyChanged();
                    }

                    @Override
                    public void onPlaybackStateChanged(PlaybackState state) {
                        notifyChanged();
                    }

                    @Override
                    public void onSessionDestroyed() {
                        notifyChanged();
                    }
                };

            private AndroidSession(MediaController controller) {
                this.controller = controller;
            }

            @Override
            public MusicSessionPayload getSnapshot() {
                return MusicSessionMapper.map(context, controller);
            }

            @Override
            public void registerChangedListener(Runnable listener) {
                changed = listener;
                try {
                    controller.registerCallback(androidCallback, ownerHandler);
                } catch (RuntimeException failure) {
                    changed = null;
                    throw failure;
                }
            }

            @Override
            public void unregisterChangedListener() {
                changed = null;
                controller.unregisterCallback(androidCallback);
            }

            @Override
            public void play() {
                controller.getTransportControls().play();
            }

            @Override
            public void pause() {
                controller.getTransportControls().pause();
            }

            private void notifyChanged() {
                Runnable callback = changed;
                if (callback != null) {
                    callback.run();
                }
            }
        }
    }
}
