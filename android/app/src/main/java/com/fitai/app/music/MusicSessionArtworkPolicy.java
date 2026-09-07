package com.fitai.app.music;

final class MusicSessionArtworkPolicy {
    private static final String FILE_SCHEME = "file";
    private static final String ANDROID_RESOURCE_SCHEME = "android.resource";

    private MusicSessionArtworkPolicy() {}

    static boolean isProvablyLocalScheme(String scheme) {
        return FILE_SCHEME.equals(scheme) || ANDROID_RESOURCE_SCHEME.equals(scheme);
    }

    static int calculateInSampleSize(int width, int height, int maxDimension) {
        if (width <= 0 || height <= 0 || maxDimension <= 0) {
            return 1;
        }

        int largestDimension = Math.max(width, height);
        int inSampleSize = 1;
        while (largestDimension / (inSampleSize * 2) >= maxDimension) {
            inSampleSize *= 2;
        }
        return inSampleSize;
    }
}
