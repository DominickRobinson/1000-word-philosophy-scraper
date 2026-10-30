# 1000 Word Philosophy Scraper

A small, e-ink-friendly tool with two buttons: **Choose folder** and **Download new articles**.

**[Open the web app](https://dominickrobinson.github.io/1000-word-philosophy-scraper/)**

The app reads the All Essays directory and public WordPress metadata to resolve outdated links and include newly published essays. It saves an EPUB for each essay from [1000-Word Philosophy](https://1000wordphilosophy.com/). It includes images, headings, the main text, notes, references, further reading and appendices. Numbered notes link back to the text; mathematical superscripts and subscripts are retained. Every EPUB has a table of contents. Website menus, related-essay recommendations, subscription forms and author biographies are removed.

## Use

1. Choose a folder.
2. Press **Download new articles**.

An empty folder starts the complete collection. A folder with existing progress downloads only missing essays. The button becomes **Stop after this article** while a download runs. Keep the app open until it finishes.

### Web / Mac / Windows / Linux

The GitHub Pages version runs entirely in your browser and reads the website's public WordPress API. It has no proxy, server account or API key. Your selected folder and its contents are not uploaded.

- **Desktop Chrome or Edge:** choose a writable directory. EPUBs and the TXT record are saved directly there.
- **Safari, Firefox and iOS browsers:** choose a directory to import its existing TXT record, then download. The main button becomes **Save ZIP**. Extract that ZIP into the library directory, including the updated TXT file. To start a fresh ZIP library, cancel the first folder picker. Existing source files are not copied into the ZIP; it contains new files and the updated history.
- A static browser session cannot automatically write to a folder that the browser has not granted access to. ZIP export handles that restriction without uploading your files.

The source site's robots.txt is checked during each web deployment. A daily Pages workflow refreshes this policy snapshot. The web app stops if it is more than eight days old; running the Pages workflow refreshes it.

## Synced progress

`philosophy-library.txt` is the portable source of download history. It contains readable UTF-8 JSON and sits beside the EPUBs. A prior copy is kept as `philosophy-library.backup.txt`.

- The TXT file is read before every essay fetch and merged immediately before a successful save.
- An existing record skips an essay even if the EPUB has not yet synced to this device. An existing EPUB with the expected filename is also skipped.
- Failed article downloads are not marked as complete. Images are capped at 1,600 pixels on the longest edge with proportions preserved; small images are never enlarged. Broken, unsupported or oversized images are omitted with a warning; the readable essay is still saved. Malformed history stops the run instead of discarding the record.
- Sync the EPUBs and TXT files together. Let sync finish before changing devices, and run downloads on one device at a time. The app does not supply a cloud-sync service or a cross-device lock.
- Previously saved essays are not refreshed when the website edits them. Choose a genuinely empty directory to build a fresh collection.

## Filenames and master index

New EPUB filenames use article titles without date prefixes. Filesystem-reserved characters are removed or replaced. Existing dated filenames and synced TXT records are still recognized; existing files are not renamed or fetched again.

Every run refreshes **All Essays.epub**, with **By Category** and **By Date** sections in its table of contents. Article titles link to the original website; find downloaded essays by their title-only filenames. There are no cross-file local links.

An explicit withdrawal notice, such as The Problem of Induction, is recorded under `unavailable` in the same TXT file. The app checks it again when the website's modification date changes, rather than repeatedly downloading the unchanged notice.

## Testing and deployment

- **CI:** browser/controller tests on pushes and pull requests.
- **GitHub Pages:** deploys after successful CI, on manual dispatch, and daily to refresh the site's policy snapshot.

This project is web-only. There are no native packages, release workflow or signing secrets.

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

The runtime has no third-party libraries. Playwright is a development-only test dependency. Tests use three original synthetic articles, check all internal EPUB targets, images, note backlinks, appendix retention, mathematical notation, folder switching, corrupted history, repeat-download prevention, API pagination and ZIP export/import.

## Source and attribution

[RSS feed](https://1000wordphilosophy.com/feed/) · [All Essays directory](https://1000wordphilosophy.com/all-essays/)

Original essay attribution is retained in each EPUB. The articles remain copyrighted by their respective rights holders. This repository contains the converter, not a redistributed anthology.
