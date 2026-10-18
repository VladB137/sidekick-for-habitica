# Security

Sidekick for Habitica holds the one secret that matters to its players: their Habitica API Token, which works like a password. A problem that could expose it, or let someone act on a Habitica account, is the most important kind of bug here.

## Reporting a problem

Please report security problems **privately**, not in a public issue:

- On GitHub: the repository's **Security** tab → **Report a vulnerability**. Only the maintainer sees the report.

Say what you found, which app version (Settings → About), and how to reproduce it. You'll get an answer as soon as possible; this is a hobby project, so there is no fixed time, but security reports come before everything else.

**Never include anyone's API Token in a report, including your own.** If you think yours has leaked, reset it on habitica.com, on the same page as your User ID; that logs every app out. Then log in to Sidekick again.

## What counts

- The token or User ID leaving the phone for anywhere but habitica.com, or being written to a log, a backup file or another app.
- Another app on the phone reading Sidekick's saved login.
- Sidekick changing an account without a tap, other than Night gear equipping gear when it is switched on.
- Task text from challenges or parties running as code in the app.
- Anything in the release APK or the build that would let someone ship a fake update.

Problems with Habitica itself go to Habitica: admin@habitica.com. Please don't report them here, and don't test against other people's Habitica accounts.

## Supported versions

Only the newest release gets fixes. Install updates through Obtainium or the Releases page.
