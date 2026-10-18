import type { CapacitorConfig } from '@capacitor/cli';

// The Android app: the same bundle as the website, inside a Capacitor shell (android/).
const config: CapacitorConfig = {
  appId: 'io.github.vladb137.sidekick',
  appName: 'Sidekick for Habitica',
  webDir: 'dist',
  android: {
    // the bundle talks only to habitica.com over https; nothing loads over http
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    // Capacitor's own logging writes every plugin call's arguments and results to logcat in a debug build (the dev APK is
    // one): setCredentials and getCredentials carry the API token, reportRead the account. Off in every build.
    loggingBehavior: 'none',
    // the oldest WebView the build runs in (vite.config.ts target); an older one gets a page saying to update it, not a blank screen
    minWebViewVersion: 66,
  },
  server: { errorPath: 'webview-update.html' },
  plugins: {
    // the app bar under the status bar is always dark (teal, amber or blue grey): light status-bar icons
    SystemBars: { style: 'DARK' },
  },
};

export default config;
