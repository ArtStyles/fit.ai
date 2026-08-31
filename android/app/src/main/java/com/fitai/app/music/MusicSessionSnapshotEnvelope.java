package com.fitai.app.music;

import java.util.Collections;
import java.util.Map;

public final class MusicSessionSnapshotEnvelope {
    public static final String SNAPSHOT_KEY = "snapshot";

    private final MusicSessionPayload snapshot;

    private MusicSessionSnapshotEnvelope(MusicSessionPayload snapshot) {
        this.snapshot = snapshot;
    }

    public static MusicSessionSnapshotEnvelope of(MusicSessionPayload snapshot) {
        return new MusicSessionSnapshotEnvelope(snapshot);
    }

    public MusicSessionPayload getSnapshot() {
        return snapshot;
    }

    public Map<String, MusicSessionPayload> asMap() {
        return Collections.singletonMap(SNAPSHOT_KEY, snapshot);
    }
}
