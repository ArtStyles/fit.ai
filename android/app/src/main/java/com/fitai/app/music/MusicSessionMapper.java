package com.fitai.app.music;

import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

public final class MusicSessionMapper {
    private static final int MAX_ARTWORK_DIMENSION_PX = 160;
    private static final int MAX_ARTWORK_BYTES = 96 * 1024;
    private static final int INITIAL_WEBP_QUALITY = 82;
    private static final int RETRY_WEBP_QUALITY = 60;
    private static final String WEBP_DATA_URL_PREFIX = "data:image/webp;base64,";

    private MusicSessionMapper() {}

    public static MusicSessionPayload map(Context context, MediaController controller) {
        if (context == null || controller == null) {
            return null;
        }

        MediaMetadata metadata;
        PlaybackState playbackState;
        try {
            metadata = controller.getMetadata();
            playbackState = controller.getPlaybackState();
        } catch (RuntimeException exception) {
            return null;
        }
        if (metadata == null || playbackState == null) {
            return null;
        }

        try {
            return mapAvailableSession(context, controller, metadata, playbackState);
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static MusicSessionPayload mapAvailableSession(
        Context context,
        MediaController controller,
        MediaMetadata metadata,
        PlaybackState playbackState
    ) {
        String packageName = controller.getPackageName();
        String title = firstText(
            metadata.getText(MediaMetadata.METADATA_KEY_TITLE),
            metadata.getText(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)
        );
        String artist = firstText(
            metadata.getText(MediaMetadata.METADATA_KEY_ARTIST),
            metadata.getText(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
        );
        String album = text(metadata.getText(MediaMetadata.METADATA_KEY_ALBUM));
        String sourceLabel = resolveSourceLabel(context.getPackageManager(), packageName);
        String state = mapState(playbackState.getState());
        long actions = playbackState.getActions();
        boolean canPlay = hasAnyAction(
            actions,
            PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PLAY_PAUSE
        );
        boolean canPause = hasAnyAction(
            actions,
            PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
        );
        long position = playbackState.getPosition();
        Long positionMs = position == PlaybackState.PLAYBACK_POSITION_UNKNOWN ? null : position;
        Long durationMs = metadata.containsKey(MediaMetadata.METADATA_KEY_DURATION)
            ? metadata.getLong(MediaMetadata.METADATA_KEY_DURATION)
            : null;
        String artworkDataUrl = mapArtwork(context.getContentResolver(), metadata);
        String sessionId = packageName + ":" + Integer.toHexString(
            controller.getSessionToken().hashCode()
        );

        return new MusicSessionPayload(
            sessionId,
            packageName,
            sourceLabel,
            title,
            artist,
            album,
            artworkDataUrl,
            state,
            positionMs,
            durationMs,
            playbackState.getPlaybackSpeed(),
            playbackState.getLastPositionUpdateTime(),
            canPlay,
            canPause
        );
    }

    private static String resolveSourceLabel(
        PackageManager packageManager,
        String packageName
    ) {
        try {
            ApplicationInfo applicationInfo = packageManager.getApplicationInfo(packageName, 0);
            CharSequence label = packageManager.getApplicationLabel(applicationInfo);
            String normalizedLabel = text(label);
            return normalizedLabel == null ? packageName : normalizedLabel;
        } catch (PackageManager.NameNotFoundException | RuntimeException exception) {
            return packageName;
        }
    }

    private static String mapState(int state) {
        if (state == PlaybackState.STATE_PLAYING) {
            return "playing";
        }
        if (state == PlaybackState.STATE_PAUSED) {
            return "paused";
        }
        return "stopped";
    }

    private static boolean hasAnyAction(long actions, long acceptedActions) {
        return (actions & acceptedActions) != 0;
    }

    private static String firstText(CharSequence primary, CharSequence fallback) {
        String primaryText = text(primary);
        return primaryText == null ? text(fallback) : primaryText;
    }

    private static String text(CharSequence value) {
        if (value == null) {
            return null;
        }
        String result = value.toString();
        return result.trim().isEmpty() ? null : result;
    }

    private static String mapArtwork(ContentResolver contentResolver, MediaMetadata metadata) {
        OwnedBitmap artwork = null;
        OwnedBitmap boundedArtwork = null;
        try {
            artwork = findArtwork(contentResolver, metadata);
            if (artwork == null) {
                return null;
            }
            boundedArtwork = boundArtwork(artwork);
            return encodeArtwork(boundedArtwork.bitmap);
        } catch (RuntimeException exception) {
            return null;
        } finally {
            OwnedBitmap recyclable = boundedArtwork == null ? artwork : boundedArtwork;
            if (recyclable != null && recyclable.owned && !recyclable.bitmap.isRecycled()) {
                recyclable.bitmap.recycle();
            }
        }
    }

    private static OwnedBitmap findArtwork(
        ContentResolver contentResolver,
        MediaMetadata metadata
    ) {
        Bitmap artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (artwork == null) {
            artwork = metadata.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        }
        if (artwork != null) {
            return new OwnedBitmap(artwork, false);
        }

        String[] uriKeys = {
            MediaMetadata.METADATA_KEY_ART_URI,
            MediaMetadata.METADATA_KEY_ALBUM_ART_URI,
            MediaMetadata.METADATA_KEY_DISPLAY_ICON_URI,
        };
        for (String uriKey : uriKeys) {
            OwnedBitmap decoded = decodeLocalArtwork(
                contentResolver,
                metadata.getString(uriKey)
            );
            if (decoded != null) {
                return decoded;
            }
        }
        return null;
    }

    private static OwnedBitmap decodeLocalArtwork(
        ContentResolver contentResolver,
        String uriValue
    ) {
        if (uriValue == null || uriValue.trim().isEmpty()) {
            return null;
        }
        Uri uri = Uri.parse(uriValue);
        String scheme = uri.getScheme();
        if (!(ContentResolver.SCHEME_CONTENT.equals(scheme)
            || ContentResolver.SCHEME_FILE.equals(scheme)
            || ContentResolver.SCHEME_ANDROID_RESOURCE.equals(scheme))) {
            return null;
        }

        try (InputStream stream = contentResolver.openInputStream(uri)) {
            if (stream == null) {
                return null;
            }
            Bitmap decoded = BitmapFactory.decodeStream(stream);
            return decoded == null ? null : new OwnedBitmap(decoded, true);
        } catch (IOException | RuntimeException exception) {
            return null;
        }
    }

    private static OwnedBitmap boundArtwork(OwnedBitmap artwork) {
        Bitmap bitmap = artwork.bitmap;
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        if (width <= MAX_ARTWORK_DIMENSION_PX && height <= MAX_ARTWORK_DIMENSION_PX) {
            return artwork;
        }

        float scale = Math.min(
            (float) MAX_ARTWORK_DIMENSION_PX / width,
            (float) MAX_ARTWORK_DIMENSION_PX / height
        );
        int boundedWidth = Math.max(1, Math.round(width * scale));
        int boundedHeight = Math.max(1, Math.round(height * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(
            bitmap,
            boundedWidth,
            boundedHeight,
            true
        );
        if (scaled == bitmap) {
            return artwork;
        }
        if (artwork.owned) {
            bitmap.recycle();
        }
        return new OwnedBitmap(scaled, true);
    }

    private static String encodeArtwork(Bitmap artwork) {
        byte[] encoded = compressArtwork(artwork, INITIAL_WEBP_QUALITY);
        if (encoded != null && encoded.length > MAX_ARTWORK_BYTES) {
            encoded = compressArtwork(artwork, RETRY_WEBP_QUALITY);
        }
        if (encoded == null || encoded.length > MAX_ARTWORK_BYTES) {
            return null;
        }
        return WEBP_DATA_URL_PREFIX + Base64.encodeToString(encoded, Base64.NO_WRAP);
    }

    private static byte[] compressArtwork(Bitmap artwork, int quality) {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (!artwork.compress(Bitmap.CompressFormat.WEBP, quality, output)) {
                return null;
            }
            return output.toByteArray();
        } catch (IOException | RuntimeException exception) {
            return null;
        }
    }

    private static final class OwnedBitmap {
        private final Bitmap bitmap;
        private final boolean owned;

        private OwnedBitmap(Bitmap bitmap, boolean owned) {
            this.bitmap = bitmap;
            this.owned = owned;
        }
    }
}
