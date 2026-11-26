import Foundation

// MARK: Hello World

/// GET /api/health
struct Health: Codable, Sendable, Equatable {
    let status: String
    let database: String
    /// The server's version (prod/shared/version.json); missing from servers before 0.4.1.
    var version: String?

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

// MARK: Accounts and sessions

/// GET /api/v1/me
struct Account: Codable, Sendable, Equatable, Identifiable {
    let id: UUID
    let username: String
    let email: String
    let name: String
    let createdAt: Date
}

/// POST /api/v1/auth/signin
struct SignInRequest: Codable, Sendable, Equatable {
    let login: String
    let password: String
    var client = "ios"
    let deviceName: String
}

/// POST /api/v1/auth/signup
struct SignUpRequest: Codable, Sendable, Equatable {
    let name: String
    let username: String
    let email: String
    let password: String
    var client = "ios"
    let deviceName: String
}

/// The answer to sign-in and sign-up. Apps get a token; keep it in the Keychain.
struct SignedIn: Codable, Sendable, Equatable {
    let account: Account
    let token: String?
}

/// GET /api/v1/me/sessions: one signed-in device.
struct DeviceSession: Codable, Sendable, Equatable, Identifiable {
    let id: UUID
    let client: String
    let deviceName: String
    let createdAt: Date
    let lastUsedAt: Date
    let current: Bool
}

/// The rules the server applies (app/accounts/rules.py), checked here first
/// so mistakes show before sending.
enum AccountRules {
    static let minPasswordLength = 8

    static func usernameProblem(_ username: String) -> String? {
        let ok = username.wholeMatch(of: /[a-z0-9_.]{3,20}/) != nil
        return ok ? nil : "Use 3–20 lowercase letters, numbers, dots, or underscores."
    }

    static func passwordProblem(_ password: String) -> String? {
        password.count < minPasswordLength ? "Use at least \(minPasswordLength) characters." : nil
    }
}
