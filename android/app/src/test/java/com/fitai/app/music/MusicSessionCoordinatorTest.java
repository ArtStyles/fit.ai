package com.fitai.app.music;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.Test;

public class MusicSessionCoordinatorTest {
    @Test
    public void repeatedResumeRegistersTheActiveSessionListenerOnce() {
        Fixture fixture = new Fixture();

        fixture.coordinator.start();
        fixture.coordinator.resume();
        fixture.dispatcher.runAll();

        assertEquals(1, fixture.runtime.registerCount);
    }

    @Test
    public void revocationRemovesBothListenersAndEmitsAnExplicitNullSnapshot() {
        Fixture fixture = new Fixture();
        FakeSession selected = session("selected", "player", "Track", "playing", true, true);
        fixture.runtime.sessions = Collections.singletonList(selected);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();

        fixture.runtime.authorized = false;
        fixture.coordinator.resume();
        fixture.dispatcher.runAll();

        assertEquals(1, fixture.runtime.unregisterCount);
        assertEquals(1, selected.unregisterCount);
        assertEquals(1, fixture.runtime.emitted.size());
        assertTrue(fixture.runtime.emitted.get(0).asMap().containsKey("snapshot"));
        assertNull(fixture.runtime.emitted.get(0).asMap().get("snapshot"));
    }

    @Test
    public void activeSessionRegistrationFailureDoesNotQueryOrSelectSessions() {
        Fixture fixture = new Fixture();
        fixture.runtime.registrationSucceeds = false;
        fixture.runtime.sessions = Collections.singletonList(
            session("selected", "player", "Track", "playing", true, true)
        );

        fixture.coordinator.start();
        fixture.dispatcher.runAll();

        assertEquals(1, fixture.runtime.registerCount);
        assertEquals(0, fixture.runtime.activeSessionQueryCount);
    }

    @Test
    public void destroyInvalidatesQueuedWorkAndPreventsStateRevivalOrEvents() {
        Fixture fixture = new Fixture();
        FakeSession selected = session("selected", "player", "Track", "playing", true, true);
        fixture.runtime.sessions = Collections.singletonList(selected);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        fixture.runtime.emitted.clear();

        selected.fireChanged();
        fixture.coordinator.resume();
        fixture.coordinator.destroy();
        selected.fireChanged();
        fixture.dispatcher.runAll();

        assertEquals(1, fixture.runtime.registerCount);
        assertEquals(1, fixture.runtime.unregisterCount);
        assertEquals(1, selected.unregisterCount);
        assertTrue(fixture.runtime.emitted.isEmpty());
        assertFalse(fixture.coordinator.resume());
    }

    @Test
    public void acceptedAuthorizationCurrentAndControlsRejectExactlyOnceAfterDestroy() {
        Fixture fixture = new Fixture();
        FakeSession selected = session("selected", "player", "Track", "playing", true, true);
        fixture.runtime.sessions = Collections.singletonList(selected);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        TestResult<String> authorization = new TestResult<>();
        TestResult<MusicSessionSnapshotEnvelope> current = new TestResult<>();
        TestCompletion play = new TestCompletion();
        TestCompletion pause = new TestCompletion();

        assertTrue(fixture.coordinator.getAuthorizationStatus(authorization));
        assertTrue(fixture.coordinator.getCurrentSession(current));
        assertTrue(fixture.coordinator.play("selected", play));
        assertTrue(fixture.coordinator.pause("selected", pause));
        fixture.coordinator.destroy();
        fixture.dispatcher.runAll();

        assertEquals(1, authorization.completionCount);
        assertEquals("MUSIC_SESSION_UNAVAILABLE", authorization.rejectionCode);
        assertEquals(1, current.completionCount);
        assertEquals("MUSIC_SESSION_UNAVAILABLE", current.rejectionCode);
        assertEquals(1, play.completionCount);
        assertEquals("MUSIC_SESSION_UNAVAILABLE", play.rejectionCode);
        assertEquals(1, pause.completionCount);
        assertEquals("MUSIC_SESSION_UNAVAILABLE", pause.rejectionCode);
        assertEquals(0, selected.playCount);
        assertEquals(0, selected.pauseCount);
    }

