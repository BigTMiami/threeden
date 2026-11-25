import SwiftUI

struct HelloView: View {
    @Bindable var model: HelloModel
    @FocusState private var draftFocused: Bool

    var body: some View {
        NavigationStack {
            List {
                statusSection
                greetingsSection
                addSection
            }
            .navigationTitle("3den")
            .refreshable { await model.load() }
            .task { await model.load() }
        }
    }

    private var statusSection: some View {
        Section {
            StatusRow(label: "Server", status: model.server,
                      okText: "Running", downText: "Not reachable")
            StatusRow(label: "Database", status: model.database,
                      okText: "Connected", downText: "Unavailable")
        } header: {
            Text("Status")
        } footer: {
            Text(model.serverAddress)
        }
    }

    private var greetingsSection: some View {
        Section {
            if let error = model.loadError {
                Label(error, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(.red)
            } else if model.greetings.isEmpty {
                Text("No greetings yet. Add the first one.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(model.greetings) { greeting in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(greeting.message)
                        Text(greeting.createdAt, format: .dateTime.month().day().hour().minute())
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        } header: {
            Text("Greetings (\(model.count))")
        } footer: {
            Text("The latest five. Pull down to refresh.")
        }
    }

    private var addSection: some View {
        Section {
            TextField("Say hello", text: $model.draft, axis: .vertical)
                .lineLimit(1...4)
                .focused($draftFocused)
                .submitLabel(.send)
                .onSubmit(send)
            Button(action: send) {
                HStack {
                    Text("Add")
                    if model.isAdding {
                        Spacer()
                        ProgressView()
                    }
                }
            }
            .disabled(!model.canAdd)
        } header: {
            Text("Add one")
        } footer: {
            VStack(alignment: .leading, spacing: 4) {
                Text("\(model.trimmedDraft.count)/\(NewGreeting.maxLength)")
                    .foregroundStyle(model.trimmedDraft.count > NewGreeting.maxLength ? .red : .secondary)
                if let error = model.addError {
                    Text(error).foregroundStyle(.red)
                }
            }
        }
    }

    private func send() {
        Task {
            if await model.add() { draftFocused = false }
        }
    }
}

private struct StatusRow: View {
    let label: String
    let status: HelloModel.Status
    let okText: String
    let downText: String

    var body: some View {
        LabeledContent(label) {
            HStack(spacing: 6) {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(text)
            }
        }
    }

    private var color: Color {
        switch status {
        case .checking, .unknown: .gray
        case .ok: .green
        case .down: .red
        }
    }

    private var text: String {
        switch status {
        case .checking: "Checking…"
        case .ok: okText
        case .down: downText
        case .unknown: "Unknown"
        }
    }
}

#Preview {
    HelloView(model: HelloModel(api: APIClient(baseURL: URL(string: "http://localhost:8080")!)))
}
