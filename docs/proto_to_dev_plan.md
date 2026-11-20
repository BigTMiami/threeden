# Prototype to Development Plan
This document is for planning the transition of the prototype to a functioning development activity.  It will create and interact with the following documents:
* [development_setup.md](development_setup.md)
* [architecture.md](architecture.md)
* [dev_plan_1.md](dev_plan_1.md)

**Status (Nov 20, 2026):** Claude wrote first versions of all three documents. Next step: answer the questions at the end of this doc (Cycle 0, step 0.1 in dev_plan_1.md).

In production we want to support three platforms:
* Web - responsive design, mobile first
* iOS application
* Android application

Design should be API backend that supports the three different platforms.

## Infrastructure
* Will use containers and Docker to allow for desktop development to closely match testing and deployment
* Main Focus is to get end to end environment up and running on macOS.  I will want to run this on my desktop and my laptop
    * After working with this for a while will consider deployment of a testing environment onto EC2 running Docker with multiple containers, S3 for storage, etc.

## Development Setup
I want Claude to create a *development_setup.md* document that documents how to create the following development environment on macOS.
* Docker Environment
* Database Standup (Postgres) in Docker
    * Alembic setup to allow for updates
* FastAPI in Docker
    * Do we need a web server too?
* Code deployment model
    * My main coding tool will be VS Code, but we can use other tools for deployment
* iOS Project
* Other?

> **Done:** [development_setup.md](development_setup.md). Short answers: yes, a web server: Caddy in front of FastAPI, serving the web app and sending `/api` to FastAPI, so the browser sees one site (§6). Code reaches the containers through mounted folders with auto-reload locally, GitHub syncs the two Macs, and later CI builds images that EC2 pulls (§7). "Other" covers Mailpit, an S3 stand-in, a Makefile, linting, and debugging (§9).

## Architecture
I want Claude to review the prototype, documents and this doc and come up with an architecture.    Should be a medium level of detail that covers all major areas of the prototype, does not need to drill down into granular detail.  Should include core aspects of access control, security, etc. Provide some graphics to show how the parts fit together. Provide an initial prioritization.  Create a separate document architecture.md for this document.

> **Done:** [architecture.md](architecture.md). The diagrams are Mermaid; they show on GitHub and in VS Code with the "Markdown Preview Mermaid Support" extension. Section 13 maps every area of the prototype to production with a priority.

## Build Cycles
I want to do quick turns of some functionality implemented in the backend, web, iOS app.  We will come back to do the android app at a later point. I want Claude to outline a set of short steps to implement a limited set of core functionality.  These plans should be in *dev_plan_1.md*

The first thing I want to do is get to a Hello World action that flexes the database and FastAPI in the web, then in iOS.  Then pick 1 prototype function for implementation. Create a set of implementation steps, with each step having a clear indication if this is done by Claude or me.

> **Done:** [dev_plan_1.md](dev_plan_1.md). Cycle 0: tools and repo layout. Cycle 1: Hello World on the web. Cycle 2: Hello World on iOS. Cycle 3: accounts and sign-in (every feature needs them). Cycle 4: the chosen prototype function, **group events and RSVPs**. Each step is marked 🧑 You or 🤖 Claude.

## Claude Questions
This section is for questions Claude has. Each one has a recommendation; write your answer under it, or reply "use your defaults" and Claude goes with the recommendations.

1. **How should the iOS app be built?**
   - **Recommended: native SwiftUI**, with a phone-first subset (Home, groups, events, messages, notifications) and the heavy desktop-shaped modules (Gantt, Budget, Sheet, the editor) opened as web pages inside the app. It feels most at home on an iPhone and suits passkeys and push, but it's a second UI codebase (a third with Android).
   - Alternative: wrap the existing web app with Capacitor. One UI for all three platforms and much less work, but it feels like a website, and App Store review sometimes rejects thin wrappers.
   - Alternative: React Native or Flutter for iOS and Android together. One mobile codebase, but a new framework and language next to the framework-free web app.
   - *Answer:*

2. **Move the prototype into `web/`?** Recommended: yes, in Cycle 0 with `git mv`, so Caddy serves only the app (not docs, tests, or scripts). cloudflare-deploy.md planned the same move under the name `prototype_deploy/`; `web/` fits better now that it becomes the real web client. That doc would be updated to match.
   - *Answer:*

3. **OrbStack or Docker Desktop?** Neither is installed on this Mac yet. Recommended: OrbStack (lighter and faster on Apple silicon, free for personal use). Docker Desktop is fine too; nothing else changes.
   - *Answer:*

4. **Is group events and RSVPs the right first feature?** It's the core loop and tests groups, roles, and visibility on both platforms. Alternative: Tasks (a simpler data model, but less central and less phone-shaped).
   - *Answer:*

5. **Encrypted groups.** The prototype's group Security tab turns on "encrypt private posts, chat, calendar, and vault" by default. If the server can't read group content, it can't search it, build Explore, check content permissions, or write notification text. Recommended: group content readable by the server (encrypted in transit and at rest) for now; end-to-end encryption for direct messages first (late phase); encrypted groups as an opt-in later, with the trade-offs explained in the Security tab. This changes the prototype's default.
   - *Answer:*

6. **Apple Developer Program ($99/year).** Not needed for Cycles 0 to 4 (a free Apple ID runs the app on the Simulator and your own iPhone, re-installed every 7 days). It is needed for push notifications and TestFlight. Do you have it, or should the plan avoid needing it until later?
   - *Answer:*

7. **Leo.** HANDOFF.md asks that Leo be reminded of four things before any server code is written (Protomaps, AGPL readiness, the calendar feed endpoint, and Web Push). They're placed in architecture.md §13. Should Leo review architecture.md before Cycle 1 starts?
   - *Answer:*

8. **The security plan doc.** HANDOFF.md links a "Security, privacy, and anti-bot plan" (claude.ai artifact `2GKQw2oUNoerCLhyAGyWzS`), but it couldn't be opened from this session (not found or not shared with this account). Could you export it into `docs/` (or share it), so architecture.md §8 can be checked against it?
   - *Answer:*
