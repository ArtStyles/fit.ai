package com.fitai.app.music;

import static org.junit.Assert.assertSame;

import java.util.Arrays;
import org.junit.Test;

public class MusicSessionPolicyTest {

    @Test
    public void selectFirst_preservesAndroidPriorityAndRejectsInvalidEntries() {
        MusicSessionPayload own = payload("com.fitai.app", "Vekira", "playing", 300L);
        MusicSessionPayload stopped = payload("music.one", "Old", "stopped", 400L);
        MusicSessionPayload firstValid = payload("music.two", "Blinding Lights", "playing", 200L);
        MusicSessionPayload secondValid = payload("music.three", "Later", "playing", 500L);

        MusicSessionPayload selected = MusicSessionPolicy.selectFirst(
            Arrays.asList(own, stopped, firstValid, secondValid),
            "com.fitai.app"
        );

        assertSame(firstValid, selected);
    }

    @Test
    public void selectFirst_rejectsBlankTitleAndKeepsPausedSessionEligible() {
        MusicSessionPayload blank = payload("music.one", "   ", "playing", 10L);
        MusicSessionPayload paused = payload("music.two", "Paused song", "paused", 20L);

        assertSame(
            paused,
            MusicSessionPolicy.selectFirst(Arrays.asList(blank, paused), "com.fitai.app")
        );
    }

    private static MusicSessionPayload payload(
        String packageName,
        String title,
        String state,
        long updatedAtMs
    ) {
        return new MusicSessionPayload(
            packageName + ":session",
            packageName,
            packageName,
            title,
            null,
            null,
            null,
            state,
            null,
            null,
            1.0f,
            updatedAtMs,
            true,
            true,
            true,
            true,
            true
        );
    }
}
