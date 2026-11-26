import SwiftUI

/// The Groups tab: your groups. Tap one for its upcoming events.
struct GroupsView: View {
    let model: GroupsModel

    var body: some View {
        List {
            if let error = model.error {
                Text(error).foregroundStyle(.red)
            }
            ForEach(model.spaces, id: \.id) { space in
                NavigationLink(value: space) {
                    GroupRow(space: space)
                }
            }
        }
        .overlay {
            if model.loaded && model.spaces.isEmpty && model.error == nil {
                ContentUnavailableView(
                    "No groups yet", systemImage: "person.3",
                    description: Text("Groups you’re in show up here."))
            }
        }
        .navigationTitle("Groups")
        .navigationDestination(for: Space.self) { space in
            GroupEventsScreen(space: space, api: model.api, onError: model.onError)
        }
        .task { if !model.loaded { await model.load() } }
        .refreshable { await model.load() }
    }
}

private struct GroupRow: View {
    let space: Space

    var body: some View {
        HStack(spacing: 12) {
            Text(String(space.name.prefix(2)).uppercased())
                .font(.headline)
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(Color.threeDenAccent, in: RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 2) {
                Text(space.name).font(.headline)
                HStack(spacing: 4) {
                    Image(systemName: space.visibility.rawValue == "public" ? "globe" : "lock")
                    Text(details)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
    }

    /// "4 members · Owner"
    private var details: String {
        let members = space.memberCount == 1 ? "1 member" : "\(space.memberCount) members"
        switch space.role {
        case .owner: return "\(members) · Owner"
        case .admin: return "\(members) · Admin"
        case .member: return members
        }
    }
}
