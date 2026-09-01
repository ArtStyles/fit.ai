package com.fitai.app.music;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.SystemClock;
import android.util.Base64;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.io.File;
import java.io.FileOutputStream;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class MusicSessionMapperInstrumentedTest {

    @Test
    public void map_returnsCompleteSnapshotAndBoundsEncodedArtwork() {
        Context context = ApplicationProvider.getApplicationContext();
        MediaSession session = new MediaSession(context, "music-mapper-complete");
        Bitmap sourceArtwork = Bitmap.createBitmap(640, 320, Bitmap.Config.ARGB_8888);
        Bitmap decodedArtwork = null;
        long updateElapsedMs = Math.max(1L, SystemClock.elapsedRealtime() - 2_500L);

        try {
            sourceArtwork.eraseColor(0xff7c3aed);
            session.setMetadata(
                new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, "Blinding Lights")
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, "The Weeknd")
                    .putString(MediaMetadata.METADATA_KEY_ALBUM, "After Hours")
                    .putLong(MediaMetadata.METADATA_KEY_DURATION, 245_000L)
                    .putBitmap(MediaMetadata.METADATA_KEY_ART, sourceArtwork)
                    .build()
            );
            session.setPlaybackState(
                new PlaybackState.Builder()
                    .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE)
                    .setState(PlaybackState.STATE_PLAYING, 12_345L, 1.25f, updateElapsedMs)
                    .build()
            );
            session.setActive(true);

            MusicSessionPayload payload = MusicSessionMapper.map(
                context,
                new MediaController(context, session.getSessionToken())
            );

            assertNotNull(payload);
            assertFalse(sourceArtwork.isRecycled());
            assertEquals("Blinding Lights", payload.getTitle());
            assertEquals("The Weeknd", payload.getArtist());
            assertEquals("After Hours", payload.getAlbum());
            assertEquals(Long.valueOf(245_000L), payload.getDurationMs());
            assertEquals(Long.valueOf(12_345L), payload.getPositionMs());
            assertEquals(1.25f, payload.getPlaybackSpeed(), 0.0f);
            long mappedAgeMs = System.currentTimeMillis() - payload.getUpdatedAtMs();
            assertTrue(mappedAgeMs >= 2_000L);
            assertTrue(mappedAgeMs <= 5_000L);
            assertEquals("playing", payload.getState());
            assertTrue(payload.canPlay());
            assertTrue(payload.canPause());

            String artworkDataUrl = payload.getArtworkDataUrl();
            assertNotNull(artworkDataUrl);
            String prefix = "data:image/webp;base64,";
            assertTrue(artworkDataUrl.startsWith(prefix));
            byte[] encodedArtwork = Base64.decode(
                artworkDataUrl.substring(prefix.length()),
                Base64.DEFAULT
            );
            assertTrue(encodedArtwork.length <= 96 * 1024);
            decodedArtwork = BitmapFactory.decodeByteArray(
                encodedArtwork,
                0,
                encodedArtwork.length
            );
            assertNotNull(decodedArtwork);
            assertTrue(decodedArtwork.getWidth() <= 160);
            assertTrue(decodedArtwork.getHeight() <= 160);
        } finally {
            if (decodedArtwork != null) {
                decodedArtwork.recycle();
            }
            session.release();
            sourceArtwork.recycle();
        }
    }

    @Test
    public void map_samplesLocalUriArtworkAndReturnsExactBoundedDimensions() throws Exception {
        Context context = ApplicationProvider.getApplicationContext();
        MediaSession session = new MediaSession(context, "music-mapper-local-uri");
        Bitmap sourceArtwork = Bitmap.createBitmap(640, 320, Bitmap.Config.ARGB_8888);
        Bitmap decodedArtwork = null;
        File artworkFile = File.createTempFile("music-artwork-", ".png", context.getCacheDir());

        try {
            sourceArtwork.eraseColor(0xff2563eb);
            try (FileOutputStream output = new FileOutputStream(artworkFile)) {
                assertTrue(sourceArtwork.compress(Bitmap.CompressFormat.PNG, 100, output));
            }
            session.setMetadata(
                new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, "Local artwork")
                    .putString(
                        MediaMetadata.METADATA_KEY_ART_URI,
                        Uri.fromFile(artworkFile).toString()
                    )
                    .build()
            );
            session.setPlaybackState(
                new PlaybackState.Builder()
                    .setState(PlaybackState.STATE_PLAYING, 0L, 1.0f)
                    .build()
            );
            session.setActive(true);

            MusicSessionPayload payload = MusicSessionMapper.map(
                context,
                new MediaController(context, session.getSessionToken())
            );

            assertNotNull(payload);
            String artworkDataUrl = payload.getArtworkDataUrl();
            assertNotNull(artworkDataUrl);
            String prefix = "data:image/webp;base64,";
            assertTrue(artworkDataUrl.startsWith(prefix));
            byte[] encodedArtwork = Base64.decode(
                artworkDataUrl.substring(prefix.length()),
                Base64.DEFAULT
            );
            decodedArtwork = BitmapFactory.decodeByteArray(
                encodedArtwork,
                0,
                encodedArtwork.length
            );
            assertNotNull(decodedArtwork);
            assertEquals(160, decodedArtwork.getWidth());
            assertEquals(80, decodedArtwork.getHeight());
        } finally {
            if (decodedArtwork != null) {
                decodedArtwork.recycle();
            }
            session.release();
            sourceArtwork.recycle();
            artworkFile.delete();
        }
    }

    @Test
    public void map_usesDisplayTitleAndAlbumArtistFallbacksForPartialMetadata() {
        Context context = ApplicationProvider.getApplicationContext();
        MediaSession session = new MediaSession(context, "music-mapper-partial");

        try {
            session.setMetadata(
                new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, "Paused song")
                    .putString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST, "Album artist")
                    .build()
            );
            session.setPlaybackState(
                new PlaybackState.Builder()
                    .setActions(PlaybackState.ACTION_PLAY_PAUSE)
                    .setState(PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 0.0f)
                    .build()
            );
            session.setActive(true);

            MusicSessionPayload payload = MusicSessionMapper.map(
                context,
                new MediaController(context, session.getSessionToken())
            );

            assertNotNull(payload);
            assertEquals("Paused song", payload.getTitle());
            assertEquals("Album artist", payload.getArtist());
            assertNull(payload.getAlbum());
            assertNull(payload.getDurationMs());
            assertNull(payload.getPositionMs());
            assertNull(payload.getArtworkDataUrl());
            assertEquals("paused", payload.getState());
            assertTrue(payload.canPlay());
            assertTrue(payload.canPause());
        } finally {
            session.release();
        }
    }
}
