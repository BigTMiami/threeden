import Observation
import SwiftUI

/// What's coming up in all your groups (the first tab), like Up next on the
/// prototype's phone Home: answer right from the list, or open an event.
@MainActor
@Observable
final class UpcomingModel {
    private(set) var events: [Event] = []
    private(set) var error: String?
    /// Why the last answer didn't go through, and for which event.
    private(set) var refused: (eventID: String, message: String)?
    private(set) var sending: Set<String> = []
    private(set) var loaded = false

    let api: EventsAPI
    let onError: @MainActor (APIError) -> Void

    init(api: EventsAPI, onError: @escaping @MainActor (APIError) -> Void = { _ in }) {
        self.api = api
        self.onError = onError
    }

    /// Your groups' events for the next 60 days, soonest first.
    func load() async {
        do {
            let spaces = try await api.mySpaces()
            var all: [Event] = []
            for space in spaces {
                all += try await api.events(in: space.id)
            }
            events = all.sorted { ($0.startsAt, $0.title) < ($1.startsAt, $1.title) }
            error = nil
        } catch {
            onError(error)
            self.error = error.localizedDescription
        }
        loaded = true
    }

    /// Day by day, where each event happens.
    var days: [GroupEventsModel.Day] { GroupEventsModel.days(of: events) }

    func replace(_ event: Event) {
        if let index = events.firstIndex(where: { $0.id == event.id }) { events[index] = event }
    }

    /// As on the event page: shown at once, put back if the server says no.
    func answer(_ event: Event, _ answer: Answer) async {
        guard !sending.contains(event.id) else { return }
        let next: Answer? = event.myAnswer == answer ? nil : answer
        replace(event.answered(next))
        refused = nil
        sending.insert(event.id)
        defer { sending.remove(event.id) }
        do {
            replace(try await api.answer(event.id, next, version: event.version))
        } catch {
            replace(event)
            refused = (event.id, error.localizedDescription)
            onError(error)
            if case .http(409, _) = error, let now = try? await api.event(event.id) { replace(now) }
        }
    }
}

struct UpcomingView: View {
    let model: UpcomingModel
    @State private var path: [Event] = []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                if let error = model.error {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(model.days) { day in
                    Section {
                        ForEach(day.events, id: \.id) { event in
                            row(event)
                        }
                    } header: {
                        Text(day.date.formatted(Date.FormatStyle(date: .complete, time: .omitted, timeZone: day.zone)))
                    }
                }
            }
            .overlay {
                if model.loaded && model.events.isEmpty && model.error == nil {
                    ContentUnavailableView(
                        "Nothing coming up", systemImage: "calendar",
                        description: Text("Events in your groups for the next two months show up here."))
                }
            }
            .navigationTitle("Coming up")
            .navigationDestination(for: Event.self) { event in
                EventScreen(event: event, api: model.api, onError: model.onError) { model.replace($0) }
            }
            .task { if !model.loaded { await model.load() } }
            .refreshable { await model.load() }
        }
    }

    @ViewBuilder
    private func row(_ event: Event) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // The title opens the event's page (a button, so the RSVP buttons below stay separate).
            Button {
                if event.isEvent { path.append(event) }
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(event.title)
                            .font(event.isEvent ? .headline : .body)
                            .foregroundStyle(event.isEvent ? .primary : .secondary)
                        Spacer()
                        if event.isEvent {
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                        }
                    }
                    Text([event.timeText, event.space.name, event.location].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!event.isEvent)

            if event.isEvent {
                RsvpButtons(event: event, disabled: model.sending.contains(event.id)) { answer in
                    Task { await model.answer(event, answer) }
                }
                if let refused = model.refused, refused.eventID == event.id {
                    Label(refused.message, systemImage: "exclamationmark.circle")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
