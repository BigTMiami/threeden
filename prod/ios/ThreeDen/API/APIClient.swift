import Foundation

/// Talks to the 3den API. Every call throws only `APIError`.
/// Sends the session token (if there is one) as "Authorization: Bearer …".
struct APIClient: Sendable {
    /// Sends a request and returns the raw answer. URLSession by default;
    /// tests pass their own so no network is needed.
    typealias Transport = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    let baseURL: URL
    let tokens: TokenStore
    private let transport: Transport

    init(baseURL: URL, tokens: TokenStore = TokenStore(keychain: nil), transport: Transport? = nil) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.transport = transport ?? { request in
            try await URLSession.shared.data(for: request)
        }
    }

    // MARK: Endpoints

    func health() async throws(APIError) -> Health {
        try await send(get("api/health"))
    }

    func hello() async throws(APIError) -> HelloResponse {
        try await send(get("api/v1/hello"))
    }

    func addGreeting(_ message: String) async throws(APIError) -> Greeting {
        try await send(post("api/v1/hello", body: NewGreeting(message: message)))
    }

    func signIn(_ body: SignInRequest) async throws(APIError) -> SignedIn {
        try await send(post("api/v1/auth/signin", body: body))
    }

    func signUp(_ body: SignUpRequest) async throws(APIError) -> SignedIn {
        try await send(post("api/v1/auth/signup", body: body))
    }

    /// Ends this device's session on the server. Other devices stay signed in.
    func signOut() async throws(APIError) {
        try await sendExpectingNothing(post("api/v1/auth/signout", body: Empty()))
    }

    func me() async throws(APIError) -> Account {
        try await send(get("api/v1/me"))
    }

    func sessions() async throws(APIError) -> [DeviceSession] {
        try await send(get("api/v1/me/sessions"))
    }

    /// Signs out one of your devices.
    func deleteSession(_ id: UUID) async throws(APIError) {
        var request = get("api/v1/me/sessions/\(id.uuidString.lowercased())")
        request.httpMethod = "DELETE"
        try await sendExpectingNothing(request)
    }

    // MARK: Plumbing

    private func get(_ path: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = tokens.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.timeoutInterval = 15
        return request
    }

    private func post(_ path: String, body: some Encodable) -> URLRequest {
        var request = get(path)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? Self.encoder.encode(body)
        return request
    }

    private struct Empty: Encodable {}

    /// Sends the request; returns the body of a 2xx answer, or throws.
    private func exchange(_ request: URLRequest) async throws(APIError) -> Data {
        try await exchangeHTTP(request).0
    }

    /// Sends the request; returns a 2xx answer and its headers, or throws.
    /// Also used by the generated client's transport (ServerTransport).
    func exchangeHTTP(_ request: URLRequest) async throws(APIError) -> (Data, HTTPURLResponse) {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await transport(request)
        } catch let error as URLError {
            throw .network(error.code)
        } catch {
            throw .network(.unknown)
        }

        guard let http = response as? HTTPURLResponse else { throw .invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw .http(status: http.statusCode, detail: Self.detail(from: data))
        }
        return (data, http)
    }

    private func sendExpectingNothing(_ request: URLRequest) async throws(APIError) {
        _ = try await exchange(request)
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws(APIError) -> T {
        let data = try await exchange(request)
        do {
            return try Self.decoder.decode(T.self, from: data)
        } catch {
            throw .decoding(String(describing: error))
        }
    }

    /// FastAPI errors look like {"detail": "text"} or {"detail": [{"msg": "text", …}]}.
    private static func detail(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        if let text = object["detail"] as? String { return text }
        if let items = object["detail"] as? [[String: Any]] {
            let messages = items.compactMap { $0["msg"] as? String }
            return messages.isEmpty ? nil : messages.joined(separator: "; ")
        }
        return nil
    }

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            guard let date = parseISO8601(text) else {
                throw DecodingError.dataCorrupted(.init(
                    codingPath: decoder.codingPath,
                    debugDescription: "Not an ISO 8601 date: \(text)"
                ))
            }
            return date
        }
        return decoder
    }()

    /// Python sends microseconds ("2026-11-24T14:57:16.048390Z") or none at all;
    /// Foundation's parsers handle at most milliseconds, so trim the extra digits.
    static func parseISO8601(_ text: String) -> Date? {
        var text = text
        if let dot = text.firstIndex(of: "."),
           let zone = text[dot...].firstIndex(where: { $0 == "Z" || $0 == "+" || $0 == "-" }) {
            let fraction = text[text.index(after: dot)..<zone]
            if fraction.count > 3 {
                text.replaceSubrange(text.index(after: dot)..<zone, with: fraction.prefix(3))
            }
        }
        let withFraction = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        if let date = try? withFraction.parse(text) { return date }
        return try? Date.ISO8601FormatStyle().parse(text)
    }
}
