import Foundation
import Security

/// The session token, kept in the Keychain (this device only, readable after
/// the first unlock) and cached in memory for each request.
final class TokenStore: @unchecked Sendable {
    private let lock = NSLock()
    private var cached: String?
    private let keychain: Keychain?

    /// `keychain: nil` keeps the token in memory only (tests and previews).
    init(keychain: Keychain? = Keychain()) {
        self.keychain = keychain
        self.cached = keychain?.read()
    }

    var token: String? { lock.withLock { cached } }

    func set(_ token: String?) {
        lock.withLock { cached = token }
        if let token { keychain?.save(token) } else { keychain?.delete() }
    }
}

/// One generic-password Keychain item.
struct Keychain: Sendable {
    var service = "com.threeden.session"
    var account = "token"

    private var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    func read() -> String? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    func save(_ value: String) -> Bool {
        let data = Data(value.utf8)
        let update: [String: Any] = [kSecValueData as String: data]
        if SecItemUpdate(query as CFDictionary, update as CFDictionary) == errSecSuccess {
            return true
        }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
    }

    func delete() {
        SecItemDelete(query as CFDictionary)
    }
}
