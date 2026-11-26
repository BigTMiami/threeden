import Foundation

/// The one error type the API client throws.
enum APIError: Error, Equatable {
    /// Couldn't reach the server (offline, wrong address, server down).
    case network(URLError.Code)
    /// The server answered with an error status. `detail` is FastAPI's message, if any.
    case http(status: Int, detail: String?)
    /// The server answered, but not with what the app expected.
    case decoding(String)
    /// Not an HTTP response at all.
    case invalidResponse

    var isUnauthorized: Bool {
        if case .http(401, _) = self { return true }
        return false
    }
}

extension APIError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .network(.notConnectedToInternet):
            "You're offline."
        case .network(.timedOut):
            "The server took too long to answer."
        case .network:
            "Couldn't reach the server."
        // The server's own words, when it gives them ("@rosa is taken.").
        case .http(_, let detail?):
            detail
        case .http(401, nil):
            "Please sign in again."
        case .http(429, nil):
            "Too many tries. Wait a few minutes and try again."
        case .http(let status, nil) where status >= 500:
            "The 3den server had a problem. Try again in a moment."
        case .http(let status, nil):
            "The server said no (\(status))."
        case .decoding, .invalidResponse:
            "The server's answer didn't make sense."
        }
    }
}
