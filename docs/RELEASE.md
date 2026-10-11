# Release guide (signed APK / AAB)

Every release must be signed with **the same release key** forever. A different key makes Android refuse
the update ("Paket, mevcut bir paketle çakıştığından uygulama yüklenemedi" / "App not installed") and
forces an uninstall that wipes saved progress.

## 1. Create the release keystore (once, on your own computer)

Requires a JDK (`keytool`). Keep the file and passwords somewhere safe (password manager + offline backup).

```bash
keytool -genkeypair -v \
  -keystore tanky-release.keystore \
  -alias tanky \
  -keyalg RSA -keysize 4096 -validity 36500 \
  -dname "CN=Tanky Tunky, O=turkmavzer, C=TR"
```

Never commit this file. (`.gitignore` blocks `keystore/release*` and `*.jks`.)

## 2. Add it to GitHub Secrets

Repo → Settings → Secrets and variables → Actions → *New repository secret*:

| Secret | Value |
|---|---|
| `RELEASE_KEYSTORE_BASE64` | output of `base64 -w0 tanky-release.keystore` (macOS: `base64 -i tanky-release.keystore`) |
| `RELEASE_KEYSTORE_PASSWORD` | store password you typed in step 1 |
| `RELEASE_KEY_ALIAS` | `tanky` |
| `RELEASE_KEY_PASSWORD` | key password (same as store password if you pressed Enter) |

Phone-only alternative: run the keytool step in any Linux shell (e.g. Termux: `pkg install openjdk-21`).

## 3. Publish a release

```bash
git tag v1.0.0 && git push origin v1.0.0
```

`.github/workflows/release.yml` builds, signs and verifies (`apksigner verify`) `app-release.apk` + `app-release.aab`,
uploads them as workflow artifacts and attaches them to a GitHub Release.
`versionCode` = workflow run number (monotonic), `versionName` = tag without `v`.

## Debug builds

Every push to `main`, `claude/**`, `fix/**` and `phase/**` produces `tanky-tunky-debug-<run>.apk`
(Actions → run → Artifacts). Debug builds are signed with the committed `keystore/debug.keystore`, referenced
explicitly in `android/app/build.gradle` (D-035), so debug APKs update each other without uninstalling.
The CI step "Verify APK signature" compares the APK's certificate with `keystore/debug.sha256`
(`05278fc8…d228`) and fails the build on any difference; the run summary shows the signer and the versionCode.
Debug and release keys differ: switching from a debug install to a release install requires one uninstall.

## Update errors on the phone

| Message | Cause | Fix |
|---|---|---|
| "Paket, mevcut bir paketle çakıştığından uygulama yüklenemedi" | The installed app was signed with another key (an APK built before D-035, or a release build). | Uninstall the game once, install the newest debug APK. From then on every debug APK updates in place. |
| "Uygulama yüklenmedi" when installing an *older* artifact | versionCode went down (Android refuses downgrades). | Always install the artifact with the highest run number. |
| Release ↔ debug | Different keys by design. | One uninstall when switching. |

