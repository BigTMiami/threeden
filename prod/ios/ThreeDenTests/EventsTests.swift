import Foundation
import Testing
@testable import ThreeDen

/// A fake 3den server for groups and events: 14 Juniper Lane and its House
/// meeting (Maya going), answers kept per request, and a log of what was asked.
private final class FakeEventsServer: @unchecked Sendable {
    private let lock = NSLock()
    private var _requests: [URLRequest] = []
    private var myAnswer: String?
    var requests: [URLRequest] { lock.withLock { _requests } }

    /// Set to refuse answers with this status and message.
    var refuse: (Int, String)?
    var version = 1

    static let juniper = "f100fa1f-e31c-5ebe-a154-337c55391ad0"
    static let meeting = "7d361297-c54b-5dd0-8306-f68d029fb1fc"
    static let rent = "1f2f73e4-67da-51aa-ab3c-e2f5a24cc21a"

    func client() -> EventsAPI {
        let tokens = TokenStore(keychain: nil)
        tokens.set("good-token")
        let api = APIClient(baseURL: URL(string: "http://test.local:8080")!, tokens: tokens) { [self] request in
            let (status, body) = lock.withLock {
                _requests.append(request)
                return answer(request)
            }
            let response = HTTPURLResponse(
                url: request.url!, statusCode: status, httpVersion: nil,
                headerFields: ["Content-Type": "application/json"])!
            return (Data(body.utf8), response)
        }
        return EventsAPI(api: api)
    }

