import Foundation
import Testing
@testable import ThreeDen

/// A fake server: answers every request with the given status and body,
/// and remembers the last request so tests can check it.
private final class FakeServer: @unchecked Sendable {
    private let lock = NSLock()
    private var _lastRequest: URLRequest?
    var lastRequest: URLRequest? { lock.withLock { _lastRequest } }

    let status: Int
    let body: String
    let failure: URLError?

    init(status: Int = 200, body: String = "{}", failure: URLError? = nil) {
        self.status = status
        self.body = body
        self.failure = failure
    }

    var client: APIClient {
        APIClient(baseURL: URL(string: "http://test.local:8080")!) { [self] request in
            lock.withLock { _lastRequest = request }
            if let failure { throw failure }
            let response = HTTPURLResponse(
                url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            return (Data(body.utf8), response)
        }
    }
}

@Suite("Decoding")
struct DecodingTests {
    @Test func helloResponseWithMicroseconds() async throws {
        // Exactly what FastAPI sends.
        let server = FakeServer(body: """
            {"count":7,"latest":[
              {"id":7,"message":"Hello from the phone","created_at":"2026-11-24T14:57:16.048390Z"},
              {"id":6,"message":"Hi","created_at":"2026-11-24T14:50:00Z"}
            ]}
            """)
        let hello = try await server.client.hello()

        #expect(hello.count == 7)
        #expect(hello.latest.map(\.id) == [7, 6])
        #expect(hello.latest[0].message == "Hello from the phone")

        let expected = try Date.ISO8601FormatStyle(includingFractionalSeconds: true)
            .parse("2026-11-24T14:57:16.048Z")
        #expect(abs(hello.latest[0].createdAt.timeIntervalSince(expected)) < 0.001)
        #expect(hello.latest[1].createdAt == (try Date.ISO8601FormatStyle().parse("2026-11-24T14:50:00Z")))
    }

    @Test func emptyHello() async throws {
        let hello = try await FakeServer(body: #"{"count":0,"latest":[]}"#).client.hello()
        #expect(hello == HelloResponse(count: 0, latest: []))
    }

    @Test func health() async throws {
        let health = try await FakeServer(body: #"{"status":"ok","database":"ok"}"#).client.health()
        #expect(health.databaseOK)
    }

    @Test(arguments: [
        "2026-11-24T14:57:16.048390Z",
        "2026-11-24T14:57:16.048Z",
        "2026-11-24T14:57:16Z",
        "2026-11-24T14:57:16.048390+00:00",
    ])
    func parsesPythonDates(_ text: String) {
        #expect(APIClient.parseISO8601(text) != nil)
    }

    @Test func refusesNonDates() {
        #expect(APIClient.parseISO8601("yesterday") == nil)
    }
}

@Suite("Requests")
struct RequestTests {
    @Test func addGreetingPostsJSON() async throws {
        let server = FakeServer(
            status: 201,
            body: #"{"id":1,"message":"Hello","created_at":"2026-11-24T14:57:16.048390Z"}"#)
        let greeting = try await server.client.addGreeting("Hello")
        #expect(greeting.id == 1)

        let request = try #require(server.lastRequest)
        #expect(request.httpMethod == "POST")
        #expect(request.url?.absoluteString == "http://test.local:8080/api/v1/hello")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        let sent = try JSONDecoder().decode([String: String].self, from: try #require(request.httpBody))
        #expect(sent == ["message": "Hello"])
    }

    @Test func healthPath() async throws {
        let server = FakeServer(body: #"{"status":"ok","database":"ok"}"#)
        _ = try await server.client.health()
        #expect(server.lastRequest?.url?.path() == "/api/health")
    }
}

@Suite("Errors")
struct ErrorTests {
    @Test func tooLongIsAnHTTP422WithFastAPIsMessage() async {
        let server = FakeServer(status: 422, body: """
            {"detail":[{"type":"string_too_long","loc":["body","message"],
              "msg":"String should have at most 200 characters"}]}
            """)
        await #expect(throws: APIError.http(status: 422, detail: "String should have at most 200 characters")) {
            try await server.client.addGreeting(String(repeating: "x", count: 201))
        }
    }

    @Test func serverErrorWithoutJSON() async {
        let server = FakeServer(status: 502, body: "Bad Gateway")
        await #expect(throws: APIError.http(status: 502, detail: nil)) {
            try await server.client.hello()
        }
    }

    @Test func databaseDownIs503() async {
        let server = FakeServer(status: 503, body: #"{"status":"degraded","database":"unavailable"}"#)
        await #expect(throws: APIError.http(status: 503, detail: nil)) {
            try await server.client.health()
        }
    }

    @Test func offline() async {
        let server = FakeServer(failure: URLError(.cannotConnectToHost))
        await #expect(throws: APIError.network(.cannotConnectToHost)) {
            try await server.client.hello()
        }
    }

    @Test func unexpectedJSON() async {
        let server = FakeServer(body: #"{"greetings":[]}"#)
        await #expect {
            try await server.client.hello()
        } throws: { error in
            if case .decoding = error as? APIError { return true }
            return false
        }
    }

    @Test func messagesForPeople() {
        #expect(APIError.http(status: 422, detail: "x").localizedDescription
            == "A greeting needs 1 to 200 characters.")
        #expect(APIError.network(.cannotConnectToHost).localizedDescription
            == "Couldn't reach the server.")
    }
}
