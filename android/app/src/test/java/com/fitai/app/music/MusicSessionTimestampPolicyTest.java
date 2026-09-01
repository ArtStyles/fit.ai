package com.fitai.app.music;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class MusicSessionTimestampPolicyTest {
    @Test
    public void convertsElapsedRealtimeAgeIntoEpochTime() {
        assertEquals(
            1_725_999_997_250L,
            MusicSessionTimestampPolicy.toEpochMs(
                547_250L,
                1_726_000_000_000L,
                550_000L
            )
        );
    }

    @Test
    public void fallsBackToNowForMissingOrFutureUpdates() {
        long nowEpochMs = 1_726_000_000_000L;

        assertEquals(nowEpochMs, MusicSessionTimestampPolicy.toEpochMs(0L, nowEpochMs, 550_000L));
        assertEquals(nowEpochMs, MusicSessionTimestampPolicy.toEpochMs(-1L, nowEpochMs, 550_000L));
        assertEquals(nowEpochMs, MusicSessionTimestampPolicy.toEpochMs(550_001L, nowEpochMs, 550_000L));
    }

    @Test
    public void clampsAtZeroWithoutOverflow() {
        assertEquals(0L, MusicSessionTimestampPolicy.toEpochMs(1L, 100L, Long.MAX_VALUE));
        assertEquals(1L, MusicSessionTimestampPolicy.toEpochMs(1L, Long.MAX_VALUE, Long.MAX_VALUE));
        assertEquals(0L, MusicSessionTimestampPolicy.toEpochMs(10L, -1L, 10L));
    }
}