    @Test
    public void callsSubmittedAfterDestroyAreRejectedAtAdmission() {
        Fixture fixture = new Fixture();
        TestResult<String> authorization = new TestResult<>();
        TestResult<MusicSessionSnapshotEnvelope> current = new TestResult<>();
        TestCompletion play = new TestCompletion();
        TestCompletion pause = new TestCompletion();

        fixture.coordinator.destroy();

        assertFalse(fixture.coordinator.start());
        assertFalse(fixture.coordinator.resume());
        assertFalse(fixture.coordinator.sessionsChanged());
        assertFalse(fixture.coordinator.getAuthorizationStatus(authorization));
        assertFalse(fixture.coordinator.getCurrentSession(current));
        assertFalse(fixture.coordinator.play("selected", play));
        assertFalse(fixture.coordinator.pause("selected", pause));
        assertEquals(0, authorization.completionCount);
        assertEquals(0, current.completionCount);
        assertEquals(0, play.completionCount);
        assertEquals(0, pause.completionCount);
    }

    @Test
    public void shutdownDuringAuthorizationPreventsLateActiveListenerRegistration()
        throws Exception {
        ThreadedDispatcher dispatcher = new ThreadedDispatcher();
        FakeRuntime runtime = new FakeRuntime();
        MusicSessionCoordinator coordinator = new MusicSessionCoordinator(
            dispatcher,
            runtime,
            "com.fitai.app"
        );
        runtime.authorizationEntered = new CountDownLatch(1);
        CountDownLatch authorizationRelease = new CountDownLatch(1);
        runtime.authorizationRelease = authorizationRelease;

        coordinator.start();
        assertTrue(runtime.authorizationEntered.await(5, TimeUnit.SECONDS));
        coordinator.destroy();
        authorizationRelease.countDown();
        dispatcher.awaitCleanup();

        assertEquals(0, runtime.registerCount);
        assertEquals(0, runtime.unregisterCount);
        assertTrue(runtime.emitted.isEmpty());
    }

    @Test
    public void shutdownDuringMappingPreventsControllerRegistrationAndEventEmission()
        throws Exception {
        ThreadedDispatcher dispatcher = new ThreadedDispatcher();
        FakeRuntime runtime = new FakeRuntime();
        MusicSessionCoordinator coordinator = new MusicSessionCoordinator(
            dispatcher,
            runtime,
            "com.fitai.app"
        );
        coordinator.start();
        dispatcher.awaitIdle();
        FakeSession selected = session("selected", "player", "Track", "playing", true, true);
        selected.snapshotEntered = new CountDownLatch(1);
        CountDownLatch snapshotRelease = new CountDownLatch(1);
        selected.snapshotRelease = snapshotRelease;
        runtime.sessions = Collections.singletonList(selected);

        coordinator.resume();
        assertTrue(selected.snapshotEntered.await(5, TimeUnit.SECONDS));
        coordinator.destroy();
        snapshotRelease.countDown();
        dispatcher.awaitCleanup();

        assertEquals(0, selected.registerCount);
        assertEquals(0, selected.unregisterCount);
        assertEquals(1, runtime.unregisterCount);
        assertTrue(runtime.emitted.isEmpty());
    }

    @Test
    public void blockedActiveListenerRegistrationCannotDelayDestroyOrLeakRegistration()
        throws Exception {
        ThreadedDispatcher dispatcher = new ThreadedDispatcher();
        FakeRuntime runtime = new FakeRuntime();
        MusicSessionCoordinator coordinator = new MusicSessionCoordinator(
            dispatcher,
            runtime,
            "com.fitai.app"
        );
        runtime.registrationEntered = new CountDownLatch(1);
        CountDownLatch registrationRelease = new CountDownLatch(1);
        runtime.registrationRelease = registrationRelease;

        coordinator.start();
        assertTrue(runtime.registrationEntered.await(5, TimeUnit.SECONDS));
        boolean destroyReturnedPromptly = destroyWhileBlocked(
            coordinator,
            registrationRelease,
            dispatcher
        );

        assertTrue("destroy must not wait for listener registration", destroyReturnedPromptly);
        assertEquals(1, runtime.registerCount);
        assertEquals(1, runtime.unregisterCount);
        assertNull(runtime.activeSessionsChanged);
    }

