package com.fitai.app.music;

import android.content.ComponentName;
import android.content.Context;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.os.Handler;
import androidx.core.app.NotificationManagerCompat;
import java.util.Collections;
import java.util.List;
import java.util.Set;

public final class MusicSessionAccess {
    interface SystemAccess {
        Set<String> enabledListenerPackages();

        List<MediaController> activeSessions(
            MediaSessionManager manager,
            ComponentName listenerComponent
        );

        void addActiveSessionsChangedListener(
            MediaSessionManager manager,
            MediaSessionManager.OnActiveSessionsChangedListener listener,
            ComponentName listenerComponent
        );

        void removeActiveSessionsChangedListener(
            MediaSessionManager manager,
            MediaSessionManager.OnActiveSessionsChangedListener listener
        );
    }

    private final String ownPackageName;
    private final SystemAccess systemAccess;

    public MusicSessionAccess(Context context) {
        Context applicationContext = context.getApplicationContext();
        Context safeContext = applicationContext == null ? context : applicationContext;
        this.ownPackageName = safeContext.getPackageName();
        this.systemAccess = new AndroidSystemAccess(safeContext);
    }

    MusicSessionAccess(String ownPackageName, SystemAccess systemAccess) {
        this.ownPackageName = ownPackageName;
        this.systemAccess = systemAccess;
    }

    public boolean isAuthorized() {
        try {
            return systemAccess.enabledListenerPackages().contains(ownPackageName);
        } catch (SecurityException denied) {
            return false;
        }
    }

    public List<MediaController> getActiveSessions(
        MediaSessionManager manager,
        ComponentName listenerComponent
    ) {
        if (!isAuthorized()) {
            return Collections.emptyList();
        }
        try {
            List<MediaController> sessions = systemAccess.activeSessions(
                manager,
                listenerComponent
            );
            return sessions == null ? Collections.emptyList() : sessions;
        } catch (SecurityException denied) {
            return Collections.emptyList();
        }
    }

    public boolean addActiveSessionsChangedListener(
        MediaSessionManager manager,
        MediaSessionManager.OnActiveSessionsChangedListener listener,
        ComponentName listenerComponent
    ) {
        if (!isAuthorized()) {
            return false;
        }
        try {
            systemAccess.addActiveSessionsChangedListener(
                manager,
                listener,
                listenerComponent
            );
            return true;
        } catch (SecurityException denied) {
            return false;
        }
    }

    public void removeActiveSessionsChangedListener(
        MediaSessionManager manager,
        MediaSessionManager.OnActiveSessionsChangedListener listener
    ) {
        try {
            systemAccess.removeActiveSessionsChangedListener(manager, listener);
        } catch (SecurityException denied) {
            // Authorization can be revoked between registration and cleanup.
        }
    }

    private static final class AndroidSystemAccess implements SystemAccess {
        private final Context context;
        private final Handler callbackHandler;

        private AndroidSystemAccess(Context context) {
            this.context = context;
            this.callbackHandler = new Handler(context.getMainLooper());
        }

        @Override
        public Set<String> enabledListenerPackages() {
            return NotificationManagerCompat.getEnabledListenerPackages(context);
        }

        @Override
        public List<MediaController> activeSessions(
            MediaSessionManager manager,
            ComponentName listenerComponent
        ) {
            return manager.getActiveSessions(listenerComponent);
        }

        @Override
        public void addActiveSessionsChangedListener(
            MediaSessionManager manager,
            MediaSessionManager.OnActiveSessionsChangedListener listener,
            ComponentName listenerComponent
        ) {
            manager.addOnActiveSessionsChangedListener(
                listener,
                listenerComponent,
                callbackHandler
            );
        }

        @Override
        public void removeActiveSessionsChangedListener(
            MediaSessionManager manager,
            MediaSessionManager.OnActiveSessionsChangedListener listener
        ) {
            manager.removeOnActiveSessionsChangedListener(listener);
        }
    }
}
