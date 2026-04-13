import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aurora.app',
  appName: 'Aurora',
  webDir: 'out',
  server: {
    // Permite cargar recursos desde el filesystem local en el WebView de Android
    androidScheme: 'https',
  },
};

export default config;