    @Test
    public void blockedControllerRegistrationCannotDelayDestroyOrReviveSelection()
        throws Exception {
        ThreadedDispatcher dispatcher = new ThreadedDispatcher();
        FakeRuntime runtime = new FakeRuntime();
        MusicSessionCoordinator coordinator = new MusicSessionCoordinator(
            dispatcher,
            runtime,
            "com.fitai.app"
        );
        coordinator.start();
        dispatcher.awaitIdle();
        FakeSession selected = session("selected", "player", "Track", "playing", true, true);
        selected.registrationEntered = new CountDownLatch(1);
        CountDownLatch registrationRelease = new CountDownLatch(1);
        selected.registrationRelease = registrationRelease;
        runtime.sessions = Collections.singletonList(selected);

        coordinator.resume();
        assertTrue(selected.registrationEntered.await(5, TimeUnit.SECONDS));
        boolean destroyReturnedPromptly = destroyWhileBlocked(
            coordinator,
            registrationRelease,
            dispatcher
        );

        assertTrue("destroy must not wait for controller registration", destroyReturnedPromptly);
        assertEquals(1, selected.registerCount);
        assertEquals(1, selected.unregisterCount);
        assertNull(selected.changed);
        assertEquals(1, runtime.unregisterCount);
        assertTrue(runtime.emitted.isEmpty());
        assertFalse(coordinator.resume());
    }

    @Test
    public void claimedBlockedEventDoesNotDelayDestroyOrReviveState() throws Exception {
        ThreadedDispatcher dispatcher = new ThreadedDispatcher();
        FakeRuntime runtime = new FakeRuntime();
        FakeSession selected = session("selected", "player", "Track", "playing", true, true);
        runtime.sessions = Collections.singletonList(selected);
        MusicSessionCoordinator coordinator = new MusicSessionCoordinator(
            dispatcher,
            runtime,
            "com.fitai.app"
        );
        coordinator.start();
        dispatcher.awaitIdle();
        runtime.emissionEntered = new CountDownLatch(1);
        CountDownLatch emissionRelease = new CountDownLatch(1);
        runtime.emissionRelease = emissionRelease;
        TestResult<MusicSessionSnapshotEnvelope> acceptedCurrent = new TestResult<>();

        coordinator.resume();
        assertTrue(runtime.emissionEntered.await(5, TimeUnit.SECONDS));
        assertTrue(coordinator.getCurrentSession(acceptedCurrent));
        boolean destroyReturnedPromptly = destroyWhileBlocked(
            coordinator,
            emissionRelease,
            dispatcher
        );

        assertTrue("destroy must not wait for an already-claimed event", destroyReturnedPromptly);
        assertEquals(1, runtime.emitted.size());
        assertEquals(1, selected.unregisterCount);
        assertNull(selected.changed);
        assertEquals(1, acceptedCurrent.completionCount);
        assertEquals("MUSIC_SESSION_UNAVAILABLE", acceptedCurrent.rejectionCode);
        assertFalse(coordinator.resume());
    }

