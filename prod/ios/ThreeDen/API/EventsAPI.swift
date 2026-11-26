import Foundation
import HTTPTypes
import OpenAPIRuntime

// The groups and events endpoints, through the client that Apple's
// swift-openapi-generator makes from openapi.json at build time
// (openapi-generator-config.yaml). Its types are Components.Schemas.*; these
// names are the ones the app uses.
typealias Space = Components.Schemas.SpaceOut
typealias Event = Components.Schemas.EventOut
typealias Answer = Components.Schemas.Answer
typealias Person = Components.Schemas.Person

/// Your groups, their events, and RSVPs. Every call throws only `APIError`,
/// like APIClient, whose connection, session token, and errors it shares.
struct EventsAPI: Sendable {
    private let client: Client

    init(api: APIClient) {
        client = Client(
            serverURL: api.baseURL,
            configuration: Configuration(dateTranscoder: ServerDates()),
            transport: ServerTransport(api: api))
    }

    /// Your groups, by name.
    func mySpaces() async throws(APIError) -> [Space] {
        try await call { try await client.mySpaces().ok.body.json }
    }

    /// A group's events and calendar entries from `from` (default now) to
    /// `to` (default 60 days later), soonest first.
    func events(in spaceID: String, from: Date? = nil, to: Date? = nil) async throws(APIError) -> [Event] {
        try await call {
            try await client.spaceEvents(path: .init(spaceId: spaceID), query: .init(from: from, to: to))
                .ok.body.json
        }
    }

    func event(_ id: String) async throws(APIError) -> Event {
        try await call { try await client.readEvent(path: .init(eventId: id)).ok.body.json }
    }

    /// Going, Maybe, or Can't go (nil takes your answer back). `version` is the
    /// event's version you were looking at: if it has changed since, 409.
    func answer(_ id: String, _ answer: Answer?, version: Int?) async throws(APIError) -> Event {
        try await call {
            try await client.answerEvent(
                path: .init(eventId: id), body: .json(.init(answer: answer, version: version))
            ).ok.body.json
        }
    }

    /// Turns whatever the generated client throws into APIError.
    private func call<T>(_ body: () async throws -> T) async throws(APIError) -> T {
        do {
            return try await body()
        } catch let error as APIError {
            throw error
        } catch let error as ClientError {
            if let underlying = error.underlyingError as? APIError { throw underlying }
            throw .decoding(String(describing: error.underlyingError))
        } catch {
            throw .decoding(String(describing: error))
        }
    }
}

/// Sends the generated client's requests through APIClient, so they share its
/// URLSession (or a test's fake server), its session token, and its errors:
/// anything but a 2xx answer comes back as APIError with the server's message.
struct ServerTransport: ClientTransport {
    let api: APIClient

    func send(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard let url = URL(string: baseURL.absoluteString + (request.path ?? "")) else {
            throw APIError.invalidResponse
        }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.timeoutInterval = 15
        for field in request.headerFields {
            urlRequest.addValue(field.value, forHTTPHeaderField: field.name.canonicalName)
        }
        if let token = api.tokens.token {
            urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            urlRequest.httpBody = try await Data(collecting: body, upTo: 1_000_000)
        }

        let (data, http) = try await api.exchangeHTTP(urlRequest)
        var fields = HTTPFields()
        for case let (name as String, value as String) in http.allHeaderFields {
            if let name = HTTPField.Name(name) { fields.append(HTTPField(name: name, value: value)) }
        }
        if fields[.contentType] == nil { fields[.contentType] = "application/json" }
        return (HTTPResponse(status: .init(code: http.statusCode), headerFields: fields), HTTPBody(data))
    }
}

/// The server's times: ISO 8601 in UTC, with microseconds or without.
struct ServerDates: DateTranscoder {
    func encode(_ date: Date) throws -> String {
        date.formatted(.iso8601)
    }

    func decode(_ text: String) throws -> Date {
        guard let date = APIClient.parseISO8601(text) else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Not an ISO 8601 date: \(text)"))
        }
        return date
    }
}

// MARK: - Reading events

extension Event {
    var zone: TimeZone { TimeZone(identifier: timeZone) ?? .current }

    /// The calendar of where it happens: its day and times are shown there.
    var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        return calendar
    }

    var isEvent: Bool { kind == .event }

    /// The day it starts, where it happens.
    var day: DateComponents { calendar.dateComponents([.year, .month, .day], from: startsAt) }

    /// The last moment it covers (all-day items end at the midnight after their last day).
    private var lastMoment: Date {
        guard let endsAt else { return startsAt }
        return allDay ? endsAt.addingTimeInterval(-1) : endsAt
    }

    private func style(date: Date.FormatStyle.DateStyle, time: Date.FormatStyle.TimeStyle) -> Date.FormatStyle {
        Date.FormatStyle(date: date, time: time, timeZone: zone)
    }

    /// "7:00 – 8:30 PM", "All day", or "All day, until Dec 6".
    var timeText: String {
        let multiDay = !calendar.isDate(startsAt, inSameDayAs: lastMoment)
        if allDay {
            return multiDay ? "All day, until \(lastMoment.formatted(style(date: .abbreviated, time: .omitted)))" : "All day"
        }
        let start = startsAt.formatted(style(date: .omitted, time: .shortened))
        guard endsAt != nil, lastMoment != startsAt else { return start }
        let end = lastMoment.formatted(style(date: multiDay ? .abbreviated : .omitted, time: .shortened))
        return "\(start) – \(end)"
    }

    /// "Monday, November 30 · 7:00 – 8:30 PM"
    var whenText: String {
        "\(startsAt.formatted(style(date: .complete, time: .omitted))) · \(timeText)"
    }

    /// Everyone who gave this answer, earliest first.
    func people(answering answer: Answer) -> [Person] {
        rsvps.filter { $0.answer == answer }.map(\.account)
    }

    func count(_ answer: Answer) -> Int {
        switch answer {
        case .going: counts.going
        case .maybe: counts.maybe
        case .no: counts.no
        }
    }

    /// This event with your answer changed, as it will be once the server agrees
    /// (counts and your answer; the guest list waits for the server).
    func answered(_ answer: Answer?) -> Event {
        var copy = self
        if let old = myAnswer { copy.counts.set(old, copy.count(old) - 1) }
        if let answer { copy.counts.set(answer, copy.count(answer) + 1) }
        copy.myAnswer = answer
        return copy
    }
}

extension Components.Schemas.RsvpCounts {
    mutating func set(_ answer: Answer, _ value: Int) {
        switch answer {
        case .going: going = max(0, value)
        case .maybe: maybe = max(0, value)
        case .no: no = max(0, value)
        }
    }
}

extension Answer {
    /// The prototype's buttons: 👍 Going, 🤔 Maybe, 😢 Can't go.
    var emoji: String {
        switch self {
        case .going: "👍"
        case .maybe: "🤔"
        case .no: "😢"
        }
    }

    var label: String {
        switch self {
        case .going: "Going"
        case .maybe: "Maybe"
        case .no: "Can’t go"
        }
    }
}
