import SwiftUI

/// Sign in, or create an account. Matches the web's sign-in screen.
struct AuthView: View {
    enum Mode: String, CaseIterable, Identifiable {
        case signIn = "Sign in"
        case signUp = "Create account"
        var id: Self { self }
    }

    let session: SessionModel
    @State private var mode: Mode = .signIn
    @State private var name = ""
    @State private var username = ""
    @State private var email = ""
    @State private var login = ""
    @State private var password = ""
    @State private var error: String?
    @State private var isSending = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("", selection: $mode) {
                        ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                } footer: {
                    Text("Groups, homepages, and shared tools for the people you organize with.")
                }

                switch mode {
                case .signIn: signInFields
                case .signUp: signUpFields
                }

                Section {
                    Button(action: send) {
                        HStack {
                            Text(mode.rawValue)
                            if isSending {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(isSending || !canSend)
                } footer: {
                    if let error {
                        Text(error).foregroundStyle(.red)
                    }
                }

                Section {
                } footer: {
                    Text(AppConfig.versionText)
                        .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle(mode == .signIn ? "Sign in to 3den" : "Join 3den")
            .onChange(of: mode) { error = nil }
        }
    }

    private var signInFields: some View {
        Section {
            TextField("Username or email", text: $login)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
            SecureField("Password", text: $password)
                .textContentType(.password)
                .onSubmit(send)
        }
    }

    private var signUpFields: some View {
        Section {
            TextField("Your name", text: $name)
                .textContentType(.name)
            TextField("Username", text: $username)
                .textContentType(.username)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.emailAddress)
            SecureField("Password", text: $password)
                .textContentType(.newPassword)
                .onSubmit(send)
        } footer: {
            Text("People will mention you as @username. Passwords need at least \(AccountRules.minPasswordLength) characters.")
        }
    }

    private var canSend: Bool {
        switch mode {
        case .signIn: !login.isEmpty && !password.isEmpty
        case .signUp: !name.isEmpty && !username.isEmpty && !email.isEmpty && !password.isEmpty
        }
    }

    /// Checked here first, so the obvious mistakes show without a round trip.
    private var localProblem: String? {
        guard mode == .signUp else { return nil }
        return AccountRules.usernameProblem(username.trimmingCharacters(in: .whitespaces).lowercased())
            ?? AccountRules.passwordProblem(password)
    }

    private func send() {
        guard canSend, !isSending else { return }
        if let localProblem {
            error = localProblem
            return
        }
        isSending = true
        error = nil
        Task {
            defer { isSending = false }
            do {
                switch mode {
                case .signIn:
                    try await session.signIn(login: login, password: password)
                case .signUp:
                    try await session.signUp(name: name, username: username, email: email, password: password)
                }
                password = ""
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
