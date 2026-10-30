# 1000 Word Philosophy Scraper

A small, e-ink-friendly tool with two buttons: **Choose folder** and **Download new articles**.

**[Open the web app](https://dominickrobinson.github.io/1000-word-philosophy-scraper/)** · **[Download Android or Mac](https://github.com/DominickRobinson/1000-word-philosophy-scraper/releases/latest)**

The app saves an EPUB for each essay from [1000-Word Philosophy](https://1000wordphilosophy.com/). It includes images, headings, the main text, notes, references, further reading and appendices. Numbered notes link back to the text; mathematical superscripts and subscripts are retained. Every EPUB has a table of contents. Website menus, related-essay recommendations, subscription forms and author biographies are removed.

## Use

1. Choose a folder.
2. Press **Download new articles**.

An empty folder starts the complete collection. A folder with existing progress downloads only missing essays. The button becomes **Stop after this article** while a download runs. Keep the app open until it finishes.

### Web / Windows / Linux

The GitHub Pages version runs entirely in your browser and reads the website's public WordPress API. It has no proxy, server account or API key. Your selected folder and its contents are not uploaded.

- **Desktop Chrome or Edge:** choose a writable directory. EPUBs and the TXT record are saved directly there.
- **Safari, Firefox and iOS browsers:** choose a directory to import its existing TXT record, then download. The main button becomes **Save ZIP**. Extract that ZIP into the library directory, including the updated TXT file. To start a fresh ZIP library, cancel the first folder picker. Existing source files are not copied into the ZIP; it contains new files and the updated history.
- A static browser session cannot automatically write to a folder that the browser has not granted access to. ZIP export handles that restriction without uploading your files.

The source site's robots.txt is checked during each web deployment. A daily Pages workflow refreshes this policy snapshot. The web app stops if it is more than eight days old; running the Pages workflow refreshes it. Native apps read robots.txt directly on every run.

### Android / Supernote

Install the APK from the release. Android 8.0+ is supported by the build, including the Android generations used by A5 X / A6 X and Nomad / Manta. The app has no Google Play dependency or architecture-specific native libraries. Device compatibility still needs testing on each Supernote and firmware version.

Enable sideloading under **Settings → Security & Privacy** on supported Supernote firmware, then use your preferred ADB installer:

```sh
adb install -r 1000-Word-Philosophy-Android.apk
```

The folder button offers a simple device-folder picker and Android's system folder picker. Select a directory such as `Document/Philosophy`. The device-folder picker requests storage access and uses only the chosen directory.

Official sideloading references: [A5 X / A6 X](https://support.supernote.com/en_US/changelog-for-a5-x-and-a6-x), [Nomad / Manta](https://support.supernote.com/changelog-for-manta-and-nomad).

### Mac

Unzip the Mac release and open the app. It is a universal Intel/Apple silicon binary for macOS 12+. The release is locally signed, not Apple-notarized. No separate Python or Node installation is required to run it.

A native iOS build is deferred. The browser ZIP workflow is available on iOS.

## Synced progress

`philosophy-library.txt` is the portable source of download history. It contains readable UTF-8 JSON and sits beside the EPUBs. A prior copy is kept as `philosophy-library.backup.txt`.

- The TXT file is read before every essay fetch and merged immediately before a successful save.
- An existing record skips an essay even if the EPUB has not yet synced to this device. An existing EPUB with the expected filename is also skipped.
- Failed downloads and missing images are not marked as complete. Malformed history stops the run instead of discarding the record.
- Sync the EPUBs and TXT files together. Let sync finish before changing devices, and run downloads on one device at a time. The app does not supply a cloud-sync service or a cross-device lock.
- Previously saved essays are not refreshed when the website edits them. Choose a genuinely empty directory to build a fresh collection.

## Builds and releases

- **CI:** browser/controller tests plus native Mac and Android compilation on pushes and pull requests. CI Android artifacts use a temporary development key.
- **GitHub Pages:** deploys after successful CI, on manual dispatch, and daily to refresh the site's policy snapshot.
- **Release:** pushing a `v*` tag runs tests, builds Mac/Android packages, creates checksums and publishes a GitHub release.

Release Android builds use encrypted repository secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`. These contain the original app signing identity so updates remain compatible. Private keys and passwords must never be committed. Without these secrets, release signing fails rather than silently using a new identity.

### Local development

```sh
npm ci
npx playwright install chromium
npm test
npm run build:web
```

Serve `dist/web` with an HTTP server. Direct folder access requires HTTPS or localhost. The static build needs internet access to check the source site's policy.

```sh
python3 -m http.server 8000 --directory dist/web
```

Native builds:

```sh
python3 build.py mac
python3 build.py android
```

Mac requires Xcode command-line tools. Android requires Java 21 and Android SDK platform 35/build-tools 35.0.0; set `ANDROID_HOME` if needed. Build output is in `dist/`, intermediates and development signing data in `.build/`. Set `ANDROID_KEYSTORE_PATH` and `ANDROID_KEYSTORE_PASSWORD` for a locally release-signed APK. `RELEASE_BUILD=1` requires those settings. `APP_VERSION`, `POCKET_OUTPUT` and `POCKET_BUILD` override version and output paths.

The runtime has no third-party libraries. Playwright is a development-only test dependency. Tests use three original synthetic articles, check all internal EPUB targets, images, note backlinks, appendix retention, mathematical notation, folder switching, corrupted history, repeat-download prevention, API pagination and ZIP export/import.

## Source and attribution

[RSS feed](https://1000wordphilosophy.com/feed/) · [All Essays directory](https://1000wordphilosophy.com/all-essays/)

Original essay attribution is retained in each EPUB. The articles remain copyrighted by their respective rights holders. This repository contains the converter, not a redistributed anthology.
