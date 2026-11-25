import Foundation

/// Talks to the 3den API. Every call throws only `APIError`.
struct APIClient: Sendable {
    /// Sends a request and returns the raw answer. URLSession by default;
    /// tests pass their own so no network is needed.
    typealias Transport = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    let baseURL: URL
    private let transport: Transport

    init(baseURL: URL, transport: Transport? = nil) {
        self.baseURL = baseURL
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

    // MARK: Plumbing

    private func get(_ path: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.setValue("application/json", forHTTPHeaderField: "Accept")
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

    private func send<T: Decodable>(_ request: URLRequest) async throws(APIError) -> T {
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
