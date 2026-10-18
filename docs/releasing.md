# Releasing a version

Public releases are release builds: not debuggable, signed with the release key, with a version from `package.json`. The Latest dev build stays as it is, a debug build for testing.

Why the split: anyone with a debuggable app on an unlocked phone with USB debugging on can run code as that app (`adb run-as`), and code running as the app can have the Keystore decrypt the saved API token. A release build can't be entered that way.

## Once: the release key

The key signs every update for good. Android installs an update only when it's signed with the same key, so a lost key means no update can ever reach people who installed the app. Make it on your own computer (keytool comes with any Java), never in a chat or a cloud session:

```bash
keytool -genkeypair -keystore sidekick-release.keystore -alias sidekick \
  -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=Sidekick for Habitica"
```

It asks for one password (store and key share it). Then:

1. **Keep two copies** of `sidekick-release.keystore` and its password, for example in your password manager and on a USB stick. GitHub never shows a secret again.
2. On GitHub: **Settings → Secrets and variables → Actions → New repository secret**, twice:
   - `RELEASE_KEYSTORE_B64`: the output of `base64 -w0 sidekick-release.keystore` (macOS: `base64 -i sidekick-release.keystore`)
   - `RELEASE_KEYSTORE_PASSWORD`: the password
3. Delete any other copies, such as the base64 text in your clipboard or a terminal's history.

## Each release

1. `package.json` gets the new version (`1.0.0`) on `main`, through a PR like any change. Android's `versionCode` follows from it (major×10000 + minor×100 + patch), so each release is a higher number than the last. The same PR adds the release notes:
   - `docs/release-notes/1.0.0.md`: what's new, with every new lever listed. The draft Release starts with it.
   - `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt` (`10000.txt` for 1.0.0): a short version, under 500 characters, which F-Droid and IzzyOnDroid show.
2. Start the build, either way:
   - On GitHub: **Actions → Release → Run workflow**, branch `main`, **Run workflow**. Once the APK is built, it tags main's commit with the version (`v1.0.0`). Works from a phone's browser. Claude's cloud sessions can't push tags, so this is the way when Claude is doing the rest.
   - Or push the tag yourself: `git tag v1.0.0 <commit> && git push origin v1.0.0`.
3. `.github/workflows/release.yml` checks the commit is on `main` and the tag matches `package.json`, builds and signs the APK, and refuses it if it's debuggable, unsigned or the wrong version. It then opens a **draft** Release with `sidekick-for-habitica-1.0.0.apk`, its SHA-256 and the signing certificate's SHA-256.
4. Open the draft, check what's new (new levers must be listed), and press **Publish**. Nothing is public before that.

## Your own phone

Dev builds are a separate app (`io.github.vladb137.sidekick.dev`, "Sidekick dev"), so a release installs next to them. To carry your data across, back up to a file in one (Settings → Account) and restore it in the other.