    @Test
    public void claimedBlockedTransportDoesNotDelayDestroyAndCompletesOnce() throws Exception {
        ThreadedDispatcher dispatcher = new ThreadedDispatcher();
        FakeRuntime runtime = new FakeRuntime();
        FakeSession selected = session("selected", "player", "Track", "playing", true, true);
        runtime.sessions = Collections.singletonList(selected);
        MusicSessionCoordinator coordinator = new MusicSessionCoordinator(
            dispatcher,
            runtime,
            "com.fitai.app"
        );
        coordinator.start();
        dispatcher.awaitIdle();
        selected.playEntered = new CountDownLatch(1);
        CountDownLatch playRelease = new CountDownLatch(1);
        selected.playRelease = playRelease;
        TestCompletion completion = new TestCompletion();

        assertTrue(coordinator.play("selected", completion));
        assertTrue(selected.playEntered.await(5, TimeUnit.SECONDS));
        boolean destroyReturnedPromptly = destroyWhileBlocked(
            coordinator,
            playRelease,
            dispatcher
        );

        assertTrue("destroy must not wait for an already-claimed transport", destroyReturnedPromptly);
        assertEquals(1, selected.playCount);
        assertEquals(1, completion.completionCount);
        assertTrue(completion.resolved);
        assertNull(completion.rejectionCode);
        assertEquals(1, selected.unregisterCount);
        assertNull(selected.changed);
    }

    @Test
    public void controllerReplacementUnregistersBeforeRegisteringTheNextController() {
        Fixture fixture = new Fixture();
        FakeSession first = session("first", "player.one", "First", "playing", true, true);
        FakeSession second = session("second", "player.two", "Second", "playing", true, true);
        first.operations = fixture.runtime.operations;
        second.operations = fixture.runtime.operations;
        fixture.runtime.sessions = Collections.singletonList(first);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        fixture.runtime.operations.clear();

        fixture.runtime.sessions = Collections.singletonList(second);
        fixture.runtime.fireActiveSessionsChanged();
        fixture.dispatcher.runAll();

        assertEquals(
            Arrays.asList("unregister:first", "register:second"),
            fixture.runtime.operations
        );
    }

    @Test
    public void nullSnapshotEnvelopeKeepsTheKeyForBothEventsAndCurrentReads() {
        Fixture fixture = new Fixture();
        TestResult<MusicSessionSnapshotEnvelope> current = new TestResult<>();

        fixture.coordinator.resume();
        fixture.coordinator.getCurrentSession(current);
        fixture.dispatcher.runAll();

        assertEquals(1, fixture.runtime.emitted.size());
        assertTrue(fixture.runtime.emitted.get(0).asMap().containsKey("snapshot"));
        assertNull(fixture.runtime.emitted.get(0).asMap().get("snapshot"));
        assertTrue(current.value.asMap().containsKey("snapshot"));
        assertNull(current.value.asMap().get("snapshot"));
    }

    @Test
    public void selectionPreservesAndroidOrderWhileApplyingEligibilityPolicy() {
        Fixture fixture = new Fixture();
        FakeSession own = session("own", "com.fitai.app", "Own", "playing", true, true);
        FakeSession firstEligible = session(
            "paused",
            "player.first",
            "First external",
            "paused",
            true,
            true
        );
        FakeSession secondEligible = session(
            "playing",
            "player.second",
            "Second external",
            "playing",
            true,
            true
        );
        fixture.runtime.sessions = Arrays.asList(own, firstEligible, secondEligible);
        TestResult<MusicSessionSnapshotEnvelope> current = new TestResult<>();

        fixture.coordinator.start();
        fixture.coordinator.getCurrentSession(current);
        fixture.dispatcher.runAll();

        assertEquals("paused", current.value.getSnapshot().getSessionId());
        assertEquals(0, own.registerCount);
        assertEquals(1, firstEligible.registerCount);
        assertEquals(0, secondEligible.registerCount);
    }

    @Test
    public void unsupportedCapabilitiesResolveWithoutInvokingControls() {
        Fixture fixture = new Fixture();
        FakeSession selected = session("selected", "player", "Track", "paused", false, false);
        fixture.runtime.sessions = Collections.singletonList(selected);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        TestCompletion play = new TestCompletion();
        TestCompletion pause = new TestCompletion();

        fixture.coordinator.play("selected", play);
        fixture.coordinator.pause("selected", pause);
        fixture.dispatcher.runAll();

        assertTrue(play.resolved);
        assertTrue(pause.resolved);
        assertEquals(0, selected.playCount);
        assertEquals(0, selected.pauseCount);
    }

