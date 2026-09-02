package com.fitai.app.music;

import android.media.session.PlaybackState;

final class MusicSessionCapabilities {
    private final boolean canPlay;
    private final boolean canPause;
    private final boolean canSkipPrevious;
    private final boolean canSkipNext;
    private final boolean canSeek;

    private MusicSessionCapabilities(
        boolean canPlay,
        boolean canPause,
        boolean canSkipPrevious,
        boolean canSkipNext,
        boolean canSeek
    ) {
        this.canPlay = canPlay;
        this.canPause = canPause;
        this.canSkipPrevious = canSkipPrevious;
        this.canSkipNext = canSkipNext;
        this.canSeek = canSeek;
    }

    static MusicSessionCapabilities fromActions(long actions) {
        return new MusicSessionCapabilities(
            hasAny(actions, PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PLAY_PAUSE),
            hasAny(actions, PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE),
            hasAny(actions, PlaybackState.ACTION_SKIP_TO_PREVIOUS),
            hasAny(actions, PlaybackState.ACTION_SKIP_TO_NEXT),
            hasAny(actions, PlaybackState.ACTION_SEEK_TO)
        );
    }

    boolean canPlay() {
        return canPlay;
    }

    boolean canPause() {
        return canPause;
    }

    boolean canSkipPrevious() {
        return canSkipPrevious;
    }

    boolean canSkipNext() {
        return canSkipNext;
    }

    boolean canSeek() {
        return canSeek;
    }

    private static boolean hasAny(long actions, long mask) {
        return (actions & mask) != 0L;
    }
}
