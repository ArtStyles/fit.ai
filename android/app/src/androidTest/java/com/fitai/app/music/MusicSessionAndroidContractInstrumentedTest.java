package com.fitai.app.music;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.pm.ServiceInfo;
import android.service.notification.NotificationListenerService;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.fitai.app.MainActivity;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class MusicSessionAndroidContractInstrumentedTest {
    @Test
    public void notificationListenerServiceHasTheExactSystemContract() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageManager packageManager = context.getPackageManager();
        ComponentName component = new ComponentName(
            context,
            VekiraNotificationListenerService.class
        );

        ServiceInfo serviceInfo = packageManager.getServiceInfo(component, 0);
        Intent listenerIntent = new Intent(NotificationListenerService.SERVICE_INTERFACE)
            .setPackage(context.getPackageName());
        List<ResolveInfo> listeners = packageManager.queryIntentServices(listenerIntent, 0);

        assertTrue(serviceInfo.exported);
        assertEquals(
            Manifest.permission.BIND_NOTIFICATION_LISTENER_SERVICE,
            serviceInfo.permission
        );
        assertTrue(
            listeners.stream().anyMatch(
                info -> info.serviceInfo != null
                    && component.getClassName().equals(info.serviceInfo.name)
            )
        );
    }

    @Test
    public void applicationDoesNotRequestAudioRecordingPermission() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        PackageInfo packageInfo = context.getPackageManager().getPackageInfo(
            context.getPackageName(),
            PackageManager.GET_PERMISSIONS
        );
        List<String> requestedPermissions = packageInfo.requestedPermissions == null
            ? java.util.Collections.emptyList()
            : Arrays.asList(packageInfo.requestedPermissions);

        assertFalse(requestedPermissions.contains(Manifest.permission.RECORD_AUDIO));
    }

    @Test
    public void launchedBridgeIndexesTheMusicSessionPluginByItsPublicName() {
        CapacitorPlugin annotation = MusicSessionPlugin.class.getAnnotation(
            CapacitorPlugin.class
        );
        assertNotNull(annotation);
        assertEquals("MusicSession", annotation.name());

        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(
            context.getPackageName()
        );
        assertNotNull(launchIntent);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        Activity activity = instrumentation.startActivitySync(launchIntent);
        try {
            instrumentation.waitForIdleSync();
            assertTrue(activity instanceof MainActivity);
            MainActivity mainActivity = (MainActivity) activity;
            assertNotNull(mainActivity.getBridge());
            PluginHandle handle = mainActivity.getBridge().getPlugin("MusicSession");
            assertNotNull(handle);
            assertEquals(MusicSessionPlugin.class, handle.getPluginClass());
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}
