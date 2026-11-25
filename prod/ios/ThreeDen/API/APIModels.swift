import Foundation

/// GET /api/health
struct Health: Codable, Sendable, Equatable {
    let status: String
    let database: String

    var databaseOK: Bool { database == "ok" }
}

/// One greeting, as returned by the hello endpoints.
struct Greeting: Codable, Sendable, Equatable, Identifiable {
    let id: Int
    let message: String
    let createdAt: Date
}

/// GET /api/v1/hello
struct HelloResponse: Codable, Sendable, Equatable {
    let count: Int
    let latest: [Greeting]
}

/// POST /api/v1/hello
struct NewGreeting: Codable, Sendable, Equatable {
    static let maxLength = 200
    let message: String
}
