package com.fitai.app.music;

import com.getcapacitor.JSObject;
import org.json.JSONObject;

public final class MusicSessionPayload {
    private final String sessionId;
    private final String packageName;
    private final String sourceLabel;
    private final String title;
    private final String artist;
    private final String album;
    private final String artworkDataUrl;
    private final String state;
    private final Long positionMs;
    private final Long durationMs;
    private final float playbackSpeed;
    private final long updatedAtMs;
    private final boolean canPlay;
    private final boolean canPause;

    public MusicSessionPayload(
        String sessionId,
        String packageName,
        String sourceLabel,
        String title,
        String artist,
        String album,
        String artworkDataUrl,
        String state,
        Long positionMs,
        Long durationMs,
        float playbackSpeed,
        long updatedAtMs,
        boolean canPlay,
        boolean canPause
    ) {
        this.sessionId = sessionId;
        this.packageName = packageName;
        this.sourceLabel = sourceLabel;
        this.title = title;
        this.artist = artist;
        this.album = album;
        this.artworkDataUrl = artworkDataUrl;
        this.state = state;
        this.positionMs = positionMs;
        this.durationMs = durationMs;
        this.playbackSpeed = playbackSpeed;
        this.updatedAtMs = updatedAtMs;
        this.canPlay = canPlay;
        this.canPause = canPause;
    }

    public String getSessionId() {
        return sessionId;
    }

    public String getPackageName() {
        return packageName;
    }

    public String getSourceLabel() {
        return sourceLabel;
    }

    public String getTitle() {
        return title;
    }

    public String getArtist() {
        return artist;
    }

    public String getAlbum() {
        return album;
    }

    public String getArtworkDataUrl() {
        return artworkDataUrl;
    }

    public String getState() {
        return state;
    }

    public Long getPositionMs() {
        return positionMs;
    }

    public Long getDurationMs() {
        return durationMs;
    }

    public float getPlaybackSpeed() {
        return playbackSpeed;
    }

    public long getUpdatedAtMs() {
        return updatedAtMs;
    }

    public boolean canPlay() {
        return canPlay;
    }

    public boolean canPause() {
        return canPause;
    }

    public JSObject toJSObject() {
        JSObject object = new JSObject();
        object.put("sessionId", sessionId);
        object.put("packageName", packageName);
        object.put("sourceLabel", sourceLabel);
        object.put("title", title);
        object.put("artist", nullable(artist));
        object.put("album", nullable(album));
        object.put("artworkDataUrl", nullable(artworkDataUrl));
        object.put("state", state);
        object.put("positionMs", nullable(positionMs));
        object.put("durationMs", nullable(durationMs));
        object.put("playbackSpeed", playbackSpeed);
        object.put("updatedAtMs", updatedAtMs);
        object.put("canPlay", canPlay);
        object.put("canPause", canPause);
        return object;
    }

    private static Object nullable(Object value) {
        return value == null ? JSONObject.NULL : value;
    }
}
