export const musicSessionAdapter = {
  async openNotificationListenerSettings() {
    window.__musicSettingsOpenCalls += 1
  },
}
