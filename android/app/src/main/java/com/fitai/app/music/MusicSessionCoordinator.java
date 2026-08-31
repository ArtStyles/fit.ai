package com.fitai.app.music;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class MusicSessionCoordinator {
    public static final String TRANSPORT_ERROR_CODE = "MUSIC_TRANSPORT_FAILED";
    public static final String TRANSPORT_ERROR_MESSAGE =
        "Unable to control the selected music session";

    public interface Dispatcher {
        boolean dispatch(Runnable task);

        void shutdown(Runnable cleanup);

        boolean isAccepting();
    }

    public interface Runtime {
        boolean isAuthorized();

        boolean registerActiveSessionsListener(Runnable listener);

        void unregisterActiveSessionsListener();

        List<Session> getActiveSessions();

        void emitSnapshot(MusicSessionSnapshotEnvelope envelope);
    }

    public interface Session {
        MusicSessionPayload getSnapshot();

        void registerChangedListener(Runnable listener);

        void unregisterChangedListener();

        void play();

        void pause();
    }

    public interface Result<T> {
        void resolve(T value);

        void reject(String code, String message);
    }

    public interface Completion {
        void resolve();

        void reject(String code, String message);
    }

    private final Dispatcher dispatcher;
    private final Runtime runtime;
    private final String ownPackageName;
    private final Runnable activeSessionsChanged = this::sessionsChanged;
    private final Runnable selectedSessionChanged = this::sessionsChanged;

    // These fields are exclusively read and written by Dispatcher work.
    private boolean activeSessionsListenerRegistered;
    private boolean destroyed;
    private Session selectedSession;
    private MusicSessionPayload selectedSnapshot;

    public MusicSessionCoordinator(
        Dispatcher dispatcher,
        Runtime runtime,
        String ownPackageName
    ) {
        this.dispatcher = dispatcher;
        this.runtime = runtime;
        this.ownPackageName = ownPackageName;
    }

    public boolean start() {
        return dispatcher.dispatch(() -> synchronizeOwned(false));
    }

    public boolean resume() {
        return dispatcher.dispatch(() -> synchronizeOwned(true));
    }

    public boolean sessionsChanged() {
        return dispatcher.dispatch(() -> refreshOwned(true));
    }

    public boolean getAuthorizationStatus(Result<String> result) {
        return dispatcher.dispatch(() -> {
            boolean authorized = runtime.isAuthorized();
            if (!authorized) {
                unregisterActiveSessionsListenerOwned();
                selectOwned(null, null, false);
            }
            result.resolve(authorized ? "granted" : "not_granted");
        });
    }

    public boolean getCurrentSession(Result<MusicSessionSnapshotEnvelope> result) {
        return dispatcher.dispatch(() -> {
            synchronizeOwned(false);
            result.resolve(MusicSessionSnapshotEnvelope.of(selectedSnapshot));
        });
    }

    public boolean play(Completion completion) {
        return control(true, completion);
    }

    public boolean pause(Completion completion) {
        return control(false, completion);
    }

    public void destroy() {
        dispatcher.shutdown(this::destroyOwned);
    }

    private boolean control(boolean play, Completion completion) {
        return dispatcher.dispatch(() -> controlOwned(play, completion));
    }

    private void controlOwned(boolean play, Completion completion) {
        synchronizeOwned(false);
        if (destroyed || !runtime.isAuthorized() || selectedSession == null) {
            completion.resolve();
            return;
        }
        boolean capable = play
            ? selectedSnapshot != null && selectedSnapshot.canPlay()
            : selectedSnapshot != null && selectedSnapshot.canPause();
        if (!capable) {
            completion.resolve();
            return;
        }

        try {
            if (play) {
                selectedSession.play();
            } else {
                selectedSession.pause();
            }
            completion.resolve();
        } catch (SecurityException revoked) {
            unregisterActiveSessionsListenerOwned();
            selectOwned(null, null, true);
            completion.resolve();
        } catch (RuntimeException failure) {
            refreshAfterTransportFailureOwned();
            completion.reject(TRANSPORT_ERROR_CODE, TRANSPORT_ERROR_MESSAGE);
        }
    }

    private void refreshAfterTransportFailureOwned() {
        try {
            refreshOwned(true);
        } catch (RuntimeException unavailable) {
            unregisterActiveSessionsListenerOwned();
            selectOwned(null, null, true);
        }
    }

    private void synchronizeOwned(boolean emitChange) {
        if (destroyed) {
            return;
        }
        if (!runtime.isAuthorized()) {
            unregisterActiveSessionsListenerOwned();
            selectOwned(null, null, emitChange);
            return;
        }
        if (!activeSessionsListenerRegistered) {
            activeSessionsListenerRegistered = runtime.registerActiveSessionsListener(
                activeSessionsChanged
            );
            if (!activeSessionsListenerRegistered) {
                selectOwned(null, null, emitChange);
                return;
            }
        }
        refreshOwned(emitChange);
    }

    private void refreshOwned(boolean emitChange) {
        if (destroyed) {
            return;
        }
        if (!runtime.isAuthorized()) {
            unregisterActiveSessionsListenerOwned();
            selectOwned(null, null, emitChange);
            return;
        }

        List<Session> sessions = runtime.getActiveSessions();
        if (sessions == null) {
            sessions = Collections.emptyList();
        }
        List<MusicSessionPayload> candidates = new ArrayList<>();
        List<Session> mappedSessions = new ArrayList<>();
        for (Session session : sessions) {
            try {
                MusicSessionPayload snapshot = session.getSnapshot();
                if (snapshot != null) {
                    candidates.add(snapshot);
                    mappedSessions.add(session);
                }
            } catch (RuntimeException unavailable) {
                // A stale Android controller is not an eligible session.
            }
        }

        MusicSessionPayload nextSnapshot = MusicSessionPolicy.selectFirst(
            candidates,
            ownPackageName
        );
        Session nextSession = null;
        if (nextSnapshot != null) {
            nextSession = mappedSessions.get(candidates.indexOf(nextSnapshot));
        }
        selectOwned(nextSession, nextSnapshot, emitChange);
    }

    private void selectOwned(
        Session nextSession,
        MusicSessionPayload nextSnapshot,
        boolean emitChange
    ) {
        boolean sameSession = selectedSnapshot != null
            && nextSnapshot != null
            && selectedSnapshot.getSessionId().equals(nextSnapshot.getSessionId());
        if (!sameSession) {
            if (selectedSession != null) {
                try {
                    selectedSession.unregisterChangedListener();
                } catch (RuntimeException ignored) {
                    // The old Android session may already be gone.
                }
            }
            selectedSession = nextSession;
            selectedSnapshot = nextSnapshot;
            if (selectedSession != null) {
                try {
                    selectedSession.registerChangedListener(selectedSessionChanged);
                } catch (RuntimeException unavailable) {
                    selectedSession = null;
                    selectedSnapshot = null;
                }
            }
        } else {
            selectedSnapshot = nextSnapshot;
        }

        if (emitChange && dispatcher.isAccepting()) {
            runtime.emitSnapshot(MusicSessionSnapshotEnvelope.of(selectedSnapshot));
        }
    }

    private void unregisterActiveSessionsListenerOwned() {
        if (!activeSessionsListenerRegistered) {
            return;
        }
        try {
            runtime.unregisterActiveSessionsListener();
        } catch (RuntimeException ignored) {
            // Authorization can be revoked before cleanup reaches Android.
        }
        activeSessionsListenerRegistered = false;
    }

    private void destroyOwned() {
        destroyed = true;
        unregisterActiveSessionsListenerOwned();
        selectOwned(null, null, false);
    }
}