    @Test
    public void supportedControlsInvokeTheSelectedSessionAndResolve() {
        Fixture fixture = new Fixture();
        FakeSession selected = session("selected", "player", "Track", "playing", true, true);
        fixture.runtime.sessions = Collections.singletonList(selected);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        TestCompletion play = new TestCompletion();
        TestCompletion pause = new TestCompletion();

        fixture.coordinator.play("selected", play);
        fixture.coordinator.pause("selected", pause);
        fixture.dispatcher.runAll();

        assertTrue(play.resolved);
        assertTrue(pause.resolved);
        assertEquals(1, selected.playCount);
        assertEquals(1, selected.pauseCount);
    }

    @Test
    public void supportedExtendedControlsInvokeTheSelectedSessionAndClampSeekToDuration() {
        Fixture fixture = new Fixture();
        FakeSession selected = session(
            "selected",
            "player",
            "Track",
            "playing",
            true,
            true,
            true,
            true,
            true
        );
        fixture.runtime.sessions = Collections.singletonList(selected);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        TestCompletion previous = new TestCompletion();
        TestCompletion next = new TestCompletion();
        TestCompletion seek = new TestCompletion();

        fixture.coordinator.previous("selected", previous);
        fixture.coordinator.next("selected", next);
        fixture.coordinator.seekTo("selected", 240_000L, seek);
        fixture.dispatcher.runAll();

        assertTrue(previous.resolved);
        assertTrue(next.resolved);
        assertTrue(seek.resolved);
        assertEquals(1, selected.previousCount);
        assertEquals(1, selected.nextCount);
        assertEquals(1, selected.seekCount);
        assertEquals(180_000L, selected.lastSeekPositionMs);
    }

    @Test
    public void unsupportedExtendedControlsResolveWithoutInvokingTheSelectedSession() {
        Fixture fixture = new Fixture();
        FakeSession selected = session("selected", "player", "Track", "playing", true, true);
        fixture.runtime.sessions = Collections.singletonList(selected);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        TestCompletion previous = new TestCompletion();
        TestCompletion next = new TestCompletion();
        TestCompletion seek = new TestCompletion();

        fixture.coordinator.previous("selected", previous);
        fixture.coordinator.next("selected", next);
        fixture.coordinator.seekTo("selected", 60_000L, seek);
        fixture.dispatcher.runAll();

        assertTrue(previous.resolved);
        assertTrue(next.resolved);
        assertTrue(seek.resolved);
        assertEquals(0, selected.previousCount);
        assertEquals(0, selected.nextCount);
        assertEquals(0, selected.seekCount);
    }

    @Test
    public void transportForAReplacedSessionResolvesWithoutTouchingTheReplacement() {
        Fixture fixture = new Fixture();
        FakeSession original = session(
            "original",
            "player.a",
            "Track A",
            "playing",
            true,
            true,
            true,
            true,
            true
        );
        FakeSession replacement = session(
            "replacement",
            "player.b",
            "Track B",
            "playing",
            true,
            true,
            true,
            true,
            true
        );
        fixture.runtime.sessions = Collections.singletonList(original);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        TestCompletion completion = new TestCompletion();

        fixture.coordinator.next("original", completion);
        fixture.runtime.sessions = Collections.singletonList(replacement);
        fixture.dispatcher.runAll();

        assertTrue(completion.resolved);
        assertEquals(0, original.nextCount);
        assertEquals(0, replacement.nextCount);
    }

    @Test
    public void transportRuntimeFailureRejectsAndEmitsTheConfirmedSnapshot() {
        Fixture fixture = new Fixture();
        FakeSession selected = session("selected", "player", "Track", "paused", true, true);
        selected.playFailure = new IllegalStateException("player process died");
        fixture.runtime.sessions = Collections.singletonList(selected);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        fixture.runtime.emitted.clear();
        TestCompletion completion = new TestCompletion();

        fixture.coordinator.play("selected", completion);
        fixture.dispatcher.runAll();

        assertFalse(completion.resolved);
        assertEquals("MUSIC_TRANSPORT_FAILED", completion.rejectionCode);
        assertEquals("Unable to control the selected music session", completion.rejectionMessage);
        assertEquals(1, fixture.runtime.emitted.size());
        assertEquals("selected", fixture.runtime.emitted.get(0).getSnapshot().getSessionId());
    }

