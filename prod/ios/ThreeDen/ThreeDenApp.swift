import SwiftUI

@main
struct ThreeDenApp: App {
    @State private var session: SessionModel
    @State private var hello: HelloModel
    private let events: EventsAPI

    init() {
        let tokens = TokenStore()
        #if DEBUG
        // Development only: start signed in with a token from the launch
        // environment (`SIMCTL_CHILD_THREEDEN_DEV_TOKEN=… xcrun simctl launch …`),
        // for looking at screens from the command line.
        if let token = ProcessInfo.processInfo.environment["THREEDEN_DEV_TOKEN"], !token.isEmpty {
            tokens.set(token)
        }
        #endif
        let api = APIClient(baseURL: AppConfig.apiBaseURL, tokens: tokens)
        _session = State(initialValue: SessionModel(api: api))
        _hello = State(initialValue: HelloModel(api: api))
        events = EventsAPI(api: api)
    }

    var body: some Scene {
        WindowGroup {
            RootView(session: session, hello: hello, events: events)
                .tint(.threeDenAccent)
        }
    }
}

/// Signed in: the app. Signed out: the sign-in screen.
struct RootView: View {
    let session: SessionModel
    let hello: HelloModel
    let events: EventsAPI

    var body: some View {
        Group {
            switch session.state {
            case .checking:
                ProgressView("Checking your sign-in…")
            case .signedOut:
                AuthView(session: session)
            case .signedIn(let account):
                MainTabs(session: session, account: account, hello: hello, events: events)
                    // A new person signed in: start their tabs afresh.
                    .id(account.id)
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

/// The tab bar, as in the prototype's phone layout: Coming up (events in all
/// your groups, with RSVP buttons), Groups (each group's events), and Me.
struct MainTabs: View {
    let session: SessionModel
    let account: Account
    let hello: HelloModel
    @State private var groups: GroupsModel
    @State private var upcoming: UpcomingModel

    init(session: SessionModel, account: Account, hello: HelloModel, events: EventsAPI) {
        self.session = session
        self.account = account
        self.hello = hello
        _groups = State(initialValue: GroupsModel(api: events) { error in session.handle(error) })
        _upcoming = State(initialValue: UpcomingModel(api: events) { error in session.handle(error) })
    }

    var body: some View {
        TabView {
            Tab("Coming up", systemImage: "calendar") {
                UpcomingView(model: upcoming)
            }
            Tab("Groups", systemImage: "person.3") {
                NavigationStack { GroupsView(model: groups) }
            }
            Tab("Me", systemImage: "person.crop.circle") {
                NavigationStack { MeView(session: session, account: account, hello: hello) }
            }
        }
    }
}

extension Color {
    /// The prototype's --color-accent (#3366cc).
    static let threeDenAccent = Color(red: 0x33 / 255, green: 0x66 / 255, blue: 0xCC / 255)
}
