import Foundation
import Observation
import UIKit

/// Who's signed in on this device. The token lives in the Keychain
/// (TokenStore); the server can revoke it at any time, and a 401 from any
/// call signs out here.
@MainActor
@Observable
final class SessionModel {
    enum State: Equatable {
        case checking
        case signedOut
        case signedIn(Account)
        /// Has a token, but couldn't reach the server to check it.
        case unreachable(String)
    }

    private(set) var state: State = .checking
    private(set) var devices: [DeviceSession] = []
    private(set) var devicesError: String?

    let api: APIClient
    private let deviceName: String

    init(api: APIClient, deviceName: String = SessionModel.defaultDeviceName) {
        self.api = api
        self.deviceName = deviceName
    }

    /// "iPhone (3den app)". (iOS doesn't tell apps the name you gave your phone.)
    static var defaultDeviceName: String { "\(UIDevice.current.model) (3den app)" }

    var account: Account? {
        if case .signedIn(let account) = state { return account }
        return nil
    }

    /// On launch: check the saved token with the server.
    func restore() async {
        guard api.tokens.token != nil else {
            state = .signedOut
            return
        }
        state = .checking
        do {
            state = .signedIn(try await api.me())
        } catch let error where error.isUnauthorized {
            endLocally()
        } catch {
            state = .unreachable(error.localizedDescription)
        }
    }

    /// Throws APIError with the server's message (wrong password, too many tries…).
    func signIn(login: String, password: String) async throws(APIError) {
        let request = SignInRequest(
            login: login.trimmingCharacters(in: .whitespaces), password: password,
            deviceName: deviceName)
        start(try await api.signIn(request))
    }

    func signUp(name: String, username: String, email: String, password: String) async throws(APIError) {
        let request = SignUpRequest(
            name: name.trimmingCharacters(in: .whitespaces),
            username: username.trimmingCharacters(in: .whitespaces).lowercased(),
            email: email.trimmingCharacters(in: .whitespaces),
            password: password, deviceName: deviceName)
        start(try await api.signUp(request))
    }

    /// Signs out here at once, and tells the server (if it can be reached).
    func signOut() async {
        try? await api.signOut()
        endLocally()
    }

    func loadDevices() async {
        do {
            devices = try await api.sessions()
            devicesError = nil
        } catch {
            handle(error)
            devicesError = error.localizedDescription
        }
    }

    func signOutDevice(_ device: DeviceSession) async {
        do {
            try await api.deleteSession(device.id)
            if device.current {
                endLocally()
            } else {
                devices.removeAll { $0.id == device.id }
            }
        } catch {
            handle(error)
            devicesError = error.localizedDescription
        }
    }

    /// Any call that got 401: this device's session has ended (signed out elsewhere).
    func handle(_ error: APIError) {
        if error.isUnauthorized { endLocally() }
    }

    private func start(_ signedIn: SignedIn) {
        api.tokens.set(signedIn.token)
        state = signedIn.token == nil ? .signedOut : .signedIn(signedIn.account)
    }

    private func endLocally() {
        api.tokens.set(nil)
        devices = []
        state = .signedOut
    }
}
