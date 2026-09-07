package com.fitai.app.music;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.media.session.PlaybackState;
import org.junit.Test;

public class MusicSessionCapabilitiesTest {
    @Test
    public void fromActionsExposesOnlyPublishedTransportCapabilities() {
        long actions = PlaybackState.ACTION_PLAY_PAUSE
            | PlaybackState.ACTION_SKIP_TO_PREVIOUS
            | PlaybackState.ACTION_SEEK_TO;

        MusicSessionCapabilities capabilities = MusicSessionCapabilities.fromActions(actions);

        assertTrue(capabilities.canPlay());
        assertTrue(capabilities.canPause());
        assertTrue(capabilities.canSkipPrevious());
        assertFalse(capabilities.canSkipNext());
        assertTrue(capabilities.canSeek());
    }
}
