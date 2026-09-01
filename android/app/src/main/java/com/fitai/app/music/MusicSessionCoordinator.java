package com.fitai.app.music;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class MusicSessionCoordinator {
    public static final String UNAVAILABLE_ERROR_CODE = "MUSIC_SESSION_UNAVAILABLE";
    public static final String UNAVAILABLE_ERROR_MESSAGE =
        "Music session integration is no longer available";
    public static final String TRANSPORT_ERROR_CODE = "MUSIC_TRANSPORT_FAILED";
    public static final String TRANSPORT_ERROR_MESSAGE =
        "Unable to control the selected music session";

    public interface Dispatcher {
        long CLOSED_CLAIM = -1L;

        boolean dispatch(Runnable task);

        void shutdown(Runnable cleanup);

        boolean isAccepting();

        long claimIfAccepting();

        boolean isClaimCurrent(long claim);
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
        return dispatcher.dispatch(() -> {
            long claim = dispatcher.claimIfAccepting();
            if (claim != Dispatcher.CLOSED_CLAIM) {
                synchronizeOwned(claim, false);
            }
        });
    }

    public boolean resume() {
        return dispatcher.dispatch(() -> {
            long claim = dispatcher.claimIfAccepting();
            if (claim != Dispatcher.CLOSED_CLAIM) {
                synchronizeOwned(claim, true);
            }
        });
    }

    public boolean sessionsChanged() {
        return dispatcher.dispatch(() -> {
            long claim = dispatcher.claimIfAccepting();
            if (claim != Dispatcher.CLOSED_CLAIM) {
                refreshOwned(claim, true);
            }
        });
    }

    public boolean getAuthorizationStatus(Result<String> result) {
        return dispatcher.dispatch(() -> {
            long claim = dispatcher.claimIfAccepting();
            if (claim == Dispatcher.CLOSED_CLAIM) {
                rejectUnavailable(result);
                return;
            }
            final boolean authorized;
            try {
                authorized = runtime.isAuthorized();
            } catch (RuntimeException unavailable) {
                rejectUnavailable(result);
                return;
            }
            if (!dispatcher.isClaimCurrent(claim)) {
                rejectUnavailable(result);
                return;
            }
            if (!authorized) {
                clearOwned(claim, false);
            }
            if (dispatcher.isClaimCurrent(claim)) {
                // Successful validation is the completion linearization point.
                result.resolve(authorized ? "granted" : "not_granted");
            } else {
                rejectUnavailable(result);
            }
        });
    }

    public boolean getCurrentSession(Result<MusicSessionSnapshotEnvelope> result) {
        return dispatcher.dispatch(() -> {
            long claim = dispatcher.claimIfAccepting();
            if (claim == Dispatcher.CLOSED_CLAIM) {
                rejectUnavailable(result);
                return;
            }
            try {
                synchronizeOwned(claim, false);
            } catch (RuntimeException unavailable) {
                rejectUnavailable(result);
                return;
            }
            if (dispatcher.isClaimCurrent(claim)) {
                // PluginCall completion is external and therefore runs outside the lock.
                result.resolve(MusicSessionSnapshotEnvelope.of(selectedSnapshot));
            } else {
                rejectUnavailable(result);
            }
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
        return dispatcher.dispatch(() -> {
            long claim = dispatcher.claimIfAccepting();
            if (claim == Dispatcher.CLOSED_CLAIM) {
                rejectUnavailable(completion);
                return;
            }
            controlOwned(claim, play, completion);
        });
    }

    private void controlOwned(long claim, boolean play, Completion completion) {
        try {
            synchronizeOwned(claim, false);
        } catch (RuntimeException unavailable) {
            rejectUnavailable(completion);
            return;
        }

        if (!dispatcher.isClaimCurrent(claim)) {
            rejectUnavailable(completion);
            return;
        }
        if (destroyed || selectedSession == null) {
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

        Session target = selectedSession;
        // This validation is the transport linearization point. Shutdown may close and
        // return while the already-claimed Binder call remains in flight.
        if (!dispatcher.isClaimCurrent(claim)) {
            rejectUnavailable(completion);
            return;
        }
        try {
            if (play) {
                target.play();
            } else {
                target.pause();
            }
        } catch (SecurityException revoked) {
            try {
                clearOwned(claim, true);
            } catch (RuntimeException ignored) {
                // Revocation remains a resolved no-op even if event delivery fails.
            }
            completion.resolve();
            return;
        } catch (RuntimeException failure) {
            refreshAfterTransportFailureOwned(claim);
            completion.reject(TRANSPORT_ERROR_CODE, TRANSPORT_ERROR_MESSAGE);
            return;
        }
        completion.resolve();
    }

    private void refreshAfterTransportFailureOwned(long claim) {
        try {
            refreshOwned(claim, true);
        } catch (RuntimeException unavailable) {
            try {
                clearOwned(claim, true);
            } catch (RuntimeException ignored) {
                // State confirmation cannot replace the original transport rejection.
            }
        }
    }

    private boolean synchronizeOwned(long claim, boolean emitChange) {
        if (destroyed || !dispatcher.isClaimCurrent(claim)) {
            return false;
        }
        if (!runtime.isAuthorized()) {
            clearOwned(claim, emitChange);
            return dispatcher.isClaimCurrent(claim);
        }
        if (!activeSessionsListenerRegistered && !registerActiveListenerOwned(claim)) {
            if (dispatcher.isClaimCurrent(claim)) {
                selectOwned(claim, null, null, emitChange);
            }
            return false;
        }
        return refreshOwned(claim, emitChange);
    }

    private boolean registerActiveListenerOwned(long claim) {
        if (!dispatcher.isClaimCurrent(claim)) {
            return false;
        }
        final boolean registered;
        try {
            // External registration is outside the lifecycle monitor.
            registered = runtime.registerActiveSessionsListener(activeSessionsChanged);
        } catch (RuntimeException failure) {
            safeUnregisterActiveListener();
            throw failure;
        }
        if (!registered) {
            return false;
        }
        if (!dispatcher.isClaimCurrent(claim)) {
            safeUnregisterActiveListener();
            return false;
        }
        activeSessionsListenerRegistered = true;
        if (!dispatcher.isClaimCurrent(claim)) {
            safeUnregisterActiveListener();
            activeSessionsListenerRegistered = false;
            return false;
        }
        return true;
    }

    private boolean refreshOwned(long claim, boolean emitChange) {
        if (destroyed || !dispatcher.isClaimCurrent(claim)) {
            return false;
        }
        if (!runtime.isAuthorized()) {
            clearOwned(claim, emitChange);
            return dispatcher.isClaimCurrent(claim);
        }

        List<Session> sessions = runtime.getActiveSessions();
        if (sessions == null) {
            sessions = Collections.emptyList();
        }
        List<MusicSessionPayload> candidates = new ArrayList<>();
        List<Session> mappedSessions = new ArrayList<>();
        for (Session session : sessions) {
            try {
                // Snapshot and artwork mapping always remain outside the lifecycle monitor.
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
        return selectOwned(claim, nextSession, nextSnapshot, emitChange);
    }

    private boolean selectOwned(
        long claim,
        Session nextSession,
        MusicSessionPayload nextSnapshot,
        boolean emitChange
    ) {
        if (!dispatcher.isClaimCurrent(claim)) {
            return false;
        }
        boolean sameSession = selectedSnapshot != null
            && nextSnapshot != null
            && selectedSnapshot.getSessionId().equals(nextSnapshot.getSessionId());
        if (!sameSession) {
            Session previous = selectedSession;
            if (previous != null) {
                safeUnregisterController(previous);
            }
            if (!dispatcher.isClaimCurrent(claim)) {
                return false;
            }

            Session registeredSession = nextSession;
            MusicSessionPayload registeredSnapshot = nextSnapshot;
            if (registeredSession != null) {
                try {
                    // External controller registration is outside the lifecycle monitor.
                    registeredSession.registerChangedListener(selectedSessionChanged);
                } catch (RuntimeException unavailable) {
                    safeUnregisterController(registeredSession);
                    registeredSession = null;
                    registeredSnapshot = null;
                }
                if (!dispatcher.isClaimCurrent(claim)) {
                    if (registeredSession != null) {
                        safeUnregisterController(registeredSession);
                    }
                    return false;
                }
            }
            selectedSession = registeredSession;
            selectedSnapshot = registeredSnapshot;
            if (!dispatcher.isClaimCurrent(claim)) {
                if (selectedSession != null) {
                    safeUnregisterController(selectedSession);
                }
                selectedSession = null;
                selectedSnapshot = null;
                return false;
            }
        } else {
            selectedSnapshot = nextSnapshot;
            if (!dispatcher.isClaimCurrent(claim)) {
                return false;
            }
        }

        if (emitChange) {
            return emitSnapshotOwned(claim);
        }
        return true;
    }

    private boolean emitSnapshotOwned(long claim) {
        // A successful validation is the event linearization point. The call itself may
        // finish after shutdown, but shutdown never waits for event delivery.
        if (!dispatcher.isClaimCurrent(claim)) {
            return false;
        }
        runtime.emitSnapshot(MusicSessionSnapshotEnvelope.of(selectedSnapshot));
        return true;
    }

    private void clearOwned(long claim, boolean emitChange) {
        if (!dispatcher.isClaimCurrent(claim)) {
            return;
        }
        if (activeSessionsListenerRegistered) {
            safeUnregisterActiveListener();
            if (!dispatcher.isClaimCurrent(claim)) {
                return;
            }
            activeSessionsListenerRegistered = false;
        }
        selectOwned(claim, null, null, emitChange);
    }

    private void safeUnregisterActiveListener() {
        try {
            runtime.unregisterActiveSessionsListener();
        } catch (RuntimeException ignored) {
            // Authorization can be revoked before cleanup reaches Android.
        }
    }

    private static void safeUnregisterController(Session session) {
        try {
            session.unregisterChangedListener();
        } catch (RuntimeException ignored) {
            // The Android session may already be gone or already unwound.
        }
    }

    private void destroyOwned() {
        destroyed = true;
        if (activeSessionsListenerRegistered) {
            safeUnregisterActiveListener();
            activeSessionsListenerRegistered = false;
        }
        if (selectedSession != null) {
            safeUnregisterController(selectedSession);
        }
        selectedSession = null;
        selectedSnapshot = null;
    }

    private static void rejectUnavailable(Result<?> result) {
        result.reject(UNAVAILABLE_ERROR_CODE, UNAVAILABLE_ERROR_MESSAGE);
    }

    private static void rejectUnavailable(Completion completion) {
        completion.reject(UNAVAILABLE_ERROR_CODE, UNAVAILABLE_ERROR_MESSAGE);
    }
}
