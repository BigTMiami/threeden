import Foundation

enum AppConfig {
    /// The server address, from API_BASE_URL in Config/*.xcconfig (via Info.plist).
    static let apiBaseURL: URL = {
        guard
            let value = Bundle.main.object(forInfoDictionaryKey: "APIBaseURL") as? String,
            let url = URL(string: value), url.scheme != nil, url.host() != nil
        else {
            fatalError("APIBaseURL is missing or invalid in Info.plist; check Config/*.xcconfig")
        }
        return url
    }()

    /// "0.4.1": prod/shared/version.json, via MARKETING_VERSION (`make ios`).
    static let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"

    /// When this copy of the app was built (its executable's date), so two
    /// builds of the same version can be told apart.
    static let builtAt: Date? = Bundle.main.executableURL.flatMap {
        try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
    }

    /// "3den 0.4.1 · built Nov 26, 2026 at 12:40 PM"
    static var versionText: String {
        guard let builtAt else { return "3den \(version)" }
        return "3den \(version) · built \(builtAt.formatted(date: .abbreviated, time: .shortened))"
    }
}
