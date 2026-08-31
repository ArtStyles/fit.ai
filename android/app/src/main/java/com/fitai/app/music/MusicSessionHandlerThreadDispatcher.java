package com.fitai.app.music;

import android.os.Handler;
import android.os.HandlerThread;

public final class MusicSessionHandlerThreadDispatcher
    implements MusicSessionCoordinator.Dispatcher {
    private final Object lifecycleLock = new Object();
    private final HandlerThread worker;
    private final Handler handler;
    private boolean accepting = true;

    public MusicSessionHandlerThreadDispatcher() {
        worker = new HandlerThread("VekiraMusicSession");
        worker.start();
        handler = new Handler(worker.getLooper());
    }

    public Handler getHandler() {
        return handler;
    }

    @Override
    public boolean dispatch(Runnable task) {
        synchronized (lifecycleLock) {
            if (!accepting) {
                return false;
            }
            return handler.post(task);
        }
    }

    @Override
    public void shutdown(Runnable cleanup) {
        synchronized (lifecycleLock) {
            if (!accepting) {
                return;
            }
            accepting = false;
            handler.post(() -> {
                try {
                    cleanup.run();
                } finally {
                    worker.quitSafely();
                }
            });
        }
    }

    @Override
    public boolean isAccepting() {
        synchronized (lifecycleLock) {
            return accepting;
        }
    }

    @Override
    public boolean runIfAccepting(Runnable action) {
        synchronized (lifecycleLock) {
            if (!accepting) {
                return false;
            }
            action.run();
            return true;
        }
    }
}