    @Test
    public void refreshFailureCannotHideTheOriginalTransportRejection() {
        Fixture fixture = new Fixture();
        FakeSession selected = session("selected", "player", "Track", "paused", true, true);
        selected.playFailure = new IllegalStateException("player process died");
        selected.beforePlay = () -> fixture.runtime.activeSessionsFailure =
            new IllegalStateException("manager unavailable");
        fixture.runtime.sessions = Collections.singletonList(selected);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        fixture.runtime.emitted.clear();
        TestCompletion completion = new TestCompletion();

        fixture.coordinator.play("selected", completion);
        fixture.dispatcher.runAll();

        assertFalse(completion.resolved);
        assertEquals("MUSIC_TRANSPORT_FAILED", completion.rejectionCode);
        assertEquals(1, fixture.runtime.emitted.size());
        assertNull(fixture.runtime.emitted.get(0).getSnapshot());
    }

    @Test
    public void transportSecurityRevocationClearsStateAndResolvesAsNoOp() {
        Fixture fixture = new Fixture();
        FakeSession selected = session("selected", "player", "Track", "paused", true, true);
        selected.beforePlay = () -> fixture.runtime.authorized = false;
        selected.playFailure = new SecurityException("listener access revoked");
        fixture.runtime.sessions = Collections.singletonList(selected);
        fixture.coordinator.start();
        fixture.dispatcher.runAll();
        fixture.runtime.emitted.clear();
        TestCompletion completion = new TestCompletion();

        fixture.coordinator.play("selected", completion);
        fixture.dispatcher.runAll();

        assertTrue(completion.resolved);
        assertNull(completion.rejectionCode);
        assertEquals(1, fixture.runtime.unregisterCount);
        assertEquals(1, fixture.runtime.emitted.size());
        assertNull(fixture.runtime.emitted.get(0).getSnapshot());
    }

    private static FakeSession session(
        String id,
        String packageName,
        String title,
        String state,
        boolean canPlay,
        boolean canPause
    ) {
        return session(id, packageName, title, state, canPlay, canPause, false, false, false);
    }

    private static FakeSession session(
        String id,
        String packageName,
        String title,
        String state,
        boolean canPlay,
        boolean canPause,
        boolean canSkipPrevious,
        boolean canSkipNext,
        boolean canSeek
    ) {
        return new FakeSession(
            new MusicSessionPayload(
                id,
                packageName,
                packageName,
                title,
                null,
                null,
                null,
                state,
                0L,
                180_000L,
                1f,
                1_000L,
                canPlay,
                canPause,
                canSkipPrevious,
                canSkipNext,
                canSeek
            )
        );
    }

    private static final class Fixture {
        private final FakeDispatcher dispatcher = new FakeDispatcher();
        private final FakeRuntime runtime = new FakeRuntime();
        private final MusicSessionCoordinator coordinator = new MusicSessionCoordinator(
            dispatcher,
            runtime,
            "com.fitai.app"
        );
    }

    private static final class FakeDispatcher implements MusicSessionCoordinator.Dispatcher {
        private final Deque<Runnable> tasks = new ArrayDeque<>();
        private boolean accepting = true;
        private long generation;

        @Override
        public boolean dispatch(Runnable task) {
            if (!accepting) {
                return false;
            }
            tasks.addLast(task);
            return true;
        }

        @Override
        public void shutdown(Runnable cleanup) {
            if (!accepting) {
                return;
            }
            accepting = false;
            generation++;
            tasks.addLast(cleanup);
        }

        @Override
        public boolean isAccepting() {
            return accepting;
        }

        @Override
        public long claimIfAccepting() {
            if (!accepting) {
                return CLOSED_CLAIM;
            }
            return generation;
        }

