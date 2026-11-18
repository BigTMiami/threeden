# 3den: design

This is the place to think about what 3den does and how it's put together.
README.md lists every feature and file as built; HANDOFF.md tracks the state
of the work. This doc steps back from both: the ideas 3den is made of, how
they fit, the rules the design follows, and the questions still open. Use it
before adding a feature, to decide where it belongs.

## What 3den is for

3den is a home for groups of people who know each other and meet: a
household, a tenants union, a band, a mutual aid network, a family, a class,
a book club. Today those groups spread across Instagram, WhatsApp, Google
Calendar, Docs, Excel, Partiful, and email. 3den puts the group's page, its
events, its conversations, its tasks, and its files in one place, and adds a
calm social layer (friends, blogs, and a Feed) around it.

Each person also has a private homepage that pulls together what's theirs
from every group (events they're going to, tasks assigned to them) and a
public blog.

People mostly arrive because someone sent them something: an event, a group
invite, a blog post. The first visit should help with that one thing.

The goals and how well 3den meets them are reviewed in the "Goals and
principles review" doc (linked from HANDOFF.md).

## Design rules

These come from decisions made while building the prototype. A new feature
should follow them, or the exception should be a deliberate choice.

- **Plain and clean.** The look is closer to Wikipedia or Craigslist than to
  a social app. Less text on pages; one chip style; colors and sizes only from
  `css/tokens.css`.
- **One word per action.** Add (tasks, shifts, people), Post (feeds, threads,
  replies), Publish (articles), Send (messages, sharing).
- **Undo instead of "Are you sure?"** Destructive actions happen at once and
  offer Undo in a toast.
- **Nothing is lost.** A module taken off a page keeps a copy (in the vault, or
  under Removed). Article edits keep earlier versions. Saved data is carried
  through updates.
- **Nothing moves under you.** Answering an RSVP, saving a note, or a live
  update never jumps the page, closes a panel, or steals focus.
- **Sizes are chosen, not computed.** A module's width and height are set in
  the editor; its body scrolls inside. Adding twenty events never pushes the
  rest of a page around.
- **Phones are first-class.** The same app, rearranged: a tab bar (Home, Feed,
  Groups, Messages, and Blog), bottom sheets, one module per screen when swiping.
  A group or your homepage on a phone opens on widgets (one glance per module); tapping one
  opens the swipe view at that module. Its widget order and sizes are set
  from a computer with Edit → Edit mobile.
- **Private by default.** Rough area instead of exact location; only you see
  your connected calendars; direct messages are end-to-end encrypted; photo
  edits drop embedded metadata; permission checks are written as a server
  would make them.
- **Every drag has a keyboard or form alternative**, and every icon-only
  button has a label.
- **Every menu is fully on screen.** Small menus place themselves under or
  above their button, inside the screen and above the phone tab bar
  (`placeMenuOnScreen` in js/ui/media-attach.js); bigger ones are sheets
  on phones.
- **Every choice you can see, you can pick.** A choice that doesn't fit
  with another one changes that other one and says so, rather than being
  quietly disabled (`reconcileAccess` in js/groups/settings-page.js).
- **Plain code.** No framework, no build step, a comment header on every
  file, short functions named for what they do, and the Oxford comma in
  on-screen text, docs, and comments.

## The building blocks

```
Member ──belongs to──► Space (group · personal homepage · blog)
                         │
                         ├── Tabs (a group can make some public)
                         │     └── Modules (placed on a 12-column grid)
                         │           └── Items (posts, tasks, events, files…)
                         │
                         ├── Roles and permissions (owner, admins, members)
                         └── Appearance (fonts, accent color, corners)

Member ──takes part in──► Conversations (direct or group; a group chat can belong to a space)
Member ──receives──────► Notifications (mentions, assignments, group news, likes…)
Member ──links to──────► Friends, and their blogs (the Feed)
```

| Idea | What it is | Where in code |
| --- | --- | --- |
| **Member** | An account: name, unique username (for @mentions), email or phone. Quick accounts can join with just a name and phone number | `js/state/accounts.js` |
| **Space** | Any homepage. Groups, personal homepages, and blogs are the same object in code: a name, member ids, tabs, and modules, with a `kind` | `js/state/store.js`, `js/state/groups.js` |
| **Tab** | A page within a space. A group can make a tab public while the rest stays members-only | store.js |
| **Module** | A block on a page: a type, a size (`span` × `rows`), and its own data | `js/modules/` |
| **Item** | Something inside a module: a post, a thread, a task, an event, a vault file | each module's `*-data.js` |
| **Event** | A dated thing with RSVPs, guest lists, reminders, and sign-ups. Lives in calendar and Upcoming events modules, and has its own page | `js/events/`, `js/state/events.js` |
| **Conversation** | Messages between people. A Chat module shows a conversation; Messages shows the same one | `js/state/messages.js` |
| **Notification** | Something that needs your attention, grouped when several are about the same thing | `js/state/notifications.js` |
| **Linked item** | Something assigned to you in a group, shown live on your personal homepage (not a copy) | `js/editor/linked-items.js` |
| **Vault file** | A kind of item: what a Vault holds (a folder, note, link, uploaded file, or module file such as a spreadsheet). Any but a folder can be shown on a page with File from vault, live from the vault | `js/modules/vault/`, `js/modules/vaultfile/` |

### The three kinds of space

| | Group | Personal homepage | Blog |
| --- | --- | --- | --- |
| Who's in it | the group's members | only its owner | only its owner |
| Who can see it | members, plus anyone for public tabs | only you | anyone |
| What it's for | the group's shared life | your week across every group | what you share publicly |
| First module | Up next | Dashboard | a feed |

A module type says which kinds it fits with `spaceKinds`; the editor's
library only offers those.

## Places in the app

| Place | What it does | URL |
| --- | --- | --- |
| **Home** | Your personal homepage | `#space-me` |
| **A group** | The group's homepage and tabs | `#space-<id>`, `#space-<id>--<tab>` |
| **Feed, Friends, My blog** | The social layer (Feed and Blog are separate tabs on phones) | `#feed`, `#blog-<username>` |
| **Groups and Explore** | Your groups; finding groups and events by place and interest | `#groups`, `#groups-explore` |
| **Messages** | Direct and group conversations | `#messages`, `#messages-<id>` |
| **Notifications** | The bell's list | (a panel) |
| **A module's full page** | The roomy view of any module | `#module-<id>` |
| **An event's page** | Details, RSVPs, guest list, reminders | `#event-<id>` |
| **Settings** | A group's settings; your account | `#settings-<id>`, `#account` |

Every view has a URL, so Back, Forward, and shared links work. Ctrl+K (⌘K)
jumps anywhere.

## The modules, by purpose

| Purpose | Modules | Fits in |
| --- | --- | --- |
| **Getting your bearings** | Dashboard, Recents, Recent groups (personal); Up next (every group's first module) | personal or group |
| **Talking** | Announcements, Forum, Chat | group (Chat on personal too) |
| **Meeting up** | Calendar, Upcoming events, Volunteer shifts | group, personal (Upcoming events on blogs too; shifts in groups only) |
| **Getting things done** | Tasks (list and board views), List, Budget, Gantt chart, Survey | group, personal |
| **Making and keeping things** | Vault, File from vault (which shows documents, spreadsheets, presentations, and any other vault file), Submissions | group, personal (File from vault on blogs too; Submissions in groups only) |
| **Publishing** | Articles, General feed, Text feed (Carousel: blog only) | blog and group |
| **A blog's front page** | About, Photo gallery, Carousel | blog |
| **Organizing** | Relationship map | group, personal |

"Coming soon" entries in the library (`js/modules/coming-soon.js`) mark
types that are planned but not built.

### How a module is built

Every module type exports one object (the contract is at the top of
`js/modules/registry.js`):

- `render(container, context)` draws the card on the page.
- `renderFullPage(container, context)` (optional) draws the full page, and
  gives the card an expand button.
- `createInitialData()`, `defaultSpan`, `defaultRows`, `spaceKinds`, `icon`,
  and `label` describe a new one.
- `assignments` (optional) tells 3den which items can be assigned to people,
  so they show on assignees' homepages and notify them, with no code in the
  module.

Both views get the same `context`: `saveData()`, `can(permission)`,
`members`, `isVisitor`, `openFullPage(itemId)`, and, on personal homepages,
`getLinkedItems()`. The folder pattern keeps the two views from disagreeing:

- `*-data.js`: the data shape and rules (sorting, filtering, date math), no DOM.
- `*-card.js` and `*-page.js`: the two views.
- A shared drawing file when both draw the same thing (`kanban-board.js`,
  `gantt-chart.js`), which takes getters and callbacks and never saves.

## How it fits together

```
   router.js ──(URL says which space/module)──► main.js ──► setCurrentSpace()
                                                              │
          ┌─────────────── store.js ───────────────┐          │
          │  state (saved)          ui (not saved) │ ◄────────┘
          │  members, spaces[]:     editMode       │
          │    each with modules[]  spaceId        │
          └──┬──────────────┬───────────────┬──────┘
   'space'   │  'mode'      │  'layout'     │  updateModuleData()
             ▼              ▼               ▼          ▲
   space-header.js       grid.js ──► module-frame.js ──┘
   app-bar.js                           │
                                        ▼
                               modules/<type>.js render()
```

1. **One store.** All data lives in `js/state/store.js`. Nothing else changes
   state directly; everything goes through store actions and
   `changeState(fn, ...events)`.
2. **Events, not calls.** The store announces what changed (`layout`, `mode`,
   `space`, `account`, `person`, `messages`, `notifications`), and the views
   that care redraw. Saving a module's data doesn't redraw the grid, so typing
   never loses the cursor.
3. **Watchers instead of wiring.** Group news, mentions, and assignments are
   noticed by watchers on every save (`watchGroupNews()`,
   `watchAssignments()`, `notifyMentions()`), so modules don't each send
   notifications.
4. **Permissions in one place.** `can(space, memberId, permission)` in
   `js/state/permissions.js`, with a table each group can adjust. A server
   must repeat every check.
5. **Storage is swappable.** Only `js/state/storage.js` knows where data is
   saved (IndexedDB today). `js/state/upgrade.js` brings older saves up to
   date: bump `DATA_VERSION` when the sample data or the shape changes, and
   add a step to `MIGRATIONS` when normalizers can't absorb a change.

## Systems that cut across modules

- **Roles and permissions:** owner, admins, and members; each permission
  names the lowest role allowed, and groups can change them.
- **Notifications:** mentions, assignments (with accept or pass), group news,
  replies, likes, follows, and RSVPs, grouped within three days, delivered on
  the page, by phone push, or by email, through per-group settings and quiet
  hours.
- **Linked items:** assigned tasks, events you're going to, and Gantt tasks
  appear on your homepage live from the group.
- **Search:** Ctrl+K and advanced search across what you can see.
- **Events and calendars:** RSVPs, waitlists, co-hosts, series, reminders,
  regulars, "You're free" or "Clashes with…" checked against connected
  calendars, and a calendar feed for other apps.
- **Sharing and publishing:** "Who sees this" on every composer, public tabs,
  documents published as articles, and follows for groups you can't join.
  Every vault file and folder has one sharing tile with three parts: who can
  open it (group members' access, plus people and groups it's shared with
  directly, which then see it under "Shared with you" in their own vault),
  where it's shared (pages), and where it's published (posts and articles).
  Publishing a file always makes a post with a preview tile, so it gets likes
  and comments like any other post.
- **Safety:** reports, a moderation queue, blocking and muting, and accounts
  for children.
- **Appearance:** each space's look is CSS custom properties, so every module
  follows without knowing.
- **Onboarding:** guests can browse public pages; saving anything asks for an
  account at that moment; a starting homepage follows from how the person
  arrived. The first tutorial (setup note, next steps, suggestions, and a
  focused Dashboard) was removed on Nov 17; a new one is being designed.

## From prototype to a real service

The prototype was built so each piece has a clear server counterpart. The
"3den: building the backend" doc has the full plan; the short version:

| In the prototype | On a server |
| --- | --- |
| `store.js` state in one browser | Postgres, behind an API |
| `storage.js` (IndexedDB) | API calls |
| `permissions.js` checks | The same rules, enforced by the server |
| `live.js` (between windows) | A live connection for chat, presence, and updates |
| `delivery.js` and `sw.js` | Web Push, email, and scheduled jobs |
| `calendar-feed.js` | `GET /cal/<token>.ics` |
| `e2ee.js` | Signal protocol for direct chats, MLS for group chats; optional encrypted spaces |
| OpenFreeMap street map | Protomaps on 3den's own storage |
| Files in browser storage | Object storage, with previews made on upload |
| The Playwright tests | Acceptance tests against staging |

## Open questions

Things to settle as the design grows. Some are flagged in the goals review
and the simulated user test.

- **Too many ways to post?** A group can have Announcements, a Forum, feeds,
  Articles, and Chat. Each has a reason, but newcomers may not know which to
  use. Should a group's template pick for them, or should some merge?
- **Too many "needs you" lists?** The Dashboard's For you, the Feed's From
  groups, notifications, and Up next all surface things that need attention.
  One clear place may be better than several.
- **Tasks and List.** Both hold checklists. Where's the line, and should a
  List item be able to become a task?
- **How many modules?** Over two dozen types is a lot to choose from. Which
  ones earn a place in the default library, and which belong behind "More"?
- **Encrypted spaces versus discovery.** End-to-end encrypted spaces can't
  use server search, Explore, or scanning. Which groups should get them, and
  how is the trade-off explained?
- **Phones.** Groups and homepages now open on widgets, which scale better
  than swiping through fifteen modules. Should blogs open on widgets too?
- **The new tutorial.** What should a new account see first, and how much
  should it teach? The old one led with "Add your first task," which didn't
  fit why most people arrive.
- **The name.** 3den, said "Eden," overlaps a registered EDEN mark for a
  social app. See "3den: name and trademark, first-pass findings."

## Before adding a feature

1. **Which idea does it belong to?** A new module type, an item inside an
   existing module, a cross-cutting system, or a place in the app?
2. **Which kinds of space?** Group, personal homepage, blog, or some of them.
3. **Who can do it?** Add a permission if it isn't covered, with a sensible
   default.
4. **Does it notify anyone?** Use the watchers and notification kinds rather
   than sending from the module.
5. **Does it fit the rules?** One word for the action, Undo instead of a
   confirm, nothing lost, nothing moving under the person, and a phone layout.
6. **Does the data shape change?** Bump `DATA_VERSION`, and add a migration if
   needed.
7. **Then the usual workflow:** build it, test it with Playwright, update
   README.md, HANDOFF.md, and this doc if the structure changed, publish the
   artifact, and commit and push.
