import SwiftUI

@main
struct ThreeDenApp: App {
    @State private var session: SessionModel
    @State private var hello: HelloModel

    init() {
        let api = APIClient(baseURL: AppConfig.apiBaseURL, tokens: TokenStore())
        _session = State(initialValue: SessionModel(api: api))
        _hello = State(initialValue: HelloModel(api: api))
    }

    var body: some Scene {
        WindowGroup {
            RootView(session: session, hello: hello)
                .tint(.threeDenAccent)
        }
    }
}

/// Signed in: the app. Signed out: the sign-in screen.
struct RootView: View {
    let session: SessionModel
    let hello: HelloModel

    var body: some View {
        Group {
            switch session.state {
            case .checking:
                ProgressView("Checking your sign-in…")
            case .signedOut:
                AuthView(session: session)
            case .signedIn(let account):
                HelloView(model: hello) {
                    NavigationLink {
                        MeView(session: session, account: account)
                    } label: {
                        Label("Me", systemImage: "person.crop.circle")
                    }
                }
            case .unreachable(let message):
                ContentUnavailableView {
                    Label("Can't reach 3den", systemImage: "wifi.exclamationmark")
                } description: {
                    Text("\(message)\n\(session.api.baseURL.absoluteString)")
                } actions: {
                    Button("Try again") { Task { await session.restore() } }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
        .task { await session.restore() }
    }
}

extension Color {
    /// The prototype's --color-accent (#3366cc).
    static let threeDenAccent = Color(red: 0x33 / 255, green: 0x66 / 255, blue: 0xCC / 255)
}
