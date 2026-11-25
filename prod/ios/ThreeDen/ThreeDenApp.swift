import SwiftUI

@main
struct ThreeDenApp: App {
    @State private var hello = HelloModel(api: APIClient(baseURL: AppConfig.apiBaseURL))

    var body: some Scene {
        WindowGroup {
            HelloView(model: hello)
                .tint(.threeDenAccent)
        }
    }
}

extension Color {
    /// The prototype's --color-accent (#3366cc).
    static let threeDenAccent = Color(red: 0x33 / 255, green: 0x66 / 255, blue: 0xCC / 255)
}
