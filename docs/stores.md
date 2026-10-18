# Where the app is published

| Channel | Ships | Updates reach people | State |
|---|---|---|---|
| GitHub Releases | our APK, release key | by hand, or through Obtainium | live since 1.0.0 |
| [Obtainium](https://github.com/ImranR98/Obtainium) | our APK from GitHub Releases | Obtainium checks GitHub | live (README's recommended way) |
| [IzzyOnDroid](https://apt.izzysoft.de/fdroid/) | our APK, copied from the GitHub Release | Izzy's updater picks up each new Release within a day | to request |
| [F-Droid](https://f-droid.org/) | our APK, after F-Droid rebuilds the release from source and gets the same bytes | F-Droid's update check reads new `v*` tags | later (see below) |

Every channel ships the APK signed with the release key, so people can move between them without uninstalling. No Google Play (a decision, 2026-10-17).

## What both stores require, and where the repo meets it

- **Free licence and public source:** GPL-3.0-only, this repo.
- **A signed release APK on a tagged GitHub Release**, not debuggable: `.github/workflows/release.yml` (docs/releasing.md).
- **No Google dependency block.** The Android Gradle plugin normally adds a list of the app's libraries to the APK's signing block, encrypted with Google's key so only Google Play can read it. Both stores refuse an APK carrying it, so `android/app/build.gradle` turns it off (`dependenciesInfo`). The 1.0.0 APK still has it; every later release doesn't.
- **No trackers, ads or self-updater.** An update feature may only download an APK after an explicit opt-in that says it bypasses the store's checks, and F-Droid counts a background update check that wasn't switched on as tracking.
- **Store listing from the repo:** `fastlane/metadata/android/en-US/` (title, short and full description, icon, phone screenshots) and `changelogs/<versionCode>.txt` for each release. Both stores read these; IzzyOnDroid from `main`, F-Droid from the release tag. Short description at most 80 characters, changelog at most 500 bytes.
- **Anti-features** the listing will carry, and why:
  - `NonFreeAssets`: Habitica's pet, mount, item and skill artwork is CC BY-NC-SA 3.0 (LICENSE-ASSETS.md). Both stores accept non-commercial artwork with this label.
  - `TetheredNet`: the app works only with habitica.com. Habitica's server is open source and can be self-hosted, but the app can't be pointed at another server (on purpose: the token goes only to habitica.com).

## Reproducible builds

F-Droid and IzzyOnDroid each rebuild a release from the tagged commit in a clean container and compare it with the APK on the GitHub Release; only the signature may differ. When they match, F-Droid publishes our signed APK instead of signing its own, and IzzyOnDroid shows a "reproducible" badge. A release reproduces when:

- It's built from a clean checkout of the exact tagged commit (release.yml does this).
- Nothing in it depends on when or where it was built. The web bundle's date (Settings) is the commit's date (`SOURCE_DATE_EPOCH` overrides it), and the service worker's cache name is a hash of the built files. Anything new that stamps a time, a random ID or an unsorted file list into the bundle or the APK breaks this.
- The tools match: Node 22, JDK 21 (Temurin), the Gradle wrapper's version, Habitica cloned at the tag in `src/engine/rules.ts`, `npm ci` from the lockfile.

To check one yourself: build the release commit unsigned (`npm ci`, clone Habitica, `npm run harness -- ../habitica`, `npm run android:sync`, `cd android && ./gradlew assembleRelease` without the `RELEASE_KEYSTORE` variables), then `apksigcopier compare sidekick-for-habitica-<version>.apk --unsigned app-release-unsigned.apk` (`pip install apksigcopier`; it needs `apksigner` from the Android SDK build-tools on `PATH`). No output means it reproduces; `diffoscope` on the two shows any difference.

## F-Droid

F-Droid's inclusion policy asks for at least three months of active development, or proof of users, before it takes a new app, so the request goes in once the app has been out for a while (IzzyOnDroid has no such rule). The request is a merge request on [fdroiddata](https://gitlab.com/fdroid/fdroiddata) adding a build recipe; the version code F-Droid reads for updates is the `versionCode` line in `android/app/build.gradle`, which the build checks against `package.json`.
