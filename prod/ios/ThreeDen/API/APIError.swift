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
        case .http(422, _):
            "A greeting needs 1 to 200 characters."
        case .http(let status, let detail?):
            "The server said no (\(status)): \(detail)"
        case .http(let status, nil):
            "The server said no (\(status))."
        case .decoding, .invalidResponse:
            "The server's answer didn't make sense."
        }
    }
}
