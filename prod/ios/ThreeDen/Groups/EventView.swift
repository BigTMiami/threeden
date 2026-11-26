import SwiftUI

/// An event's page, after the prototype's: the title and when, "Are you
/// going?" with the three buttons, where, who's hosting, about, and guests.
struct EventScreen: View {
    @State private var model: EventModel

    init(event: Event, api: EventsAPI, onError: @escaping @MainActor (APIError) -> Void, onChange: @escaping @MainActor (Event) -> Void) {
        _model = State(initialValue: EventModel(event: event, api: api, onError: onError, onChange: onChange))
    }

    var body: some View {
        EventView(model: model)
            .task { await model.refresh() }
            .refreshable { await model.refresh() }
    }
}

struct EventView: View {
    let model: EventModel
    private var event: Event { model.event }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(event.title).font(.title2.bold())
                    Text(event.whenText).foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
            }

            Section("Are you going?") {
                RsvpButtons(event: event, disabled: model.sending) { answer in
                    Task { await model.answer(answer) }
                }
                if let message = model.message {
                    Label(message, systemImage: "exclamationmark.circle")
                        .foregroundStyle(.red)
                        .font(.subheadline)
                }
            }

            Section {
                if !event.location.isEmpty {
                    Label(event.location, systemImage: "mappin.and.ellipse")
                }
                if let host = event.host {
                    Label("Hosted by \(host.name)", systemImage: "person")
                }
                Label("From \(event.space.name)", systemImage: "calendar")
                Label(visibilityText, systemImage: event.visibility.rawValue == "public" ? "globe" : "lock")
            }

            if !event.notes.isEmpty {
                Section("About") { Text(event.notes) }
            }

            Section("Guests") {
                let rows = Answer.allCases.map { ($0, event.people(answering: $0)) }.filter { !$0.1.isEmpty }
                if rows.isEmpty {
                    Text("No one has answered yet. Be the first!").foregroundStyle(.secondary)
                }
                ForEach(rows, id: \.0) { answer, people in
                    LabeledContent(answer == .no ? "Can’t go" : answer.label) {
                        Text(people.map { $0.name.split(separator: " ").first.map(String.init) ?? $0.name }
                            .joined(separator: ", "))
                    }
                }
            }
        }
        .navigationTitle(event.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var visibilityText: String {
        switch event.visibility.rawValue {
        case "public": "Public: anyone can see it"
        case "invite": "Invite only"
        default: "\(event.space.name) members"
        }
    }
}

/// 👍 Going · 3   🤔 Maybe · 1   😢 Can’t go · 0. Your answer is filled in;
/// tapping it again takes it back.
struct RsvpButtons: View {
    let event: Event
    var disabled = false
    let onAnswer: (Answer) -> Void

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Answer.allCases, id: \.self) { answer in
                let mine = event.myAnswer == answer
                Button {
                    onAnswer(answer)
                } label: {
                    Text("\(answer.emoji) \(answer.label) · \(event.count(answer))")
                        .font(.subheadline)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(RsvpButtonStyle(mine: mine))
                .accessibilityAddTraits(mine ? .isSelected : [])
                .accessibilityHint(mine ? "Tap again to take back your answer" : "")
            }
        }
        .disabled(disabled)
        .padding(.vertical, 4)
    }
}

private struct RsvpButtonStyle: ButtonStyle {
    let mine: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.vertical, 8)
            .padding(.horizontal, 6)
            .foregroundStyle(mine ? Color.white : Color.primary)
            .background(mine ? Color.threeDenAccent : Color.clear, in: Capsule())
            .overlay(Capsule().strokeBorder(mine ? Color.threeDenAccent : Color.secondary.opacity(0.4)))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
