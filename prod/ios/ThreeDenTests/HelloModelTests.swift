import Foundation
import Testing
@testable import ThreeDen

/// Answers by path, so health and hello can differ in one test.
private func client(_ routes: [String: (Int, String)], failAll: URLError? = nil) -> APIClient {
    APIClient(baseURL: URL(string: "http://test.local:8080")!) { request in
        if let failAll { throw failAll }
        let (status, body) = routes[request.url!.path()] ?? (404, #"{"detail":"Not Found"}"#)
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (Data(body.utf8), response)
    }
}

private let healthy = (200, #"{"status":"ok","database":"ok"}"#)
private let oneGreeting = (200, #"{"count":1,"latest":[{"id":1,"message":"Hi","created_at":"2026-11-24T14:57:16Z"}]}"#)

@MainActor
@Suite("Hello screen")
struct HelloModelTests {
    @Test func loadsStatusAndGreetings() async {
        let model = HelloModel(api: client(["/api/health": healthy, "/api/v1/hello": oneGreeting]))
        await model.load()
        #expect(model.server == .ok)
        #expect(model.database == .ok)
        #expect(model.count == 1)
        #expect(model.greetings.map(\.message) == ["Hi"])
        #expect(model.loadError == nil)
    }

    @Test func databaseDown() async {
        let model = HelloModel(api: client([
            "/api/health": (503, #"{"status":"degraded","database":"unavailable"}"#),
            "/api/v1/hello": (500, "Internal Server Error"),
        ]))
        await model.load()
        #expect(model.server == .ok)
        #expect(model.database == .down)
        #expect(model.loadError != nil)
    }

    @Test func serverUnreachable() async {
        let model = HelloModel(api: client([:], failAll: URLError(.cannotConnectToHost)))
        await model.load()
        #expect(model.server == .down)
        #expect(model.database == .unknown)
        #expect(model.loadError == "Couldn't reach the server.")
    }

    @Test func canAddOnlyValidDrafts() {
        let model = HelloModel(api: client([:]))
        #expect(!model.canAdd)
        model.draft = "   "
        #expect(!model.canAdd)
        model.draft = "  Hello  "
        #expect(model.canAdd)
        model.draft = String(repeating: "x", count: 201)
        #expect(!model.canAdd)
        model.draft = String(repeating: "x", count: 200)
        #expect(model.canAdd)
    }

    @Test func addKeepsTheDraftWhenTheAnswerIsWrong() async {
        // The fake answers POST with the list body, which doesn't decode as a Greeting:
        // the model must report it, not crash, and keep the draft.
        let model = HelloModel(api: client(["/api/v1/hello": oneGreeting]))
        model.draft = "Hi"
        let added = await model.add()
        #expect(!added)
        #expect(model.draft == "Hi")
        #expect(model.addError != nil)
    }

    @Test func addSuccess() async {
        let greeting = #"{"id":2,"message":"Hello","created_at":"2026-11-24T15:00:00Z"}"#
        let api = APIClient(baseURL: URL(string: "http://test.local:8080")!) { request in
            let body = request.httpMethod == "POST"
                ? greeting
                : #"{"count":2,"latest":[\#(greeting)]}"#
            let status = request.httpMethod == "POST" ? 201 : 200
            return (Data(body.utf8), HTTPURLResponse(
                url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
        let model = HelloModel(api: api)
        model.draft = "  Hello  "
        #expect(await model.add())
        #expect(model.draft.isEmpty)
        #expect(model.addError == nil)
        #expect(model.count == 2)
    }
}
