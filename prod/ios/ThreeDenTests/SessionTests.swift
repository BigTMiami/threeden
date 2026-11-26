import Foundation
import Testing
@testable import ThreeDen

/// A fake 3den server for sign-in: one account, one valid token, and a log
/// of what was asked.
private final class FakeAuthServer: @unchecked Sendable {
    private let lock = NSLock()
    private var _requests: [URLRequest] = []
    var requests: [URLRequest] { lock.withLock { _requests } }

    var validToken = "good-token"
    var reachable = true

    static let account = #"""
        {"id":"0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b","username":"rosa.parks",
         "email":"rosa@example.com","name":"Rosa Parks","created_at":"2026-11-25T10:00:00.123456Z"}
        """#

    func client(tokens: TokenStore = TokenStore(keychain: nil)) -> APIClient {
        APIClient(baseURL: URL(string: "http://test.local:8080")!, tokens: tokens) { [self] request in
            lock.withLock { _requests.append(request) }
            guard reachable else { throw URLError(.cannotConnectToHost) }
            let (status, body) = answer(request)
            let response = HTTPURLResponse(
                url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            return (Data(body.utf8), response)
        }
    }

    private func answer(_ request: URLRequest) -> (Int, String) {
        let path = request.url!.path()
        let signedIn = request.value(forHTTPHeaderField: "Authorization") == "Bearer \(validToken)"
        switch (request.httpMethod ?? "GET", path) {
        case ("POST", "/api/v1/auth/signin"):
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            if body["password"] as? String == "correct horse battery" {
                return (200, #"{"account":\#(Self.account),"token":"\#(validToken)"}"#)
            }
            return (401, #"{"detail":"That username or email and password don’t match."}"#)
        case ("POST", "/api/v1/auth/signup"):
            return (409, #"{"detail":"@rosa.parks is taken."}"#)
        case ("POST", "/api/v1/auth/signout"):
            return (204, "")
        case ("GET", "/api/v1/me"):
            return signedIn ? (200, Self.account) : (401, #"{"detail":"Please sign in."}"#)
        case ("GET", "/api/v1/me/sessions"):
            guard signedIn else { return (401, #"{"detail":"Please sign in."}"#) }
            return (200, """
                [{"id":"0193a1b2-0000-7000-8000-000000000001","client":"ios","device_name":"iPhone (3den app)",
                  "created_at":"2026-11-25T10:00:00Z","last_used_at":"2026-11-25T10:05:00Z","current":true},
                 {"id":"0193a1b2-0000-7000-8000-000000000002","client":"web","device_name":"Safari on Mac",
                  "created_at":"2026-11-24T09:00:00Z","last_used_at":"2026-11-24T09:30:00Z","current":false}]
                """)
        case ("DELETE", _) where path.hasPrefix("/api/v1/me/sessions/"):
            return signedIn ? (204, "") : (401, #"{"detail":"Please sign in."}"#)
        default:
            return (404, #"{"detail":"Not Found"}"#)
        }
    }
}

@MainActor
@Suite("Signing in")
struct SessionTests {
    @Test func signInKeepsTheTokenAndSendsIt() async throws {
        let server = FakeAuthServer()
        let tokens = TokenStore(keychain: nil)
        let session = SessionModel(api: server.client(tokens: tokens), deviceName: "Test iPhone")

        try await session.signIn(login: " rosa.parks ", password: "correct horse battery")

        #expect(session.account?.username == "rosa.parks")
        #expect(tokens.token == "good-token")

        // What was sent: an app sign-in, with this device's name.
        let sent = try JSONSerialization.jsonObject(
            with: try #require(server.requests.last?.httpBody)) as! [String: String]
        #expect(sent["login"] == "rosa.parks")
        #expect(sent["client"] == "ios")
        #expect(sent["device_name"] == "Test iPhone")

        // Later calls carry the token.
        await session.loadDevices()
        #expect(server.requests.last?.value(forHTTPHeaderField: "Authorization") == "Bearer good-token")
        #expect(session.devices.map(\.deviceName) == ["iPhone (3den app)", "Safari on Mac"])
        #expect(session.devices.first?.current == true)
    }

    @Test func wrongPasswordShowsTheServersMessage() async {
        let session = SessionModel(api: FakeAuthServer().client())
        await #expect {
            try await session.signIn(login: "rosa.parks", password: "nope nope")
        } throws: { error in
            (error as? APIError)?.localizedDescription == "That username or email and password don’t match."
        }
        #expect(session.account == nil)
    }

    @Test func takenUsernameShowsTheServersMessage() async {
        let session = SessionModel(api: FakeAuthServer().client())
        await #expect(throws: APIError.http(status: 409, detail: "@rosa.parks is taken.")) {
            try await session.signUp(name: "Rosa", username: "rosa.parks", email: "r@example.com",
                                     password: "correct horse battery")
        }
    }

    @Test func restoreWithAGoodToken() async {
        let tokens = TokenStore(keychain: nil)
        tokens.set("good-token")
        let session = SessionModel(api: FakeAuthServer().client(tokens: tokens))
        await session.restore()
        #expect(session.account?.name == "Rosa Parks")
    }

    @Test func restoreWithARevokedTokenSignsOut() async {
        let tokens = TokenStore(keychain: nil)
        tokens.set("revoked-token")
        let session = SessionModel(api: FakeAuthServer().client(tokens: tokens))
        await session.restore()
        #expect(session.state == .signedOut)
        #expect(tokens.token == nil)
    }

    @Test func restoreWithoutATokenNeedsNoServer() async {
        let server = FakeAuthServer()
        let session = SessionModel(api: server.client())
        await session.restore()
        #expect(session.state == .signedOut)
        #expect(server.requests.isEmpty)
    }

    @Test func restoreOfflineKeepsTheToken() async {
        let server = FakeAuthServer()
        server.reachable = false
        let tokens = TokenStore(keychain: nil)
        tokens.set("good-token")
        let session = SessionModel(api: server.client(tokens: tokens))
        await session.restore()
        #expect(session.state == .unreachable("Couldn't reach the server."))
        #expect(tokens.token == "good-token") // not thrown away just for being offline
    }

    @Test func signOutForgetsTheTokenEvenOffline() async throws {
        let server = FakeAuthServer()
        let tokens = TokenStore(keychain: nil)
        let session = SessionModel(api: server.client(tokens: tokens))
        try await session.signIn(login: "rosa.parks", password: "correct horse battery")

        server.reachable = false
        await session.signOut()
        #expect(session.state == .signedOut)
        #expect(tokens.token == nil)
    }

    @Test func signedOutElsewhereIsNoticed() async throws {
        let server = FakeAuthServer()
        let session = SessionModel(api: server.client())
        try await session.signIn(login: "rosa.parks", password: "correct horse battery")

        server.validToken = "a-different-token" // the web signed this phone out
        await session.loadDevices()
        #expect(session.state == .signedOut)
    }

    @Test func signingOutAnotherDeviceRemovesIt() async throws {
        let server = FakeAuthServer()
        let session = SessionModel(api: server.client())
        try await session.signIn(login: "rosa.parks", password: "correct horse battery")
        await session.loadDevices()

        let web = try #require(session.devices.first { !$0.current })
        await session.signOutDevice(web)
        #expect(session.devices.map(\.deviceName) == ["iPhone (3den app)"])
        #expect(server.requests.last?.httpMethod == "DELETE")
        #expect(server.requests.last?.url?.path() == "/api/v1/me/sessions/0193a1b2-0000-7000-8000-000000000002")
        #expect(session.account != nil)
    }

    @Test func localRulesMatchTheServers() {
        #expect(AccountRules.usernameProblem("rosa.parks") == nil)
        #expect(AccountRules.usernameProblem("ro") != nil)
        #expect(AccountRules.usernameProblem("Rosa") != nil)
        #expect(AccountRules.passwordProblem("1234567") != nil)
        #expect(AccountRules.passwordProblem("12345678") == nil)
    }
}

@Suite("Keychain", .serialized)
struct KeychainTests {
    private let keychain = Keychain(service: "com.threeden.tests", account: "token")

    @Test func roundTrip() {
        keychain.delete()
        #expect(keychain.read() == nil)
        #expect(keychain.save("first"))
        #expect(keychain.read() == "first")
        #expect(keychain.save("second")) // replaces
        #expect(keychain.read() == "second")
        keychain.delete()
        #expect(keychain.read() == nil)
    }

    @Test func tokenStoreReadsWhatWasSaved() {
        keychain.delete()
        TokenStore(keychain: keychain).set("kept")
        #expect(TokenStore(keychain: keychain).token == "kept")
        TokenStore(keychain: keychain).set(nil)
        #expect(TokenStore(keychain: keychain).token == nil)
    }
}
