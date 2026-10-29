import Cocoa
import WebKit
import CryptoKit

final class PocketDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate, URLSessionTaskDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var folder: URL?
    let queue = DispatchQueue(label: "pocket.files")
    var lastRequest = Date.distantPast
    var activity: NSObjectProtocol?
    let allowedHosts: Set<String> = ["1000wordphilosophy.com", "www.1000wordphilosophy.com", "i0.wp.com", "i1.wp.com", "i2.wp.com", "1000wordphilosophy.files.wordpress.com"]
    lazy var cache: URL = {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("com.philosophypocket.app")
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }()
    func applicationDidFinishLaunching(_ notification: Notification) {
        if let path = UserDefaults.standard.string(forKey: "outputFolder") { folder = URL(fileURLWithPath: path, isDirectory: true) }
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "bridge")
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 650, height: 620), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "1000 Word Philosophy Scraper"
        window.minSize = NSSize(width: 380, height: 520)
        window.backgroundColor = .white
        window.contentView = web
        window.center()
        let resources = Bundle.main.resourceURL!.appendingPathComponent("web")
        web.loadFileURL(resources.appendingPathComponent("index.html"), allowingReadAccessTo: resources)
        let menu = NSMenu(), appMenu = NSMenu(), root = NSMenuItem()
        root.submenu = appMenu
        appMenu.addItem(withTitle: "Quit 1000 Word Philosophy Scraper", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(root)
        let edit = NSMenuItem(title: "Edit", action: nil, keyEquivalent: ""), editMenu = NSMenu(title: "Edit")
        for (name, selector, key) in [("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] { editMenu.addItem(withTitle: name, action: Selector(selector), keyEquivalent: key) }
        edit.submenu = editMenu; menu.addItem(edit); NSApp.mainMenu = menu
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func reply(_ id: Int, _ result: Any? = nil, _ error: String? = nil) {
        DispatchQueue.main.async {
            let args: [Any] = [id, result ?? NSNull(), error as Any? ?? NSNull()]
            guard let data = try? JSONSerialization.data(withJSONObject: args, options: [.fragmentsAllowed]), let json = String(data: data, encoding: .utf8) else { return }
            self.web.evaluateJavaScript("window.nativeResult.apply(null,\(json));", completionHandler: nil)
        }
    }
    func validURL(_ url: URL) -> Bool { url.scheme == "https" && allowedHosts.contains(url.host ?? "") && url.user == nil && url.password == nil }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(request.url.map(validURL) == true ? request : nil) }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, url.isFileURL, url.path.hasPrefix(Bundle.main.resourceURL!.path + "/web/") { decisionHandler(.allow) } else { decisionHandler(.cancel) }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let raw = message.body as? String, let data = raw.data(using: .utf8), let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let id = obj["id"] as? Int, let action = obj["action"] as? String else { return }
        let args = obj["args"] as? [String: Any] ?? [:]
        if action == "chooseFolder" {
            let panel = NSOpenPanel(); panel.canChooseFiles = false; panel.canChooseDirectories = true; panel.canCreateDirectories = true; panel.allowsMultipleSelection = false; panel.message = "Choose the synced folder for your EPUBs and philosophy-library.txt."
            panel.beginSheetModal(for: window) { response in
                if response == .OK, let url = panel.url { self.folder = url; UserDefaults.standard.set(url.path, forKey: "outputFolder"); self.reply(id, ["label": url.path]) } else { self.reply(id) }
            }; return
        }
        if action == "settings" { reply(id, ["folder": folder.map { ["label": $0.path] } as Any? ?? NSNull()]); return }
        if action == "openURL" { if let s = args["url"] as? String, let url = URL(string:s), validURL(url) { NSWorkspace.shared.open(url); reply(id, true) } else { reply(id, nil, "Unsupported link") }; return }
        if action == "keepAwake" {
            if args["on"] as? Bool == true { activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiated, .idleSystemSleepDisabled], reason: "Saving philosophy essays") }
            else if let token = activity { ProcessInfo.processInfo.endActivity(token); activity = nil }
            reply(id, true); return
        }
        queue.async {
            do {
                switch action {
                case "library":
                    guard let folder = self.folder else { throw PocketError("Choose a folder first.") }
                    let names = try FileManager.default.contentsOfDirectory(atPath: folder.path)
                    let ledger = folder.appendingPathComponent("philosophy-library.txt")
                    let backup = folder.appendingPathComponent("philosophy-library.backup.txt")
                    let raw = FileManager.default.fileExists(atPath: ledger.path) ? try String(contentsOf: ledger, encoding: .utf8) : (FileManager.default.fileExists(atPath: backup.path) ? try String(contentsOf: backup, encoding: .utf8) : "")
                    self.reply(id, ["files": names, "ledger": raw])
                case "write":
                    guard let folder = self.folder, let name = args["name"] as? String, !name.contains("/"), !name.contains("\\"), !name.hasPrefix("."), name.hasSuffix(".epub") || name == "philosophy-library.txt" else { throw PocketError("Invalid output file or missing folder.") }
                    let destination = folder.appendingPathComponent(name)
                    if args["replace"] as? Bool != true && FileManager.default.fileExists(atPath: destination.path) { self.reply(id, ["skipped":true]); return }
                    let bytes: Data
                    if let b64 = args["base64"] as? String, let decoded = Data(base64Encoded: b64) { bytes = decoded }
                    else if let text = args["text"] as? String { bytes = Data(text.utf8) }
                    else { throw PocketError("No file content supplied.") }
                    if name == "philosophy-library.txt", FileManager.default.fileExists(atPath: destination.path) {
                        let old = try Data(contentsOf: destination); try old.write(to: folder.appendingPathComponent("philosophy-library.backup.txt"), options: .atomic)
                    }
                    try bytes.write(to: destination, options: .atomic)
                    self.reply(id, ["saved":true])
                case "fetch":
                    guard let raw = args["url"] as? String, let url = URL(string: raw), self.validURL(url) else { throw PocketError("Only the philosophy website and its image hosts can be downloaded.") }
                    let hash = SHA256.hash(data: Data(raw.utf8)).map { String(format:"%02x",$0) }.joined()
                    let cached = self.cache.appendingPathComponent(hash + ".json")
                    if args["fresh"] as? Bool != true, let cachedData = try? Data(contentsOf: cached), let cachedObj = try? JSONSerialization.jsonObject(with: cachedData) { self.reply(id, cachedObj); return }
                    let delay = 1.0 - Date().timeIntervalSince(self.lastRequest); if delay > 0 { Thread.sleep(forTimeInterval: delay) }; self.lastRequest = Date()
                    var request = URLRequest(url:url);request.timeoutInterval = 50;request.setValue("PhilosophyPocket/1.0 (personal EPUB library; rate-limited)", forHTTPHeaderField:"User-Agent")
                    let config = URLSessionConfiguration.ephemeral
                    let session = URLSession(configuration:config, delegate:self, delegateQueue:nil)
                    let semaphore = DispatchSemaphore(value:0)
                    var result: [String:Any]?;var failure: Error?
                    session.dataTask(with:request) { data,response,error in
                        defer { semaphore.signal() }
                        if let error = error { failure = error; return }
                        guard let data = data, data.count <= 20_000_000, let response = response as? HTTPURLResponse else { failure = PocketError("Invalid or oversized response."); return }
                        result = ["status":response.statusCode,"url":response.url?.absoluteString ?? raw,"base64":data.base64EncodedString(),"text":String(data:data,encoding:.utf8) ?? ""]
                    }.resume()
                    semaphore.wait();session.finishTasksAndInvalidate()
                    if let failure = failure { throw failure }
                    guard let result = result else { throw PocketError("Empty response") }
                    if result["status"] as? Int == 200 { let json = try JSONSerialization.data(withJSONObject:result);try json.write(to:cached,options:.atomic) }
                    self.reply(id,result)
                default: throw PocketError("Unknown operation")
                }
            } catch { self.reply(id,nil,error.localizedDescription) }
        }
    }
}
struct PocketError: LocalizedError { var message:String;init(_ message:String){self.message=message};var errorDescription:String?{message} }
let application = NSApplication.shared
let delegate = PocketDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