        @Override
        public boolean isClaimCurrent(long claim) {
            return accepting && generation == claim;
        }

        private void runAll() {
            while (!tasks.isEmpty()) {
                tasks.removeFirst().run();
            }
        }
    }

    private static final class ThreadedDispatcher
        implements MusicSessionCoordinator.Dispatcher {
        private final ExecutorService executor = Executors.newSingleThreadExecutor();
        private final CountDownLatch cleanupComplete = new CountDownLatch(1);
        private boolean accepting = true;
        private long generation;

        @Override
        public synchronized boolean dispatch(Runnable task) {
            if (!accepting) {
                return false;
            }
            executor.execute(task);
            return true;
        }

        @Override
        public synchronized void shutdown(Runnable cleanup) {
            if (!accepting) {
                return;
            }
            accepting = false;
            generation++;
            executor.execute(() -> {
                try {
                    cleanup.run();
                } finally {
                    cleanupComplete.countDown();
                }
            });
            executor.shutdown();
        }

        @Override
        public synchronized boolean isAccepting() {
            return accepting;
        }

        @Override
        public synchronized long claimIfAccepting() {
            if (!accepting) {
                return CLOSED_CLAIM;
            }
            return generation;
        }

        @Override
        public synchronized boolean isClaimCurrent(long claim) {
            return accepting && generation == claim;
        }

        private void awaitIdle() throws Exception {
            CountDownLatch idle = new CountDownLatch(1);
            assertTrue(dispatch(idle::countDown));
            assertTrue(idle.await(5, TimeUnit.SECONDS));
        }

        private void awaitCleanup() throws Exception {
            assertTrue(cleanupComplete.await(5, TimeUnit.SECONDS));
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS));
        }
    }

    private static final class FakeRuntime implements MusicSessionCoordinator.Runtime {
        private boolean authorized = true;
        private boolean registrationSucceeds = true;
        private int registerCount;
        private int unregisterCount;
        private int activeSessionQueryCount;
        private RuntimeException activeSessionsFailure;
        private CountDownLatch authorizationEntered;
        private CountDownLatch authorizationRelease;
        private CountDownLatch registrationEntered;
        private CountDownLatch registrationRelease;
        private CountDownLatch emissionEntered;
        private CountDownLatch emissionRelease;
        private Runnable activeSessionsChanged;
        private List<MusicSessionCoordinator.Session> sessions = Collections.emptyList();
        private final List<MusicSessionSnapshotEnvelope> emitted = new ArrayList<>();
        private final List<String> operations = new ArrayList<>();

        @Override
        public boolean isAuthorized() {
            CountDownLatch entered = authorizationEntered;
            CountDownLatch release = authorizationRelease;
            if (entered != null && release != null) {
                authorizationEntered = null;
                authorizationRelease = null;
                entered.countDown();
                await(release);
            }
            return authorized;
        }

        @Override
        public boolean registerActiveSessionsListener(Runnable listener) {
            registerCount++;
            awaitBarrier(registrationEntered, registrationRelease);
            if (registrationSucceeds) {
                activeSessionsChanged = listener;
            }
            return registrationSucceeds;
        }

        @Override
        public void unregisterActiveSessionsListener() {
            unregisterCount++;
            activeSessionsChanged = null;
        }

        @Override
        public List<MusicSessionCoordinator.Session> getActiveSessions() {
            activeSessionQueryCount++;
            if (activeSessionsFailure != null) {
                throw activeSessionsFailure;
            }
            return sessions;
        }

        @Override
        public void emitSnapshot(MusicSessionSnapshotEnvelope envelope) {
            awaitBarrier(emissionEntered, emissionRelease);
            emitted.add(envelope);
        }

        private void fireActiveSessionsChanged() {
            if (activeSessionsChanged != null) {
                activeSessionsChanged.run();
            }
        }
    }

    private static final class FakeSession implements MusicSessionCoordinator.Session {
        private final MusicSessionPayload snapshot;
        private Runnable changed;
        private Runnable beforePlay = () -> {};
        private RuntimeException playFailure;
        private RuntimeException pauseFailure;
        private int registerCount;
        private int unregisterCount;
        private int playCount;
        private int pauseCount;
        private int previousCount;
        private int nextCount;
        private int seekCount;
        private long lastSeekPositionMs = -1L;
        private List<String> operations = new ArrayList<>();
        private CountDownLatch snapshotEntered;
        private CountDownLatch snapshotRelease;
        private CountDownLatch registrationEntered;
        private CountDownLatch registrationRelease;
        private CountDownLatch playEntered;
        private CountDownLatch playRelease;

        private FakeSession(MusicSessionPayload snapshot) {
            this.snapshot = snapshot;
        }

        @Override
        public MusicSessionPayload getSnapshot() {
            CountDownLatch entered = snapshotEntered;
            CountDownLatch release = snapshotRelease;
            if (entered != null && release != null) {
                snapshotEntered = null;
                snapshotRelease = null;
                entered.countDown();
                await(release);
            }
            return snapshot;
        }

        @Override
        public void registerChangedListener(Runnable listener) {
            registerCount++;
            awaitBarrier(registrationEntered, registrationRelease);
            changed = listener;
            operations.add("register:" + snapshot.getSessionId());
        }

        @Override
        public void unregisterChangedListener() {
            unregisterCount++;
            changed = null;
            operations.add("unregister:" + snapshot.getSessionId());
        }

        @Override
        public void play() {
            playCount++;
            awaitBarrier(playEntered, playRelease);
            beforePlay.run();
            if (playFailure != null) {
                throw playFailure;
            }
        }

        @Override
        public void pause() {
            pauseCount++;
            if (pauseFailure != null) {
                throw pauseFailure;
            }
        }

        @Override
        public void previous() {
            previousCount++;
        }

        @Override
        public void next() {
            nextCount++;
        }

        @Override
        public void seekTo(long positionMs) {
            seekCount++;
            lastSeekPositionMs = positionMs;
        }

        private void fireChanged() {
            if (changed != null) {
                changed.run();
            }
        }
    }

    private static final class TestResult<T> implements MusicSessionCoordinator.Result<T> {
        private T value;
        private String rejectionCode;
        private int completionCount;

        @Override
        public void resolve(T value) {
            completionCount++;
            this.value = value;
        }

        @Override
        public void reject(String code, String message) {
            completionCount++;
            this.rejectionCode = code;
        }
    }

    private static final class TestCompletion implements MusicSessionCoordinator.Completion {
        private boolean resolved;
        private String rejectionCode;
        private String rejectionMessage;
        private int completionCount;

        @Override
        public void resolve() {
            completionCount++;
            resolved = true;
        }

        @Override
        public void reject(String code, String message) {
            completionCount++;
            rejectionCode = code;
            rejectionMessage = message;
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("timed out waiting for deterministic test barrier");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("interrupted while waiting for test barrier", interrupted);
        }
    }

    private static void awaitBarrier(CountDownLatch entered, CountDownLatch release) {
        if (entered == null || release == null) {
            return;
        }
        entered.countDown();
        await(release);
    }

    private static boolean destroyWhileBlocked(
        MusicSessionCoordinator coordinator,
        CountDownLatch release,
        ThreadedDispatcher dispatcher
    ) throws Exception {
        ExecutorService destroyExecutor = Executors.newSingleThreadExecutor();
        Future<?> destroyFuture = destroyExecutor.submit(coordinator::destroy);
        boolean returnedPromptly;
        try {
            destroyFuture.get(500, TimeUnit.MILLISECONDS);
            returnedPromptly = true;
        } catch (TimeoutException blocked) {
            returnedPromptly = false;
        } finally {
            release.countDown();
            destroyFuture.get(5, TimeUnit.SECONDS);
            destroyExecutor.shutdown();
            assertTrue(destroyExecutor.awaitTermination(5, TimeUnit.SECONDS));
            dispatcher.awaitCleanup();
        }
        return returnedPromptly;
    }
}
