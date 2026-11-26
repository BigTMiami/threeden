import Foundation
import Observation

/// Your groups (the Groups tab).
@MainActor
@Observable
final class GroupsModel {
    private(set) var spaces: [Space] = []
    private(set) var error: String?
    private(set) var loaded = false

    let api: EventsAPI
    /// Called with any error, so a 401 can sign out (SessionModel.handle).
    let onError: @MainActor (APIError) -> Void

    init(api: EventsAPI, onError: @escaping @MainActor (APIError) -> Void = { _ in }) {
        self.api = api
        self.onError = onError
    }

    func load() async {
        do {
            spaces = try await api.mySpaces()
            error = nil
        } catch {
            onError(error)
            self.error = error.localizedDescription
        }
        loaded = true
    }
}

/// One group's upcoming events and calendar entries, by day.
@MainActor
@Observable
final class GroupEventsModel {
    struct Day: Identifiable {
        let id: String  // "2026-11-30"
        let date: Date  // its first event's start, for the heading
        let zone: TimeZone
        var events: [Event]
    }

    let space: Space
    private(set) var events: [Event] = []
    private(set) var error: String?
    private(set) var loaded = false

    private let api: EventsAPI
    private let onError: @MainActor (APIError) -> Void

    init(space: Space, api: EventsAPI, onError: @escaping @MainActor (APIError) -> Void = { _ in }) {
        self.space = space
        self.api = api
        self.onError = onError
    }

    func load() async {
        do {
            events = try await api.events(in: space.id)
            error = nil
        } catch {
            onError(error)
            self.error = error.localizedDescription
        }
        loaded = true
    }

    /// After answering on the event's page: show the new counts here too.
    func replace(_ event: Event) {
        if let index = events.firstIndex(where: { $0.id == event.id }) { events[index] = event }
    }

    /// The events grouped by the day they start (where they happen), soonest first.
    var days: [Day] { Self.days(of: events) }

    static func days(of events: [Event]) -> [Day] {
        var days: [Day] = []
        for event in events {
            let d = event.day
            let id = String(format: "%04d-%02d-%02d", d.year ?? 0, d.month ?? 0, d.day ?? 0)
            if let last = days.indices.last, days[last].id == id {
                days[last].events.append(event)
            } else {
                days.append(Day(id: id, date: event.startsAt, zone: event.zone, events: [event]))
            }
        }
        return days
    }
}

/// One event's page: its details, the RSVP buttons, and who's going.
@MainActor
@Observable
final class EventModel {
    private(set) var event: Event
    /// Why the last answer didn't go through, if it didn't.
    private(set) var message: String?
    private(set) var sending = false

    private let api: EventsAPI
    private let onError: @MainActor (APIError) -> Void
    private let onChange: @MainActor (Event) -> Void

    init(
        event: Event, api: EventsAPI, onError: @escaping @MainActor (APIError) -> Void = { _ in },
        onChange: @escaping @MainActor (Event) -> Void = { _ in }
    ) {
        self.event = event
        self.api = api
        self.onError = onError
        self.onChange = onChange
    }

    func refresh() async {
        do {
            show(try await api.event(event.id))
        } catch {
            onError(error)
            message = error.localizedDescription
        }
    }

    /// Answer, or take back the answer you already gave (as on the web).
    /// The buttons change at once; if the server says no, they change back
    /// and `message` says why.
    func answer(_ answer: Answer) async {
        guard !sending else { return }
        let before = event
        let next: Answer? = event.myAnswer == answer ? nil : answer
        event = event.answered(next)
        message = nil
        sending = true
        defer { sending = false }
        do {
            show(try await api.answer(before.id, next, version: before.version))
        } catch {
            event = before
            message = error.localizedDescription
            onError(error)
            // Changed (or full) since you looked: show it as it is now.
            if case .http(409, _) = error, let now = try? await api.event(before.id) { show(now) }
        }
    }

    private func show(_ event: Event) {
        self.event = event
        onChange(event)
    }
}
