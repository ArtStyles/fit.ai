package com.fitai.app.music;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.ComponentName;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import org.junit.Test;

public class MusicSessionAccessTest {
    @Test
    public void reportsAuthorizationFromTheEnabledListenerPackages() {
        MusicSessionAccess granted = accessWith(
            Collections.singleton("com.fitai.app"),
            Collections.emptyList()
        );
        MusicSessionAccess denied = accessWith(
            Collections.singleton("com.example.player"),
            Collections.emptyList()
        );

        assertTrue(granted.isAuthorized());
        assertFalse(denied.isAuthorized());
    }

    @Test
    public void convertsAuthorizationSecurityFailureIntoDeniedState() {
        MusicSessionAccess access = new MusicSessionAccess(
            "com.fitai.app",
            new FakeSystemAccess() {
                @Override
                public Set<String> enabledListenerPackages() {
                    throw new SecurityException("denied");
                }
            }
        );

        assertFalse(access.isAuthorized());
    }

    @Test
    public void returnsNoSessionsWithoutAuthorization() {
        MusicSessionAccess access = new MusicSessionAccess(
            "com.fitai.app",
            new FakeSystemAccess() {
                @Override
                public Set<String> enabledListenerPackages() {
                    return Collections.emptySet();
                }

                @Override
                public List<MediaController> activeSessions(
                    MediaSessionManager manager,
                    ComponentName listenerComponent
                ) {
                    throw new AssertionError("must not query sessions while unauthorized");
                }
            }
        );

        assertTrue(access.getActiveSessions(null, null).isEmpty());
    }

    @Test
    public void returnsAuthorizedSessionsAndContainsSessionSecurityFailures() {
        MusicSessionAccess granted = accessWith(
            Collections.singleton("com.fitai.app"),
            Collections.singletonList(null)
        );
        MusicSessionAccess revoked = new MusicSessionAccess(
            "com.fitai.app",
            new FakeSystemAccess() {
                @Override
                public Set<String> enabledListenerPackages() {
                    return Collections.singleton("com.fitai.app");
                }

                @Override
                public List<MediaController> activeSessions(
                    MediaSessionManager manager,
                    ComponentName listenerComponent
                ) {
                    throw new SecurityException("revoked");
                }
            }
        );

        assertEquals(1, granted.getActiveSessions(null, null).size());
        assertTrue(revoked.getActiveSessions(null, null).isEmpty());
    }

    @Test
    public void containsSecurityFailuresWhenRegisteringOrRemovingListener() {
        MusicSessionAccess access = new MusicSessionAccess(
            "com.fitai.app",
            new FakeSystemAccess() {
                @Override
                public Set<String> enabledListenerPackages() {
                    return Collections.singleton("com.fitai.app");
                }

                @Override
                public void addActiveSessionsChangedListener(
                    MediaSessionManager manager,
                    MediaSessionManager.OnActiveSessionsChangedListener listener,
                    ComponentName listenerComponent
                ) {
                    throw new SecurityException("revoked while adding");
                }

                @Override
                public void removeActiveSessionsChangedListener(
                    MediaSessionManager manager,
                    MediaSessionManager.OnActiveSessionsChangedListener listener
                ) {
                    throw new SecurityException("revoked while removing");
                }
            }
        );

        assertFalse(access.addActiveSessionsChangedListener(null, null, null));
        access.removeActiveSessionsChangedListener(null, null);
    }

    private static MusicSessionAccess accessWith(
        Set<String> enabledPackages,
        List<MediaController> sessions
    ) {
        return new MusicSessionAccess(
            "com.fitai.app",
            new FakeSystemAccess() {
                @Override
                public Set<String> enabledListenerPackages() {
                    return enabledPackages;
                }

                @Override
                public List<MediaController> activeSessions(
                    MediaSessionManager manager,
                    ComponentName listenerComponent
                ) {
                    return sessions;
                }
            }
        );
    }

    private abstract static class FakeSystemAccess implements MusicSessionAccess.SystemAccess {
        @Override
        public Set<String> enabledListenerPackages() {
            return Collections.emptySet();
        }

        @Override
        public List<MediaController> activeSessions(
            MediaSessionManager manager,
            ComponentName listenerComponent
        ) {
            return Collections.emptyList();
        }

        @Override
        public void addActiveSessionsChangedListener(
            MediaSessionManager manager,
            MediaSessionManager.OnActiveSessionsChangedListener listener,
            ComponentName listenerComponent
        ) {}

        @Override
        public void removeActiveSessionsChangedListener(
            MediaSessionManager manager,
            MediaSessionManager.OnActiveSessionsChangedListener listener
        ) {}
    }
}
