import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.weekflow.app',
  appName: 'WeekFlow',
  webDir: 'dist',
  android: {
    // The app is light-first; the WebView background matches --ground so there is
    // no white flash before React paints.
    backgroundColor: '#F5F7FC',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_weekflow',
      iconColor: '#41669F',
    },
  },
};

export default config;