    private func answer(_ request: URLRequest) -> (Int, String) {
        let path = request.url!.path()
        guard request.value(forHTTPHeaderField: "Authorization") == "Bearer good-token" else {
            return (401, #"{"detail":"Please sign in."}"#)
        }
        switch (request.httpMethod ?? "GET", path) {
        case ("GET", "/api/v1/me/spaces"):
            return (200, """
                [{"id":"\(Self.juniper)","slug":"juniper","kind":"group","name":"14 Juniper Lane",
                  "visibility":"private","description":"The house.","role":"owner","member_count":4}]
                """)
        case ("GET", "/api/v1/spaces/\(Self.juniper)/events"):
            return (200, "[\(meetingJSON()),\(Self.rentJSON)]")
        case ("GET", "/api/v1/events/\(Self.meeting)"):
            return (200, meetingJSON())
        case ("PUT", "/api/v1/events/\(Self.meeting)/rsvp"):
            if let (status, detail) = refuse { return (status, #"{"detail":"\#(detail)"}"#) }
            let body = try! JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            myAnswer = body["answer"] as? String
            return (200, meetingJSON())
        case ("GET", _), ("PUT", _):
            return (404, #"{"detail":"This event doesn’t exist, or it’s private."}"#)
        default:
            return (405, #"{"detail":"Method Not Allowed"}"#)
        }
    }

    private static let space = """
        {"id":"\(juniper)","slug":"juniper","kind":"group","name":"14 Juniper Lane","visibility":"private"}
        """
    private static let maya = #"{"id":"0193a1b2-0000-7000-8000-00000000000a","name":"Maya Chen","username":"maya"}"#
    private static let leo = #"{"id":"0193a1b2-0000-7000-8000-00000000000b","name":"Leo L","username":"leo"}"#

    /// The House meeting, with Maya going and Leo's answer (if any). Times as the server sends them.
    private func meetingJSON() -> String {
        var rsvps = [#"{"account":\#(Self.maya),"answer":"going","answered_at":"2026-11-25T10:00:00.123456Z"}"#]
        if let myAnswer {
            rsvps.append(#"{"account":\#(Self.leo),"answer":"\#(myAnswer)","answered_at":"2026-11-26T10:00:00Z"}"#)
        }
        let count = { (answer: String) in (self.myAnswer == answer ? 1 : 0) + (answer == "going" ? 1 : 0) }
        return """
            {"id":"\(Self.meeting)","space":\(Self.space),"kind":"event","title":"House meeting",
             "starts_at":"2026-12-01T00:00:00Z","ends_at":"2026-12-01T01:30:00Z","all_day":false,
             "time_zone":"America/New_York","location":"Living room","notes":"Agenda is in the note.",
             "color":"blue","visibility":"group","capacity":null,"host":\(Self.maya),"version":\(version),
             "counts":{"going":\(count("going")),"maybe":\(count("maybe")),"no":\(count("no"))},
             "my_answer":\(myAnswer.map { "\"\($0)\"" } ?? "null"),
             "rsvps":[\(rsvps.joined(separator: ","))],"invitees":[]}
            """
    }

    /// An all-day calendar entry: no host, no end of its own beyond midnight.
    private static let rentJSON = """
        {"id":"\(rent)","space":\(space),"kind":"entry","title":"Rent due",
         "starts_at":"2026-12-15T05:00:00Z","ends_at":"2026-12-16T05:00:00Z","all_day":true,
         "time_zone":"America/New_York","location":"","notes":"","color":"red","visibility":"group",
         "capacity":null,"host":null,"version":1,"counts":{"going":0,"maybe":0,"no":0},
         "my_answer":null,"rsvps":[],"invitees":[]}
        """
}

@Suite("Groups and events API")
struct EventsAPITests {
    @Test func readsYourGroups() async throws {
        let spaces = try await FakeEventsServer().client().mySpaces()
        #expect(spaces.map(\.name) == ["14 Juniper Lane"])
        #expect(spaces.first?.role == .owner)
        #expect(spaces.first?.memberCount == 4)
        #expect(spaces.first?.visibility.rawValue == "private")
    }

    @Test func readsEventsWithMicrosecondsAndNulls() async throws {
        let events = try await FakeEventsServer().client().events(in: FakeEventsServer.juniper)
        #expect(events.map(\.title) == ["House meeting", "Rent due"])
        let meeting = try #require(events.first)
        #expect(meeting.kind == .event)
        #expect(meeting.host?.name == "Maya Chen")
        #expect(meeting.counts.going == 1)
        #expect(meeting.myAnswer == nil)
        #expect(meeting.rsvps.first?.answer == .going)
        let rent = try #require(events.last)
        #expect(rent.host == nil)
        #expect(!rent.isEvent)
    }

    @Test func showsTimesWhereTheEventHappens() async throws {
        let events = try await FakeEventsServer().client().events(in: FakeEventsServer.juniper)
        let meeting = try #require(events.first)
        // Midnight UTC on Dec 1 is 7pm on Nov 30 in New York.
        #expect(meeting.day.month == 11 && meeting.day.day == 30)
        #expect(meeting.timeText.contains("7:00"))
        let rent = try #require(events.last)
        #expect(rent.timeText == "All day")
        #expect(rent.day.day == 15)
    }

    @Test func answeringSendsTheAnswerAndVersion() async throws {
        let server = FakeEventsServer()
        let event = try await server.client().answer(FakeEventsServer.meeting, .maybe, version: 1)
        #expect(event.myAnswer == .maybe)
        #expect(event.counts.maybe == 1)

        let sent = try #require(server.requests.last)
        #expect(sent.httpMethod == "PUT")
        #expect(sent.value(forHTTPHeaderField: "Authorization") == "Bearer good-token")
        let body = try JSONSerialization.jsonObject(with: try #require(sent.httpBody)) as! [String: Any]
        #expect(body["answer"] as? String == "maybe")
        #expect(body["version"] as? Int == 1)
    }

    @Test func refusalsCarryTheServersWords() async throws {
        let server = FakeEventsServer()
        server.refuse = (409, "This event changed since you opened it. Have a look, then answer again.")
        await #expect(throws: APIError.http(
            status: 409, detail: "This event changed since you opened it. Have a look, then answer again.")
        ) {
            try await server.client().answer(FakeEventsServer.meeting, .going, version: 1)
        }
        await #expect(throws: APIError.http(status: 404, detail: "This event doesn’t exist, or it’s private.")) {
            try await server.client().event("00000000-0000-7000-8000-000000000000")
        }
    }
}

@MainActor
@Suite("Event page")
struct EventModelTests {
    private func model(_ server: FakeEventsServer, changes: @escaping @MainActor (Event) -> Void = { _ in }) async throws
        -> EventModel
    {
        let api = server.client()
        return EventModel(event: try await api.event(FakeEventsServer.meeting), api: api, onChange: changes)
    }

    @Test func answeringUpdatesTheCountsAndTellsTheList() async throws {
        var told: [Answer?] = []
        let model = try await model(FakeEventsServer()) { told.append($0.myAnswer) }
        await model.answer(.going)
        #expect(model.event.myAnswer == .going)
        #expect(model.event.counts.going == 2)
        #expect(model.event.people(answering: .going).map(\.username) == ["maya", "leo"])
        #expect(told == [.going])
    }

    @Test func tappingYourAnswerAgainTakesItBack() async throws {
        let model = try await model(FakeEventsServer())
        await model.answer(.maybe)
        await model.answer(.maybe)
        #expect(model.event.myAnswer == nil)
        #expect(model.event.counts.maybe == 0)
    }

    @Test func aRefusalPutsTheOldAnswerBack() async throws {
        let server = FakeEventsServer()
        let model = try await model(server)
        server.refuse = (409, "It’s full.")
        await model.answer(.going)
        #expect(model.event.myAnswer == nil)
        #expect(model.event.counts.going == 1)
        #expect(model.message == "It’s full.")
    }

    @Test func theOptimisticCopyMovesCounts() {
        // Answered locally before the server agrees: counts follow the change.
        let counts = Components.Schemas.RsvpCounts(going: 2, maybe: 1, no: 0)
        var c = counts
        c.set(.maybe, c.maybe - 1)
        c.set(.going, c.going + 1)
        #expect(c == Components.Schemas.RsvpCounts(going: 3, maybe: 0, no: 0))
    }
}

@MainActor
@Suite("Coming up")
struct UpcomingModelTests {
    @Test func listsYourGroupsEventsAndAnswersInPlace() async throws {
        let server = FakeEventsServer()
        let model = UpcomingModel(api: server.client())
        await model.load()
        #expect(model.events.map(\.title) == ["House meeting", "Rent due"])
        #expect(model.days.count == 2)

        let meeting = try #require(model.events.first)
        await model.answer(meeting, .going)
        #expect(model.events.first?.myAnswer == .going)
        #expect(model.events.first?.counts.going == 2)

        server.refuse = (409, "It’s full.")
        await model.answer(try #require(model.events.first), .maybe)
        #expect(model.events.first?.myAnswer == .going)  // put back
        #expect(model.refused?.message == "It’s full.")
    }
}
