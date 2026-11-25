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
}
