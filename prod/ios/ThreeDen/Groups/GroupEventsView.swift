import SwiftUI

/// A group's upcoming events, by day, like the prototype's Upcoming events on
/// a phone. Events open their page; calendar entries ("Rent due") are listed
/// but have no page or RSVPs.
struct GroupEventsScreen: View {
    @State private var model: GroupEventsModel
    private let api: EventsAPI
    private let onError: @MainActor (APIError) -> Void

    init(space: Space, api: EventsAPI, onError: @escaping @MainActor (APIError) -> Void) {
        _model = State(initialValue: GroupEventsModel(space: space, api: api, onError: onError))
        self.api = api
        self.onError = onError
    }

    var body: some View {
        List {
            if let error = model.error {
                Text(error).foregroundStyle(.red)
            }
            ForEach(model.days) { day in
                Section {
                    ForEach(day.events, id: \.id) { event in
                        if event.isEvent {
                            NavigationLink(value: event) { EventRow(event: event) }
                        } else {
                            EventRow(event: event)
                        }
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
                    description: Text("Events in \(model.space.name) for the next two months show up here."))
            }
        }
        .navigationTitle(model.space.name)
        .navigationDestination(for: Event.self) { event in
            EventScreen(event: event, api: api, onError: onError) { model.replace($0) }
        }
        .task { if !model.loaded { await model.load() } }
        .refreshable { await model.load() }
    }
}

private struct EventRow: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline) {
                Text(event.title)
                    .font(event.isEvent ? .headline : .body)
                    .foregroundStyle(event.isEvent ? .primary : .secondary)
                Spacer()
                if let mine = event.myAnswer {
                    Text("\(mine.emoji) \(mine.label)")
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.tint.opacity(0.15), in: Capsule())
                }
            }
            Text(event.location.isEmpty ? event.timeText : "\(event.timeText) · \(event.location)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if event.isEvent {
                Text(summary).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    /// "3 going · 1 maybe"
    private var summary: String {
        var parts = ["\(event.counts.going) going"]
        if event.counts.maybe > 0 { parts.append("\(event.counts.maybe) maybe") }
        if let capacity = event.capacity {
            let left = max(0, capacity - event.counts.going)
            parts.append(left == 0 ? "full" : left == 1 ? "1 spot left" : "\(left) spots left")
        }
        return parts.joined(separator: " · ")
    }
}
