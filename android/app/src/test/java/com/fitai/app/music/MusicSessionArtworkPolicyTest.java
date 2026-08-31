package com.fitai.app.music;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class MusicSessionArtworkPolicyTest {

    @Test
    public void calculateInSampleSize_keepsPowerOfTwoDecodeAboveFinalBound() {
        assertEquals(4, MusicSessionArtworkPolicy.calculateInSampleSize(1_024, 512, 160));
        assertEquals(4, MusicSessionArtworkPolicy.calculateInSampleSize(640, 320, 160));
        assertEquals(1, MusicSessionArtworkPolicy.calculateInSampleSize(160, 80, 160));
    }

    @Test
    public void isProvablyLocalScheme_rejectsContentAndUnknownSources() {
        assertTrue(MusicSessionArtworkPolicy.isProvablyLocalScheme("file"));
        assertTrue(MusicSessionArtworkPolicy.isProvablyLocalScheme("android.resource"));
        assertFalse(MusicSessionArtworkPolicy.isProvablyLocalScheme("content"));
        assertFalse(MusicSessionArtworkPolicy.isProvablyLocalScheme("https"));
        assertFalse(MusicSessionArtworkPolicy.isProvablyLocalScheme(null));
    }
}
