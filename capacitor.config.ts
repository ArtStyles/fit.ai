import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.fitai.app',
  appName: 'Vekira',
  webDir: 'mobile/dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0d0d14',
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
      hidden: false,
    },
    SplashScreen: {
      // The local app renders loading/error states while SQLite opens.
      // Never leave those states covered by a splash that needs remote code.
      launchAutoHide: true,
      launchShowDuration: 500,
      backgroundColor: '#0d0d14',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
}

export default config
