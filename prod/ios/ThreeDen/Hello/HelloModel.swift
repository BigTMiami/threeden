import Foundation
import Observation

/// The Hello screen's state: server and database status, greetings, and the add form.
@MainActor
@Observable
final class HelloModel {
    enum Status: Equatable {
        case checking
        case ok
        case down
        case unknown
    }

    private(set) var server: Status = .checking
    private(set) var database: Status = .checking
    private(set) var count = 0
    private(set) var greetings: [Greeting] = []
    private(set) var loadError: String?
    private(set) var addError: String?
    private(set) var isAdding = false
    var draft = ""

    private let api: APIClient

    init(api: APIClient) {
        self.api = api
    }

    var serverAddress: String { api.baseURL.absoluteString }

    var trimmedDraft: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

    var canAdd: Bool {
        !isAdding && !trimmedDraft.isEmpty && trimmedDraft.count <= NewGreeting.maxLength
    }

    /// Checks health and loads the greetings. Used on appear and on pull to refresh.
    func load() async {
        async let health = checkHealth()
        async let list = loadGreetings()
        _ = await (health, list)
    }

    private func checkHealth() async {
        do {
            let health = try await api.health()
            server = .ok
            database = health.databaseOK ? .ok : .down
        } catch .http(503, _) {
            // The API is up and answered, but can't reach the database.
            server = .ok
            database = .down
        } catch {
            server = .down
            database = .unknown
        }
    }

    private func loadGreetings() async {
        do {
            let hello = try await api.hello()
            count = hello.count
            greetings = hello.latest
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    /// Sends the draft. Returns true if it was added.
    @discardableResult
    func add() async -> Bool {
        guard canAdd else { return false }
        isAdding = true
        addError = nil
        defer { isAdding = false }
        do {
            _ = try await api.addGreeting(trimmedDraft)
            draft = ""
            await loadGreetings()
            return true
        } catch {
            addError = error.localizedDescription
            return false
        }
    }
}
