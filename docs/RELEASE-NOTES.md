A minimal two-button EPUB scraper for 1000-Word Philosophy.

- **Web:** [Open the GitHub Pages app](https://dominickrobinson.github.io/1000-word-philosophy-scraper/). Chrome and Edge on desktop can save directly to a chosen directory. Browsers without writable directory access export a ZIP containing new EPUBs and the updated TXT history.
- **Android:** install the APK. It supports Android 8+ and uses the same signing key as the original personal build, so it can update that installation. No Google Play services are required.
- **Mac:** unzip and open the universal Intel/Apple silicon app (macOS 12+). It is locally signed, not notarized by Apple.

The app preserves article images, headings, notes, references and appendices. Citations have return links, mathematical superscripts/subscripts are retained, and every EPUB includes a table of contents. Download history is stored in `philosophy-library.txt` beside the EPUBs. Sync that folder before switching devices.

Windows and Linux use the web app. A native iOS app is deferred; iOS browsers can use ZIP export. Physical Supernote testing is still needed.

Builds use automated synthetic tests; no copyrighted essay collection is included in these release assets. Checksums are in `SHA256SUMS.txt`.
