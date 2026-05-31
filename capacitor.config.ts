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
}

export default config
