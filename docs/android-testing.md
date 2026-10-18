# Android dev build: install and test

Every merge to `main` that passes CI replaces the **Latest dev build** pre-release with the new APK. It's a pre-release, so the app's "Get the update" link (which opens the latest release) never points at it.

This is a debug build, for testing only. Public releases are separate, signed release builds ([releasing.md](releasing.md)); the two can't install over each other.

## Download and install (Android 9+)
1. On the phone, open the repo's **Releases → Latest dev build → `sidekick-for-habitica-dev.apk`**. The direct link always points at the newest build: `https://github.com/VladB137/sidekick-for-habitica/releases/download/dev-latest/sidekick-for-habitica-dev.apk`
2. Open the downloaded file. When Android asks, allow "Install unknown apps" for the browser (or the Files app).
3. Tap Install (or Update), then Open.

Dev builds all share one dev signing key, so a newer one installs over the old one and keeps your login. The key lives only in the `DEV_KEYSTORE_B64` repository secret (Settings → Secrets and variables → Actions), never in the repo: anyone holding it could sign an APK that installs over the dev app and reads its saved token. Without the secret CI still builds, but the Latest dev build isn't published.

The dev build is its own app, `io.github.vladb137.sidekick.dev` ("Sidekick dev" on the launcher), so it sits next to a released Sidekick for Habitica with its own login. Builds from before the rename (`io.github.critoracle`, "Habitica Oracle") are a third app: log out in it, then uninstall it.

## Test checklist
Note your Android version and the phone model. For anything that fails, report what you saw.

**App shell**
- [ ] The launcher icon is a winking brown owl on a crystal ball, on teal light rays (on Android 13+ with themed icons on, a one-colour owl). The splash screen is dark teal with the owl on its crystal ball.
- [ ] Log in with "Remember on this device" ticked. The Now screen shows the verdict, and the status bar matches the app bar (teal, or amber when the next task crits).
- [ ] Back closes an open sheet first. From another tab it returns to Now. From Now it leaves the app.
- [ ] Close the app fully and reopen it. You are still logged in (token read from the Keystore).
- [ ] Log out, then reopen the app. You land on the login screen.

**Settings → On this phone** (log in with Remember ticked)
- [ ] Turn on the verdict notification. On Android 13+ it asks for permission first. A silent ongoing notification appears with the same verdict as Now. It is amber when the next task crits.
- [ ] Read when Habitica closes: tap Allow, grant usage access to Sidekick for Habitica, and come back. The row says "Allowed".
- [ ] With the notification on and Sidekick closed: score a task in the Habitica app, then leave Habitica. Within about 30 s the notification updates to the new verdict.
- [ ] Turn on "Refresh every 15 minutes". Leave the phone for a while: the notification time moves forward at least every 15–30 min. Android may delay this.
- [ ] Widget: add "Sidekick for Habitica" from the home-screen widget picker. It shows the same line, and tapping it opens the app.
- [ ] Tile: add "Crit verdict" from the Quick Settings editor. The label shows the verdict. Tapping it reads once ("Reading…" first, then the new verdict).
- [ ] Wait more than 90 s without a read. The notification and widget switch to the past-tense "At hh:mm your next task was…" line.
- [ ] Airplane mode, then tap the tile. The line says "Offline".
- [ ] Repeating To-Dos (Tasks → New repeating To-Do): save one with 1 day. Android 13+ asks for notifications once. It appears in your To-Dos in Habitica's own app too.
- [ ] Tick it in Habitica's own app (with the notification or the 15-minute refresh on, so the phone reads). Next morning at 9:00 a reminder "… is back" comes, on the "Repeating To-Dos" channel.
- [ ] Tap **Tomorrow**: the reminder goes and comes back the next day. Tap **Add to To-Dos**: it shows "Adding…", then "… is in your To-Dos", and the To-Do is in Habitica. A second tap during "Adding…" is impossible (no buttons).
- [ ] Airplane mode, then Add: the reminder says it couldn't reach Habitica and keeps its buttons.
- [ ] Log out in the app. The notification disappears, and the widget and tile go back to asking you to log in. Repeating To-Do reminders disappear too.
