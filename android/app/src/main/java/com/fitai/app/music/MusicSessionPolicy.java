package com.fitai.app.music;

import java.util.List;

public final class MusicSessionPolicy {
    private MusicSessionPolicy() {}

    public static MusicSessionPayload selectFirst(
        List<MusicSessionPayload> candidates,
        String ownPackageName
    ) {
        for (MusicSessionPayload candidate : candidates) {
            boolean eligibleState = "playing".equals(candidate.getState())
                || "paused".equals(candidate.getState());
            if (!ownPackageName.equals(candidate.getPackageName())
                && candidate.getTitle() != null
                && !candidate.getTitle().trim().isEmpty()
                && eligibleState) {
                return candidate;
            }
        }
        return null;
    }
}
