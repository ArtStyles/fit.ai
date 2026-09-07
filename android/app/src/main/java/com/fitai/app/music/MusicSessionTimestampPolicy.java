package com.fitai.app.music;

public final class MusicSessionTimestampPolicy {
    private MusicSessionTimestampPolicy() {}

    public static long toEpochMs(
        long lastUpdateElapsedMs,
        long nowEpochMs,
        long nowElapsedMs
    ) {
        long safeNowEpochMs = Math.max(0L, nowEpochMs);
        if (
            lastUpdateElapsedMs <= 0L
                || nowElapsedMs < 0L
                || lastUpdateElapsedMs > nowElapsedMs
        ) {
            return safeNowEpochMs;
        }

        long ageMs = nowElapsedMs - lastUpdateElapsedMs;
        return ageMs >= safeNowEpochMs ? 0L : safeNowEpochMs - ageMs;
    }
}
