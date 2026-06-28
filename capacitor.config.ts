import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.fitai.app',
  appName: 'FitAI',
  webDir: 'public',
  server: {
    url: 'https://fit-ai-kohl.vercel.app',
    cleartext: false,
  },
  android: {
    backgroundColor: '#0d0d14',
  },
  plugins: {
    SplashScreen: {
      // Lo ocultamos manualmente al cargar la web (NativeAppInit), porque con
      // server.url remoto el contenido puede tardar y autohide dejaría un flash.
      launchAutoHide: false,
      backgroundColor: '#0d0d14',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
