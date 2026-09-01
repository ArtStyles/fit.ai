package com.fitai.app.music;

import android.content.ComponentName;
import android.service.notification.NotificationListenerService;

public final class VekiraNotificationListenerService extends NotificationListenerService {
    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        requestRebind(new ComponentName(this, VekiraNotificationListenerService.class));
    }
}
