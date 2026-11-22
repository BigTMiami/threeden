# 3den: handoff notes

Paste this file into a new chat (or attach the project zip) to pick up where
the last session left off. README.md documents every feature and file;
this note covers the state of the work, how it was built, and what's next.

## Where things live

- **Published prototype:** https://claude.ai/artifact/LUpj8sUZpPgW1dg95HcL9H
  (artifact slug `9dc020fa-1fb0-43b3-a0aa-8d525d069204`; check the live version with `get_artifact` before publishing). It holds every file in
  this project. Republish with `publish_files`, mode `patch`, sending only changed files.
- **Simulated user test and improvement plan (a doc):**
  https://claude.ai/artifact/PsaEK1DGcCUsu9AD1zgbme — 8 personas, their feedback,
  and 15 prioritized actions.
- **Security, privacy, and anti-bot plan (a doc):**
  https://claude.ai/artifact/2GKQw2oUNoerCLhyAGyWzS — messages (libsignal,
  MLS), files, accounts, infrastructure, surveillance and legal requests,
  keeping 3den human, and a roadmap.
- **Goals and principles review (a doc, Nov 14):**
  https://claude.ai/artifact/K2iy2GQHJd5UmwgHwrEgrE: a scorecard against
  the four goals and the principles, where 3den drifts (five "needs you"
  lists, too many ways to post), the event loop, friction, adoption and
  retention, and an ordered list of 11 moves.
- **GitHub:** https://github.com/BigTMiami/threeden (owner BigTMiami; Leo is the
  collaborator drabconcrete). Every feature is committed and pushed to `main`.
- **DESIGN.md:** the building blocks, design rules, how the parts fit, and open
  questions. Update it when the structure changes.
- **Tests:** `tests/` in the project (two sweeps and one script per recent
  feature; see tests/README.md).
- **Saved data:** IndexedDB (database `3den`, store `state`, key `3den.homepage-prototype`, one slot for good since Nov 16), with a matching token in localStorage (`3den.saved-token`)
  (`js/state/storage.js`). **Saves are kept through updates** (Leo, Nov 16):
  bump `DATA_VERSION` in `js/state/upgrade.js` whenever the sample data or the
  shape changes. An older save is then brought up to date on load: sample
  content with ids it has never seen (`state.demoSeen`) is added around the
  person's own data; their edits and deletions stay. Shape changes that the
  normalizers can't absorb get a step in `MIGRATIONS`. The sample data must
  build with the same ids every time (no makeId in demo files; budgets reset
  their counter, starter modules get `<space>--<type>-<n>` ids in
  demo-state.js). Clearing localStorage still starts fresh.

## Before the backend (remind Leo)

Leo asked to be reminded of these when work on the real backend starts.
Bring them up before writing any server code.

1. **Integrate Protomaps** for the street map: one PMTiles file on 3den's
   own object storage, drawn with the MapLibre code already in
   `js/ui/street-map.js` (swap `STREET_STYLE` for a Protomaps style). It
   replaces OpenFreeMap, so no outside service sees where people look.
   Ship MapLibre with the app instead of from a CDN, and add address
   search with Photon on 3den's own server.
2. **3den is open source under AGPL-3.0-or-later** (Leo decided Nov 14).
   LICENSE, SECURITY.md, CONTRIBUTING.md (DCO sign-off), and
   CODE_OF_CONDUCT.md are in the project. Still to do before the repo is
   public:
   - paste the full AGPL text into LICENSE (the sandbox couldn't download
     it; the spot is marked);
   - replace the placeholder addresses security@3den.example and
     conduct@3den.example;
   - set `SOURCE_CODE_URL` in js/onboarding/help-page.js;
   - confirm DCO, or switch to a CLA if Leo may ever want to change the
     license or sell other licenses (a CLA has to be in place before the
     first outside contribution);
   - register "3den" as a trademark, and have a lawyer check the license
     and trademark choices;
   - keep anti-abuse settings and any secrets out of the repo.
3. **Calendar feed endpoint:** serve `GET /cal/<token>.ics` with
   `feedIcs(member)` (js/state/calendar-feed.js), no sign-in (the token is the
   key), `Content-Type: text/calendar`, short cache; tokens are revocable
   ("Make a new address"). Point `FEED_HOST` at the real domain.
4. **Web Push:** make VAPID keys, put the public one in `VAPID_PUBLIC_KEY`
   (js/state/delivery.js), store each `pushSubscription`, and send the same
   notifications the bell gets, through the same rules (`shouldPush`: group
   settings, needs-you only, quiet hours). iPhones need 3den installed to the
   Home Screen (iOS 16.4+).

## What 3den is

A no-framework HTML/CSS/JS prototype: groups with customizable module
homepages (and tabs), a private personal homepage, Messages, notifications,
and public blogs with feeds, friends, likes and comments (the "Blog" tab:
Feed · Friends · My blog). The look
is plain and clean, like Wikipedia or Craigslist. Code is written to be
easy for people to read: plain modules, a comment header per file, short
functions, no build step.

## How it was built

- **Writing style:** Leo wants the Oxford comma, always ("Home, Blog, and
  Groups"): in replies, on-screen text, docs, and comments.
- **Workflow per feature:** build it → test it in a real browser with Playwright →
  update README.md and HANDOFF.md (and DESIGN.md if the structure changed) →
  publish to the artifact → commit and push to GitHub.
- **Run it:** `python3 -m http.server 8765` in the project folder, open
  `http://localhost:8765/index.html`.
- **Checks:** `npm run check` runs ESLint (`eslint.config.js`, core rules
  only, no plugins) and TypeScript over the JSDoc in every file that starts
  with `// @ts-check` (`jsconfig.json`). Both are clean. 55 files have no
  `@ts-check` yet because they have type errors (mostly `{}` defaults for
  options objects; calendar-editor.js has 124); add it as each is fixed, and
  start every new file with it.
- **Testing:** Playwright (Python) driving Chrome. Scope selectors to the
  visible view (`#homepage-view`, `#module-page-view`, `#messages-view`),
  because hidden views stay in the page. A full sweep visits every space, tab
  and module page at 1440 px and 400 px wide and checks for "null",
  "undefined", "NaN", page errors and sideways overflow.
- **DOM helpers** (`js/ui/dom.js`): `h(tag, props, ...children)` builds elements
  and skips null children; use `replaceChildren(el, ...)` / `appendChildren`
  from there, never the native `el.append(null)` (it prints "null").
- **State** (`js/state/store.js`): `changeState(fn, ...events)`; modules save
  with `context.saveData`, or `updateModuleData(moduleId, data)` from outside.
- **Sample data:** one file per group in `js/data/demo/`, assembled by
  `js/data/demo-state.js`. Dates are relative to today.

## Recently finished (all published)

- **Board events from your calendar, Shifts, and the calendar list (Nov 20):**
  - Board: the composer's Event button is gone (and js/ui/event-attach.js
    with it). Add → **Event** opens `openEventPicker({ me, onPick })`
    (js/events/event-picker.js: your coming events from `myUpcoming`, a
    year ahead, searchable). The pick rides in `announcementAttacher`'s
    `read().eventId`; board-parts.js shares an event from another calendar
    with the group (`shareWithGroup`) and saves `post.eventId`. The Feed
    keeps its own Event button (create or pick).
  - Shifts: renamed (label, starter layout, help; upgrade v73 renames
    modules still titled "Volunteer shifts"). shifts-data.js gained notes in
    the editor, `updateShift`/`deleteShift` (scope 'one' or 'later'),
    `setRepeat`, `extendSeries`, `nextDate`, and `data.series[seriesId] =
    { every, until, through, template }`. Repeats are stored as one shift
    per date (own sign-ups), made `SERIES_AHEAD_DAYS` (56) ahead and topped
    up on draw; a date that already has the same start and name joins the
    series instead of doubling. The opened shift lives in a module-level Map
    shared by card and page (the card behind a module page can take the
    focus request first). Taken shifts reach your calendar through
    `shiftLinks()` in linked-items.js: read-only entry links
    (`link.readOnly`), so the calendar won't edit or duplicate them and
    "Open in <group>" goes to the shift.
  - Calendar list: My calendar, an `hr.calendar-sources__divider`, the
    group calendars (`.calendar-sources__list--groups`), then **Select all**
    (disabled when everything's shown); the same in a group calendar's
    "Show my other calendars".
  - Event Share box (later, Nov 20): centered with rounded corners on every
    screen size (no more phone bottom sheet), "Send in 3den" → "Messages",
    Text and Email removed (css/events.css, js/events/event-share.js).
  - Event pages lost **Sign-ups** and **Rides** (later, Nov 20):
    js/events/event-rides.js and renderSignups are gone, the sections are
    out of SECTION_LABELS (normalizePage drops them from saved layouts),
    event bundles no longer add sign-ups, the Feed's "Needs you" no longer
    asks about event sign-ups, and thank-yous don't read them. Old
    `event.signups`/`event.rides` data is just ignored. Post sign-ups
    (Board, Feed) are unchanged.
  - Groups' public pages: Carousel's spaceKinds now include groups; the
    library (renderModuleList(kind, { publicTab })) puts General feed and
    Carousel first under "For your public page" when the tab being edited
    is public (`isOnPublicTab`). test_group_public_feeds.
  - Invite links signed out: join-page.js shows only "Create an account and
    join" (no "Show my blog to the members", no Not now). The guest has a
    username ('guest'), so blog-choice.js's hasBlog now also checks
    !isGuest. test_join_link_signed_out.
  - The blog question (header bar, join-page checkbox, settings section)
    now needs `hasSetUpBlog(member)` (js/state/groups.js): a blog space
    owned by them, not just a username. New accounts have none until they
    say yes on the Blog tab. test_blog_question_new_account.
  - Feed and friends for everyone (Nov 22): needsFullAccount() no longer
    gates the Feed or other people's blogs (isTheirs counts someone else's
    blog); only route.blogUsername === me.username, groups they aren't in,
    and the empty Groups tab. needsBlogWelcome() only on their own blog
    address (it used to show "Dive into 3den?" on the first Feed visit);
    renderBlogWelcome is now "Start your blog?" [Start my blog] [Not now →
    #feed]. account-page.js: `social` (Feed settings, Instagram) is for
    everyone who uses blogs; `blogger` (blog settings) excludes quick
    accounts. test_feed_friends_for_everyone; test_two_tabs_and_blog_start
    updated.
  - Onboarding tutorial (latest Nov 21): js/onboarding/tutorial.js replaced
    joined-tour.js. syncTutorial() runs in main.js after each draw;
    stepCard(tour) has one case per board step id (A1, A2, ATAB, B1, B2, C1,
    C2, APP, WAIT, H0–H3, E2, P1, P2a, P2b, P3, N1, G1, G2, V1, V2, M1, M2,
    END) and returns the card, or null when the step doesn't show on this
    page (it waits there). Progress: member.onboarding.tour { at, i, since,
    paused, was, lane, p1, base, from, groupId, eventId, host, myEvents,
    after, appNext, mods, done }. maybeStart(): accounts under an hour old;
    lane from onboarding.source (group A, event B, friend/blog C, direct E
    after the splash, anything else straight to WAIT). onboarding.itemId
    now keeps a friend link's inviterId. R1: a visit is a browser session
    ('3den.tour.visit'); paused, or a step set before this page load, asks
    on the next visit; Resume → goToStepPage(at). G2 waits for
    isGroupSetupOpen() (group-setup.js). Outlines re-apply every 500 ms,
    also when a redraw resets the element's classes (the RSVP buttons do).
    body.has-tour-card pads the page by the card's height. The group
    welcome checklist hides while a tour is going. replayTour() (Help)
    starts at H0 for anyone, making an onboarding record if needed.
    A2's words per module (MODULE_LINES) are on the board's panel "A2 ·
    What the card says for each module" (e130; cards e132–e150, one per
    module a group's page can have, "**Name** · type" then the quoted
    words): when Leo edits one, copy the quote into MODULE_LINES.
    Card words follow the board, except: G1 says "Give it a name. You can
    change everything later." (no type to pick any more); C1's text is
    mine (the board's reads "Make an account to ."); E2's title is "Where
    to start" (the board's is the question). New: js/events/event-ics.js
    (Add to calendar on event pages, Going or Maybe). Previews: four lanes
    (no organizer, no follow). layout-tab.js templates use only modules the
    page offers (modulesOf). test_onboarding_tutorial (every lane, ~3 min);
    test_tour_resume_and_vault_drop reworked; test_joined_tour removed.
    Known: test_quick_join_audience fails at line 29 on the code from
    before Nov 21 too (not from this work).
  - Vault drag-and-drop: enableFileDrop(target, { onFiles, folderName,
    isFolder }) in vault-parts.js, on the card's container and the page's
    grid; rows carry data-item-id so a drop on a folder goes into it.
    test_tour_resume_and_vault_drop.
  - Tabs in edit mode: makeTabDraggable() in space-header.js (pointer
    events; link.draggable = false so the browser's own link drag doesn't
    swallow the pointer; the drop spot is row-aware since tabs wrap on
    phones) → moveTabTo(tabId, index) in store.js (Home stays first; returns
    whether it moved). Clicking the open tab renames it; the rename box's
    blur saves on a timeout and only if the box is still on the page (a
    redraw draws a fresh one). The old List module is hiddenFromLibrary.
    test_tab_drag_rename (desktop and phone).
  - Chat module card: createThreadView({ compact: true }) leaves out the
    disappearing-messages select and hides the bar unless it's on (then
    it just says so). The full page and Messages keep the setting.
    test_chat_card_no_timer.
  - Create a group: the template picker now comes before Who can see it and
    How people join (new-group-page.js); picking a template still sets them
    until you touch them. (Superseded below.)
  - Create a group, later Nov 20: no template picker and no access choices.
    One question, "Do you want a searchable, public page for this group?"
    (radios new-public no/yes). Always joining 'invite'; no → private with
    the 'friends' template, yes → public with the hidden 'public-page'
    template (chat + calendar on the Private tab, generalfeed + events on
    the Public tab, via createGroup's two-tab split). Templates remain for
    sample data and Settings → Layout. test_new_group_order rewritten;
    test_group_setup and test_group_setup_access (now in Group settings)
    updated.
  - Group setup (later Nov 20): createGroup({ setup: true }) makes the tabs
    only: private → [Home]; public → [home "Public" (public): upnext 8×14 +
    events 4×14] and ["private" "Private"]. new-group-page.js then calls
    startGroupSetup(groupId) (js/groups/group-setup.js) instead of the
    group tour: a modal picker of setupChoices() (group modules minus
    hidden, unavailable, and vaultfile; Up next and Board picked), then
    addPickedModules onto membersTabOf(group), goTo that tab, edit mode
    on, and tip cards (desktop: .module-frame__drag-strip, then
    .resize-handle; phone: .mwidget__grip). State in sessionStorage
    '3den.groupSetup'; syncGroupSetup() in main.js; leaving the group ends
    it. group-tour.js is no longer started anywhere. test_group_setup_flow
    (desktop and phone).
  - Preview as a new user (sign-in page): js/account/preview-as-new.js,
    PREVIEW_PATHS + startPreview(id). Accounts get `preview: true` (kept
    out of renderDemoAccounts). Paths: group (supper24, addMember via
    link), event (band-ev-2, applyRsvp going), friend (befriendByLink from
    @jamal), follow (porchlights), organizer (#new-group), direct.
    test_preview_as_new.
  - Module lists (latest Nov 20): js/modules/module-lists.js holds
    BASICS, LESS_COMMON, NOT_ON_PRIVATE_PAGE, offeredOn(type, kind,
    {publicTab}), splitForList, and inListOrder. Group basics: announcements,
    upnext, calendar, chat, vault, todo, vaultfile. NOT_ON_PRIVATE_PAGE:
    events, articles, generalfeed, textfeed, relationship, survey,
    carousel; filtered on any group tab that isn't public (library.js),
    in setupChoices() (now in list order), and in Settings → Layout when
    the first tab isn't public. Chat description changed; Survey moved
    into NEW_MENU_ENTRIES (seven on top). test_private_page_modules;
    test_group_setup_flow, test_vault_new_menu, test_file_from_vault, and
    test_group_public_feeds updated.
  - Module review (latest Nov 20): Leo checked every module against four
    pages on https://claude.ai/artifact/CZcGaoMofgMdeSpcrgkLzs (slug
    5da20f9c-f690-4e73-948b-c46e59376fd0; his checks are db docs
    picks/<type> {groupPublic, groupPrivate, homepage, blog, note}; source
    in /home/claude/module-matrix). module-lists.js now has OFFERED_ON
    (replacing NOT_ON_PRIVATE_PAGE) and pageKey(kind, {publicTab}); types
    not in it fall back to spaceKinds. About and gallery got spaceKinds
    ['blog','group']; About renders renderForGroup on a group (editDetails
    edits). createGroup setup public tab: generalfeed 8×14 + events 4×14.
    The library's flat-list fallback keeps the basics order.
    test_module_offers; test_file_from_vault, test_imports_library_
    notifications, test_tab_drag_rename, test_simpler_modules_and_themes,
    test_group_setup_flow, and test_private_page_modules updated.
  - Preview as a new user, reworked (latest Nov 20): startPreview(id) now
    only navigates, signed out (clears the joinedTour and groupSetup
    session keys, setAfterSignIn('#new-group') for organizer): group
    #join-supper24, event #event-band-ev-2, friend #hi-jamal, follow
    #space-porchlights, organizer #signup, direct #welcome. No preview
    accounts are made. renderFirstVisits and its CSS are gone.
    mobile-widgets.js's hashchange handler tolerates guest.js's hand-made
    HashChangeEvent (no oldURL/newURL), which threw "Failed to construct
    'URL'" after every sheet sign-up (it also fixes
    test_two_tabs_and_blog_start). test_preview_as_new rewritten (walks all
    six through sign-up); test_add_menus expects Event in the Board's Add.
    Known: an open sign-up sheet stays up if you navigate away without
    closing it (it lives in guest.js, which has the stray edits).
  - Uncommitted, not mine: at 15:23–15:24 someone edited
    js/onboarding/guest.js and js/groups/join-page.js to drop the quick
    sign-up (for invites and event RSVPs). Nov 22, Leo chose invites only:
    join-page.js's edit (no `quick: true`) is committed, so invite links
    make a full account (the board's AK). guest.js stays as committed, so
    answering an event keeps the quick sign-up (BK). The guest.js edits
    are still in the working copy, uncommitted: discarding them was
    blocked here, so Leo can discard them (git checkout -- js/onboarding/guest.js)
    or keep them. Never stage or publish them.
  - Tests: test_shift_details, test_calendar_sources_list;
    test_share_events_posts' Board part now uses Add → Event.
- **Chat channels and Lists in Tasks (Nov 20):**
  - Chat: data `{ conversationId (# general), channels: [{ id, name,
    conversationId, createdBy, createdAt }] }`; each channel is
    `createModuleConversation({ spaceId, moduleId, name })`, so it's a group
    conversation (everyone in the group) listed in Messages. chat-card.js
    keeps the open channel in a module-level Map shared by card and page,
    sets `setExpandTarget(channelId)` and reads `takeFocusRequest()` on the
    page; `canManageChannels` = canManageRoles. Deleting a channel calls the
    new `deleteConversation()`. Unread across channels: `chatUnreadTotal`
    (module-swiper chip, widget summary).
  - Lists: the grocery module is `available: false`; Tasks' `view: 'lists'`
    renders grocery-lists.js `renderLists` with `listsContext()`, which
    saves only lists/items/history into the Tasks data. Upgrade v72 turns
    `type: 'grocery'` modules (and vault files) into todo with `view:
    'lists'`; demo data, templates, starter layouts, and the shared-list
    suggestion (which now passes `data`) were changed to match. Widgets use
    the grocery summary when a Tasks module is on Lists.
  - Tests: test_chat_channels.py, test_lists_in_tasks.py (and updated
    test_item_overlays, test_many_lists, test_mobile_widgets,
    test_vault_new_menu).

- **Vault editors, calendar sharing, posts with events (Nov 18):**
  - Vault: ITEM_KINDS note label is "Document" (kind stays 'note'). Rows use
    `moreMenu()` (js/ui/more-menu.js; floats via followAnchor). The card
    opens every file inline (module files with their card renderer:
    `renderModuleFileView({ compact })`) and calls `context.setExpandTarget`;
    module-frame's expand reads `expandTargetOf()` (before leaving edit mode,
    which redraws the card) and passes it as a focus request. The vault page
    renders `renderFullEditor` (vault-full-editor.js) for notes/module files
    with `.vault-page.is-editing` hiding the tree and toolbar; documents use
    the Note module's renderFullPage through `documentContext()`.
  - Calendar views: `onCreateAt` is double-click now; `onTapEmpty` is the
    single click (phones: go to the day). The card counts two clicks on the
    same day within 450 ms itself (its redraw detaches the button, so no
    dblclick event arrives).
  - Entries: People field = people search (messageablePeople + members) on
    attendeeIds, any calendar.
  - Sharing: `event.sharedGroupIds`; coHostedLinks includes them; Upcoming
    events in a group reads its calendar's linked items; myUpcoming and
    canViewEvent count them. Share → Messages (was Send in 3den) adds recipients to inviteeIds when
    `canEditEvent || visibility !== 'invite'`. Entries: openEntryShare.
  - Board composer: eventAttacher + askAttacher always (RSVP only with
    withAsks); post.eventId → renderEventStrip (card, page, Feed). Feed
    composer: sign-ups as attachment `{ kind: 'signups', signups }`,
    rendered by renderPostSignups with renderAsks. Board "+ Post" is last in
    `.board-card-body` (a column), sticky at the bottom while closed.
  - Tests: test_vault_full_editor.py, test_share_events_posts.py.

- **Security tabs (Nov 18):** js/state/security.js holds `member.security`
  (passkeys, twoStep, passkeyUnlock, recoveryKeyAt, previews, disappearing,
  newDeviceAlerts, leaveNoTrace) and `space.security` (encrypt,
  requirePasskey, history, inviteExpiry, disappearing, publishFiles), with
  defaults. Account → Security (security-section.js; Password moved there;
  the recovery words and authenticator key are module-level, never saved,
  because saving re-renders the page). Group → Security (security-tab.js,
  canManageRoles). Wired: `chatStartFor()` in thread-view hides group chat
  messages from before a member's `space.joinedAt` (founders without a join
  date see all); the group's disappearing choice calls `setDisappearing` on
  its Chat modules' conversations; your disappearing default seeds
  `openDirectConversation`; `passkeyNeededIn()` drives the notice in
  space-header.js. Settings only (for the backend): encrypt, inviteExpiry,
  publishFiles, previews, leaveNoTrace, passkeyUnlock, newDeviceAlerts.
  Test: tests/test_security_tabs.py.

- **Phone order, Big widgets, and native snapping (Nov 18):** the phone
  numbers on module frames (`renderPhoneNumber`) and Layouts → Reset phone
  order are gone; swipe order = widget order (`phoneOrdered(naturalPhoneOrder())`,
  which the widgets and grid.js share; widgets flow in a 2-column grid
  without dense packing, so list order is top-left-to-bottom-right).
  `setPhonePosition` stays for Edit mobile's ‹ ›. Widget size `'big'`:
  span 2, min-height 192px, `widgetSummary(…, 'big')` merges `MORE[type]`
  (`more` lines, or more chips/lines). Snapping is now CSS
  (`html.phone-module-snap:not(.phone-widgets)` scroll-snap mandatory,
  header and `.module-grid.is-swiping` snap targets); `softSnap()` and its
  scroll/touch listeners were removed because the snap came after the
  scroll. long-press.js: a hard press needs pressure to rise 0.35 above
  the start after 120 ms (some screens report 1.0 for every touch, which
  made drags on the month grid open the sheet). Tests: test_phone_order.py
  (rewritten), test_phone_calendar_sheet.py (touch drags via CDP).

- **Calendars, hosts, and the phone module view (Nov 18):**
  - A group item you add shows on your homepage calendar: the calendar's
    `assignments.isAssignedTo` counts `createdBy` (and `cohostIds`), unless
    the person is in `event.hiddenFrom` ("Show on my calendar" in the
    editor, shown on group calendars via `mineToggle`).
  - Hosts: `js/events/event-hosts.js` (`hostsPicker`) in the editor (events
    only), the step-by-step planner, and the event page's host tools.
    `event.hostGroupIds`; `canEditEvent(event, id)` in js/state/events.js
    (creator, co-host, or member of a hosting group) gates editing on the
    calendar page, Upcoming events, and the event page (where it also means
    host tools), and `canViewEvent`. `isHostOf` stays people-only so the
    Dashboard and calendar feeds don't call every group member a host.
    `receivesLinkedItems` now also says yes to a group's first calendar,
    which gets `coHostedLinks()` (events elsewhere naming the group); the
    calendar page drops duplicates by id.
  - Phones: `js/ui/long-press.js` (touch/pen, 500 ms, swallows the next
    click and the context menu); views take `onLongPressAt`. On the full
    calendar page a phone tap on an empty day goes to that day.
    `js/events/event-sheet.js`: `openEventSheet` (event page, or entry
    details + Edit in place) and `openNewItemSheet`; a modal.js dialog
    (class `phone-sheet`) that pushes a history step and closes on
    popstate or hashchange.
  - The module view: in groups and homepages `fillScreen()` sizes modules
    from the top bar down and sets `--snap-top`; entering the swipe view
    (`showModuleAt` or the switch to swiping) scrolls the header out of
    view; `softSnap()` settles the page after scrolls/touches end (from
    the module it takes 45% of the header to reveal it; from the header a
    16 px nudge returns; replaced the same day by CSS scroll snapping, see
    above). Tests: tests/test_calendar_hosts_mine.py,
    tests/test_phone_calendar_sheet.py; test_calendar.py expects the sheet.

- **Editing controls in the header (Nov 17):** while editing, the page
  header shows `editingControls()` (Layouts, Preview, Done editing) from
  js/editor/edit-bar.js instead of Edit; the bottom bar is gone (the file
  keeps its name). Layouts is the old layout menu opening downward
  (`.layout-menu--down`), with Featured / Fit to content (Reset phone order was removed Nov 18)
  under the layouts (`layoutExtras()`). Preview: groups use
  `setMemberView(true)`; other pages set `previewSpaceId` and leave edit
  mode; `isPagePreview()` makes the header show `previewControls()`.
  `initEditBar()` ends previews when you leave the page and toggles
  `body.is-editing-page` (hides the floating +). The header redraws on
  'layout' while editing. Test: `test_edit_controls.py`; five tests moved
  off `.edit-bar`.

- **File from vault; Canvas deleted; My Homepage's list (Nov 17):** Document,
  Spreadsheet, and Presentation are `hiddenFromLibrary` everywhere; the
  vaultfile module is now labeled "File from vault" and in the list. Its
  library click opens `openVaultFilePicker()` (js/editor/vault-file-picker.js;
  `vaultsFor()` moved there; any file but folders); dragged on, it starts
  empty with "Choose a file". A vault note renders through `noteModule`
  with `documentContext()` (name ↔ title, html, updatedBy/At), so it is the
  Document module; note.js skips its blog poll when the module isn't a real
  'note'. Module types can give `iconFor(module)` for the frame icon.
  Announcements, Forum, Submissions are `spaceKinds: ['group']`.
  `BASICS` is per kind (personal: Dashboard, Calendar, Upcoming events,
  Tasks, Vault, File from vault, Budget, Gantt chart, Recent groups).
  Canvas files and module removed; MIGRATIONS v69 drops Canvas modules,
  Canvas vault files, and removed Canvas copies (DATA_VERSION 69).
  Templates (page-templates.js, starter-layouts.js) still create Document
  modules directly. Test: `test_file_from_vault.py`; four older tests
  updated (vault + New order, library, many lists).
  Leo's Nov 17 vault batch and header controls are both done (see below).

- **Blog shown or hidden per group (Nov 18, morning):** `member.blogHiddenIn`
  and `member.blogChosenIn` (groups.js). Applied in directory-page, thread-view
  (group chat author link), feed-post bylines (when `spaceId` is a group), and
  the blog About's In list. The question shows in space-header for groups whose
  `joinedAt[me]` is on or after Nov 18 2026 and unanswered. Test:
  `test_blog_in_groups.py`.

- **Group Board (Nov 18, morning):** Leo chose design 1 of the board mockups
  (canvas "3den: mobile module layouts", row 2) and asked: replace
  Announcements; admins pin with a duration; everyone posts with a + by
  default, admins can change that; posts go to members' Feeds by default.
  - Kept the `announcements` type (no type migration); label "Board". Data:
    `post.pin = { until, by, at }` (normalizePost turns old `pinned: true`
    into a pin until unpinned), `toFeed`, `likes`, optional `title`;
    `isPinned`, `pinLabel`, `makePin`, `PIN_DURATIONS`, `postName`.
  - Posting = the existing `postAnnouncements` permission (relabelled "Post
    on the board", members by default); pinning = `pinPosts` (admins). The
    full page's "Who can post" calls `setPermission`.
  - Feed: `collectGroupItems` adds kind 'boardpost' (not your own, not
    `toFeed: false`); `renderBoardItem` in feed-page.js.
  - The card doesn't redraw when data changes from elsewhere (as before);
    an expired pin moves on the next draw.
  - Migration 71 renames modules titled "Announcements" to "Board".
  - Test: `test_group_board.py`; six older tests updated for the new markup.
  - Leo also asked (not done yet): a Budget overhaul proposal with mockups,
    and whether Lists should become a Tasks view (I suggested a Checklist
    view and offered to do it).

- **Aliases removed (Nov 18, morning):** Leo decided aliases were a bad idea;
  the alias commit was reverted (no `memberIn`, `aliasIn`, Names section).

- **Phone editing, sweep fixes (Nov 18, late night):**
  - Leo: widgets-then-modules is the only phone layout for groups and
    homepages. `isPhoneEditing()` (mobile-editor.js) makes editing on a
    phone the widget editor (no toggle, no frame, plus × via the newly
    exported `handleRemove`); edit-bar's `layoutsControl` returns null there.
    The editor's drag listens on the document (moving the cell dropped
    pointer capture).
  - Sweep (`tests/sweep_menus_and_choices.py`, ~10 min; it skips popups far
    from the clicked button). Fixed: post/person "…" menus, choice menus,
    member picker (all via `placeMenuOnScreen`, which now takes
    `{ align: 'end' }`), tab rename Escape/blur double finish (the
    removeChild error), the locked calendar checkbox. Remaining reports are
    false alarms: redrawn app-bar wrappers, checkboxes in closed details,
    a toast, and pages where Leo isn't an admin.
  - Tests: `test_phone_widget_editing.py`; `test_edit_controls.py` expects
    no Layouts on a phone for groups and homepages.

- **Chat on the page, From groups undo (Nov 18, night):**
  - Phones: the chat module is swiped to like any module (the
    `.module-strip__chat` button, `has-phone-chat`, and its CSS are gone);
    its chip carries the unread badge (`chatUnread`). The chat widget opens
    the swipe view too.
  - feed-needs.js: answered RSVPs leave `collectAsks`; every answer calls
    `answered(text, undo, redraw)`, which keeps `lastAnswer` for the Undo
    line (`undoLine`, 30 s); undo restores a snapshot of the event
    (`restoreEvent`) or module data. `keepOrder` freezes the order shown
    this visit so the next item moves up. Default limit is 2.
  - Tests: `test_from_groups_undo.py`; `test_phone_chat_button.py`
    rewritten; `test_dashboard.py` and `test_feed_grid.py` tap a widget at
    phone width.

- **Phone widgets and Edit mobile (Nov 18, night):**
  - Leo's call: on phones a group opens on widgets (layout C on the
    "mobile module layouts" canvas), tapping one opens the swipe view (A).
    `mobile-widgets.js` owns the view state ('widgets' | 'swipe'): reset to
    widgets on any hashchange that isn't to or from a module page; a tap
    pushes a history entry (`phoneSwipe`) so Back returns; popstate counts
    only when the hash didn't change. It sets `html.phone-widgets`, which
    hides #homepage-grid, #module-strip, and the dots (css/widgets.css).
  - `module-swiper.js`: `showModuleAt(id)`; in groups no List toggle and a
    Widgets button that dispatches `3den:widgets`; swipes with one module.
  - Order = `space.mobileOrders` (existing); sizes = `space.mobileWidgets`
    (`widgetSize` defaults wide for upnext, feeds, grocery, forum, events,
    kanban, gantt, budget). `resetPhoneOrder` clears both.
  - `mobile-editor.js`: Edit mobile toggle (groups, computers), drag by grip
    (own pointer code), ‹ › via `setPhonePosition`, Small/Wide/Big.
  - Widgets use `data-widget-id` (not `data-module-id`, which other code
    looks up). Chat widgets open Messages, like the swipe view's Chat button.
  - Later the same night: homepages too (`WIDGET_KINDS` in
    mobile-widgets.js; Dashboard, Recent groups, board, File from vault,
    and personal Upcoming events summaries). Blogs keep swipe and List.
  - Tests: `test_mobile_widgets.py`; `test_phone_chat_button.py`,
    `test_phone_scroll_chain.py` (now on blogs), and
    `test_add_menus.py` updated. `tests/sweep_menus_and_choices.py` is
    written but paused (Leo asked for the mockups first); run it next.

- **Group setup, Add menus, and Copy layout (Nov 18, later):**
  - Create a group: no access choice is disabled any more; `reconcileAccess`
    (settings-page.js) moves the other choice and says so in `.access-note`
    (also on Group settings → General). Checked choices are highlighted
    (`.settings-choice:has(input:checked)`). `joiningAllowed` is unused now.
  - Announcements' "+ Add" (card and full page) is `announcementAttacher`
    (announcement-attach.js): Poll, File from your vault, Upload from camera
    roll. `post.files` holds `snapshotVaultItem` copies, shown with
    `renderFilePreview`. `pollAttacher` gained `open()`.
  - `mediaAttacher({ before, cameraRoll })`; `pickMedia('any')`. Its menu is
    `position: fixed`, placed by `placeMenuOnScreen` and kept with its
    button by `followAnchor` (both in media-attach.js); the phone tab bar's
    top counts as the bottom of the screen.
  - Up next's "+ Post" became "+ Add" (upnext-add.js): New event, From your
    calendar (`myUpcoming()` reads your homepage's calendars; the copy goes to
    the group's first calendar, else events module, else Up next's own
    `data.events`, as kind 'event', visibility 'group', you going).
  - Layouts → Copy this page's layout (copy-layout.js, `layoutOf(space)`).
    Leo's Schwartz group was made in his browser; he can paste its layout
    from there so it can become the Friends and family template.
  - Tests: `test_group_setup_access.py`, `test_add_menus.py`.

- **Vault sharing, publishing, and selecting (Nov 18):**
  - The Photo & video feed is gone; MIGRATIONS v70 turns photofeed modules
    into General feeds and old carousel slides into posts (DATA_VERSION 70).
    "Photo carousel" is now **Carousel** (feed-modules.js `carouselModule`,
    variant 'carousel', blog only): it holds General-feed posts (`postKind`
    'general') and shows them with `createPostSlideshow` (feed-carousel.js).
    js/modules/blog/carousel-module.js was deleted. Carousel posts count as
    feed posts everywhere FEED_TYPES lists feeds (Feed, Up next, Dashboard,
    tags, search).
  - Every attachment previews as a card (`summarize()` and
    `renderFilePreview`, which now handles folders, videos, and a plain
    fallback). The composer's attachment rows have ↑ ↓; the first is the
    preview when the post has no photos.
  - js/ui/document-sharing.js: `documentShareButton({vaultModuleId,itemId})`
    on every vault item and folder; three rows, each with an editor.
    Direct shares are `item.sharedWith = [{kind:'member'|'space', id, access,
    by, at}]`; `sharedAccessFor()` / `sharedWith()` in file-access.js, and
    `documentAccess` falls back to them. `openShareMany` shares several.
  - js/ui/publish-dialog.js: `publishVerb(items)` (Publish for notes,
    folders, sheet/presentation/relationship-map files; Post otherwise) and
    `openPublishDialog({entries})`: places (blog feeds, then groups folded,
    only where `postToFeeds`), a cover step for folders, then the composer.
    The Text feed isn't offered (words only).
  - vault-page.js: photo/video tiles (`.vault-media`), Select with a bar
    (Move, Share, Download, Make a copy, Post/Publish, Delete with Undo), and
    a "Shared with you" / "Shared with this group" entry in the tree.
    Downloads: notes as .html, module files as .json.
  - Decisions made without asking: a personal vault stays "Only you" plus
    direct shares; "Shared in" means pages, "Published" means posts and
    articles; Carousel is blog-only; the vault card view is unchanged;
    templates still create Document modules.
  - Test: `test_vault_publish_share.py`; `test_feed_post_nav_move.py`,
    `test_calm_follows.py`, and `test_photo_carousel_and_event_strip.py`
    updated.

- **New message: search people (Nov 17):** the To box on `#messages-new` and
  in the + menu's Message is `createPeopleSearch()` (js/ui/people-search.js):
  suggestions on focus (recent direct conversations, then friends), search by
  name or @username, keyboard and tap, chips; `multiple: false` for the +
  menu. Who's messageable, suggested, and the "Friend · Porch Lights" line
  come from js/messages/recipients.js (groups, friends, parents/children,
  `canMessage`). Friends you share no group with can now be messaged from
  New message too. Also fixed `a:hover` beating `.button--primary` (blue text
  on a blue link-button while hovered, and after a tap on phones):
  `a.button:hover` rules in base.css. Test: `test_new_message_search.py`;
  `test_quick_create_and_events.py` now types in the To box.

- **First tutorial removed; phone menus fixed (Nov 17):** Leo asked to remove
  the whole tutorial a new account sees, to design a new one. Gone: the
  "We set this up for you · Change" note, the "Next: Add your first task"
  line and its steps, suggestions, and the Dashboard's three-week newcomer
  focus with its steps and tips (deleted `js/onboarding/get-started.js`,
  `steps.js`, `suggestions.js`, `js/modules/dashboard/dashboard-focus.js`,
  the `#onboarding-slot`, `markStep()`, and their CSS). Kept: the welcome
  splash, the welcome toast, "Dive into 3den?", finishing a quick account,
  starting layouts by arrival, and groups' welcome checklist and suggestions
  (they still use `next-step.js`). **Next: design the new tutorial with Leo.**
  Also: the Edit menu in the page header opens on whichever side fits the
  screen (`keepOnScreen()`), the editing bar's Layout menu slides to fit
  (`keepMenuOnScreen()`), and a stray "null" under Porch Lights' Song status
  (vaultfile-module.js used native append with null parts) is fixed.
  Test: `test_no_first_tutorial.py`; `test_jump_next_step.py` is now
  `test_jump.py` (Ctrl+K only).

- **Scrolling (Nov 16):** scroll-flow.js leaves the wheel to the browser
  unless something in the module under the pointer has room to scroll that
  way (a stroke it took, it keeps: STROKE_GAP_MS). Fixes the clunky feel on
  single-module pages. Tests: `test_scroll_single_module.py`;
  `test_scroll_flow.py` now strokes past the module's own length.

- **Your data survives updates (Nov 16):** one storage slot for good
  (`3den.homepage-prototype`; the old `.v67` save is moved in on first load),
  and js/state/upgrade.js merges new sample content into older saves (by ids
  not seen before) instead of wiping them. A toast says "3den was updated.
  Your data is all here…". Demo ids are now the same on every build. Test:
  `test_data_carries_over.py`. Full suite: 112 of 114 pass
  (test_bigger_demo's thin groups; test_scroll_flow was a stale test, fixed).

- **RSVPs keep the view still (Nov 16):** rsvpButtons wraps every answer in
  keepPlace (scroll positions restored, the pressed button kept where it was,
  focus back on it). Reminders and follows now emit the store's new 'person'
  event instead of 'account' (which made main.js redraw everything, closing
  the calendar page's event panel). Test: `test_rsvp_keeps_place.py`.

- **Who's on a task (Nov 16):** js/ui/task-people.js on the task pop-up, the
  to-do panel, and board card panels: faces and names, "I'll take it" /
  Leave, and Assign. Tasks and cards keep `acceptedIds`; "assigned you"
  notifications have ✓ / ✕ (`answerAssignment` in notifications.js; ✕ removes
  you and sends the assigner a 'declined' notification). Test:
  `test_task_people.py`.

- **Attachments first (Nov 16):** writing or editing a post, announcement, or
  forum thread/reply puts what's attached above the text box (feed-post.js
  renderEditor, feed-composer.js, announcements-page.js, forum-page.js;
  growing text boxes: js/ui/auto-grow.js). Photo and video tiles show their
  words only on hover. Test: `test_composer_preview.py`.

- **Documents, articles, and the New post box (Nov 16, afternoon):** vault
  documents have a Sharing button (js/ui/document-sharing.js): who can open it,
  group members' access (`item.memberAccess`, enforced by `documentAccess` in
  file-access.js, the note view, and createItemContext), every share with its
  access, and publication status. Articles count views and readers
  (`countView`; authors and moderators see them). The New post box grows with
  its text and shows a full preview card on top once anything is added.
  Tests: `test_document_sharing.py`, `test_composer_preview.py`.
  (`test_bigger_demo.py` flags three thin demo groups; demo data, not these changes.)

- **Posts and layouts (Nov 16, later):** an opened General-feed post has
  Previous post / Next post (photo-viewer.js), hidden at the ends. Articles say
  "Article" in posts and tiles. Posts drag between feeds on
  the same page, or "Move to" from the … menu (feed-move.js; pointer events,
  like module drags, not HTML drag-and-drop). The featured module in
  Spotlight and Main and sidebar has a resize handle: it sets
  `pageLayouts[tab].featuredRows` (`setFeaturedRows`), and "Fit to content"
  clears it. Tests: `test_feed_post_nav_move.py`, `test_featured_height.py`.

- **New homepages and a customizable Dashboard (Nov 16):** every new account's
  homepage is the Dashboard and the vault, half and half (6×14 each;
  `STARTER_LAYOUTS.standard`). The Dashboard's full page has **Customize**:
  a checkbox and ↑ ↓ for Coming up, For you, Your tasks, and Your groups,
  saved as `data.sections` and used on the card too; Reset to the usual.
  Test: `tests/test_standard_homepage.py`.

Sample-data reset (Leo, 14 Juniper Lane, Juniper Tenants Union, Porch Lights,
Eastside Mutual Aid, Larsen Family, Urban Policy 210, three public groups,
and the invite-only Juniper Supper Club); forum settings; List module; chore
wheel rework; blog feeds; likes, comments, Send; calendar entries vs events;
calendar source filter; polls everywhere; sleeker calendar and event editor.

Batch of Nov 15 (late):
- **Saved data in IndexedDB** (database "3den", store "state"; a token in
  localStorage, so `localStorage.clear()` still resets). `readSavedState()`
  waits for writes in flight.
- **Feeds:** a "New post" button on the module's title line opens the
  composer in a pop-up (`js/ui/modal.js`, a native `<dialog>`).
- **Blog Edit** has no menu; in edit mode, click the name or About.
- **Vault "+ New":** Note, Spreadsheet, Presentation, Article, Upload
  files, Folder, then More (List, Tasks, Relationship map, Gantt chart,
  Survey, Link). Canvas was removed Nov 17. Calendar and Forum are no longer made as vault files
  (old ones still open). An Article is `{ kind: 'note', article: true }`.
- **New modules:** Survey (`js/modules/survey/`) and Presentation
  (`js/modules/presentation/`), both in the library's Less common list and
  as vault files.
- **Group settings:** the name at the top links to the group (it used to
  go Back, which landed on the previous settings tab); no Layout tab for
  groups (homepages and blogs keep it); invite link inside Add people;
  member search and 50-per-page paging (`MEMBERS_PER_PAGE`).
- **Scrolling pages:** the scroll guard ("Click to scroll this module") is
  gone; module bodies scroll right away and hand the scroll to the page at
  their ends (`overscroll-behavior: auto`). The grid gap is 26px. Maps on a
  homepage zoom only with Ctrl + wheel.
- **Invite link** shows only as a button until clicked.
- **Create a group** is one page (no steps); access choices sit above the
  templates.
- **Scroll flow** (`js/ui/scroll-flow.js`): over a module grid, the wheel is
  handled by hand so one stroke chains from the module to the page (browser
  scroll latching dropped the rest of the stroke).
- **Upcoming events page** has a month calendar of your events beside the list.
- **Starting pages** (Nov 16): new homepages use `STARTER_LAYOUTS.standard` (Leo's); `layoutForArrival` always returns it. Group templates have two small modules each; Up next starts 12 × 7. Test: test_standard_homepage.
- **Item overlays** (Nov 16): js/ui/item-overlay.js (`openTaskOverlay`, `openListItemOverlay`, `openEventOverlay`) on the Tasks, List, and Calendar cards; redraws wait a frame (a change fires on blur). Test: test_item_overlays.
- **Many lists** (Nov 16): grocery data `{ lists: [{ id, name, items, history }] }` (old `{ items, history }` reads as one list); `listContext()` hands the old card/page renderers one list. vaultfile `data.listId` opens a list. Test: test_many_lists.
- **Phone order** (Nov 16): `space.mobileOrders[tabId]`; `phoneOrdered(naturalPhoneOrder())` decides the phone stack in grid.js. Test: test_phone_order. Resizing in layouts is live (resize.js). The Modules panel has a bottom border.
- **Shared file access** (Nov 16): `attachment.access` / vaultfile `data.access` = view | comment | edit; comment/edit read the live vault item via `attachment.item.from`; comments on `item.comments`. Test: test_shared_file_access.
- **Calm follows** (Nov 16): `feedSettings.calmFollows` (default on); `calmFollowed()` keeps one post a day per followed group and at most 25% of the All view. Test: test_calm_follows.
- **Child accounts** (Nov 16): `member.child = { parentIds, birthYear }`,
  `state.childRequests`; `addMember()` returns 'asked' for a child unless
  `parentOk` or the current user is their parent. Search, Explore, and
  messages check `isChild` / `canMessage` (js/state/children.js). For the
  backend: real age checks and verifiable parental consent (COPPA in the US,
  GDPR-K in the EU) need a lawyer's review. Test: test_child_accounts.
- **Page layouts** (Nov 16): `space.pageLayouts[tabId] = { kind, featuredId }`,
  12 kinds in js/editor/page-layouts.js (`arrange()` returns rows of columns
  with frame modes fixed/grow/fill/tile); grid.js draws them and handles drops
  (`setFeaturedModule`, `placeModule`); module.slot remembers left/right or
  main/rail. Picker in edit-bar.js. Mockups: design canvas
  https://claude.ai/artifact/VTCuFiQAwVfD7NWSAFcRoM. Test: test_page_layouts.
- **Group templates** (Nov 16): four `featured` (friends, community, online,
  business), then See more (club, class, organizing, news, nonprofit, faith,
  trip, hobby, house, forum, blank). `family` and `other` are `hidden`: not
  offered, still valid for old groups and sample data.

Latest batch:
- **Quick fixes:** RSVP buttons in the calendar card's "Coming up"; members
  notified of new announcements and events, with a per-group Mute; the
  "NaN days ago" starter note fixed.
- **Public tabs** (a group's tab can be public; visitors see just those,
  read-only, and can RSVP to public events) and **feeds in groups**. Porch
  Lights' Home is public.
- **Invite only** groups, member invitations (Accept/Decline on the Groups
  page), and **invite links** (`#join-<code>`), including sign-up first.
- **Top bar:** Feed and My blog merged into one **Blog** tab, with
  Feed · Friends · My blog tabs on the Feed page and every blog.
- **Dashboard** module on the personal homepage: Needs you, Your groups,
  From friends.
- **Note editor** reworked into a word-processor-style editor (style menu,
  lit-up buttons, checklists, links, tables, typing shortcuts, word count,
  save state, a document-like full page with Contents).

Batch of Nov 14 (ideas 49–77 and Leo's requests), all published:
- Done and published earlier today: 49 shorter needs box, 50 Account settings
  in sections, 51 group settings with More, 52 … menus, 53 three items per
  card, 54 grouped Feed posts, 55 no repeated group names, 56 one "+" (shown
  only on the Feed, Leo's call; Ctrl+K still offers New post/event/task),
  57 event defaults from the group (no tag guessing), 61 quick add in plain
  words, 77 bundles, the Groups tile gallery, and no page themes.
- Done (see README "What works", top rows): 58 edit in place, 59 Undo,
  60 join with name and phone, 62 Ctrl+K, 63 Back, 64 plain words (Help
  glossary, fixed paths), 65 editing bar and member view, 66 one next step,
  73 who-sees-this chip, the scroll guard, the forum template, the simpler
  to-do list, and Articles.
- Also done: 67 friends first, 68 say thanks (on blogs, no counts),
  69 "Your week" (#week, a Feed card on Sundays), 70 "I can help with",
  71 regulars, 72 rides, 74 met in person, 75 download or delete everything,
  and 76 group health. All of 49–77 is in.
- `js/onboarding/tips.js` was removed (one next step replaced it).
- New saved data: `state.thanks`, `state.vouches`, `member.helpWith`,
  `event.rides`, `event.rsvpAt`, `event.pastVisits` (sample only).
- Also done: connecting outside calendars (Google, Apple, Outlook by iCal
  address, or an .ics file) and "You're free / Clashes with …" on event
  cards (`js/state/external-calendars.js`). Not yet: showing those outside
  events inside My calendar (the calendar module's linked-item code assumes
  every item lives in a 3den group, so it needs a read-only item kind).
  For the backend: fetch and refresh calendar addresses on the server
  (browsers are blocked by most calendar services), and consider Google
  and Microsoft sign-in (OAuth) for two-way sync.
- Storage key is v57.

## Scope

Leo decided to keep the full vision, social layer included ("The dream is
alive"). The scope proposal is still in the plan doc for reference.

## Queue

**Done and published (Nov 14):** Leo's picks from ideas 78–107: 81 lighter
blog header (About panel), 83 shorter Feed headlines, 88 one Edit menu, 90 the
reminder bell, 91 one word per action, 93 a newspaper icon for Articles, 95 one
chip style (`css/chips.css`), 97 grouped notifications, 100 repeating tasks,
101 select several tasks, 102 a QR code for invite links (`js/ui/qr-code.js`,
no library, checked with OpenCV), 105 the "?" shortcut sheet, and 106
scheduled articles with edit history. Test: `tests/test_queue_78_106.py`.

**The year simulation (Nov 14):** `js/data/demo/year-model.js` models 300
people moving to 3den and a year of invitations, groups, leaving, and feedback
(34 themes), plus ten what-if changes. `node scripts/build-year-demo.mjs
[summary.json]` writes `js/data/demo/year-data.js` (24 groups, 563 people,
1,763 friendships, and the themes); `js/data/demo/year.js` builds them into
the sample data, including the public **3den Community** group (owner Leo)
with one forum thread per theme. The report doc is "3den: a simulated year
with hundreds of users" (https://claude.ai/artifact/2tc7ZpgiD424CGE4bvhQpD).
Its top recommendations: a calendar feed for Google and Apple Calendar, a
simpler first two weeks, Explore by place and interest, bringing your people
(contacts, group chats), and phone notifications. The sample data is now about
1.1 MB in localStorage (first load about 1.3 s).

**82 done (Nov 14):** event pages show going/maybe counts only on the RSVP
buttons; the line under them says only spots left and the waitlist, and guest
list headings have no counts (`rsvpSummary(event, { counts: false })`).

**From the report, built Nov 14 (Leo's picks):**
- **Calendar feed:** Account → Calendars → "See 3den in your other calendar":
  Add to Google / Apple / Outlook links, a secret webcal address (copy, make a
  new one, stop sharing), going or going-and-maybe, and a download of the same
  .ics. `js/state/calendar-feed.js`, `js/account/calendar-feed-section.js`.
  The address needs the server (see Before the backend).
- **Explore by neighborhood and interest:** "What are you into?" chips (saved
  as `member.interests`), a Where menu (near you, any neighborhood with public
  things, anywhere), Groups for you ranked friends → interests → nearness →
  size, with "Maya is in it" lines; events sort For you / Soonest / Nearest.
  Groups set Where it meets and What it's about in Settings → General → On
  Explore (`space.area`, `space.interests`; otherwise guessed).
  `js/state/explore.js`.
- **Bring your people** (`#bring`, account menu, Friends page): a contacts file
  (.vcf or .csv) → who's on 3den (Add friend) and who isn't (text or email
  them your link); Move a group chat (one link and message for WhatsApp or a
  text, plus a WhatsApp export to invite those already on 3den); your invite
  link `#hi-<username>` (whoever joins with it becomes your friend).
  `js/state/bring.js`, `js/feed/bring-page.js`.
- **Phone notifications:** `sw.js` (service worker: push, local shows, taps
  open the page); per-group Everything / Only things that need me / Nothing;
  quiet hours; iPhone steps to add 3den to the Home Screen; Android's install
  prompt; offered once after your first Going. `js/state/delivery.js`.
- **First two weeks (1, 3, 6):** "What brought you here?" (Someone invited me:
  paste the link; Starting a group; Just looking → Explore). Group templates
  start with three modules and suggest more when needed
  (`js/groups/group-suggestions.js`: calendar after 3 events, a chat at 5
  people, a to-do list at two weeks, Photos after an event, a shared list for
  households). Quick accounts are asked to finish their account after a
  second RSVP (toast once, then a line on event pages until done or hidden).
- **Up next module** (from the mobile redesign mockups, direction A): every
  group's first module: the next event with RSVP buttons, filter chips, "Since
  Thursday: …", and one stream of announcements, threads, feed posts,
  articles, and new events; Post opens the composer for that group.
  `js/modules/upnext/`. Mockups: https://claude.ai/artifact/Xz4YXeGrzHa4vTozunHUF7
- **Smaller:** a group feed post on the Feed says only the feed's name ("Shared
  with the union"); the + on the Feed sits 6px above the bottom bar; scrolling
  past a module's top or bottom on a phone carries on through the page; the
  photo viewer pinches and double-taps to zoom, drags to pan, swipes between
  photos, and swipes down to close; Leo's homepage and the default layout are
  Dashboard, calendar, vault.

- **Wording and order (Nov 14):** the Dashboard shows Coming up, For you (was
  Needs you), then Your tasks; the Feed's asks box is From groups.
- **Kanban → my to-do list (Nov 14):** "Add to my to-do list" in a group
  card's details; the task keeps `source: { moduleId, itemId }` and shows a
  link back (`js/modules/todo/tracking.js`). The task is a snapshot: renaming
  or finishing the card doesn't change it.
- **New post button and pop-up composer (Nov 15):** the round + on feeds is gone. `placeNewPostButton()` in
  feed-modules.js puts **New post** in the module frame's header before `.module-frame__open` (or in
  `.module-page__title-row` on the full page); not in edit mode, not for people who can't post. The composer
  opens in `openModal()` (`js/ui/modal.js`, a native `<dialog>` with `showModal()`, so focus is trapped and the
  page behind is inert and dimmed by `::backdrop`). Esc and a backdrop click call the composer's own × (keeps a
  draft). Under 640px the pop-up is nearly full-screen. Test: `tests/test_new_post_popup.py`.
- **Feed composer behind a + and drafts (Nov 14):** `member.postDrafts`
  (`js/state/post-drafts.js`), saved as you type without redrawing; polls
  aren't kept in drafts.
- **Co-authored articles (Nov 14):** `article.coauthorIds`, `editedBy`,
  `lastEditedBy`, `fromNote`; vault notes keep `editorIds` and `articleDraft`.
  Real-time co-editing still needs the backend (today: last save wins, with a
  warning when someone saved after you opened it).
- **Announcements behind + New post; search scope box rounded (Nov 14).**
- **IndexedDB instead of localStorage (Nov 15, Leo):** js/state/storage.js
  opens IndexedDB with a top-level await, so the state is still handed out
  synchronously (`loadState()`); `readSavedState()` is the async read for
  live updates (store.js `takeRemoteSave`). Saves are queued, newest wins,
  and `saveState(state, onSaved)` calls back once written, which is when
  store.js tells other windows. Each save writes a token to localStorage;
  a record whose token doesn't match is dropped, so `localStorage.clear()`
  still starts fresh (every test relies on it). Falls back to localStorage
  without IndexedDB. Room is now hundreds of MB, so the sample can grow
  again (it was halved for localStorage's limit). Test:
  tests/test_indexeddb_storage.py.
- **Event panel beside the calendar (Nov 15, Leo):** CSS only, keyed on
  `.calendar-page__layout.has-editor` (calendar-page.js already sets it).
  Test: tests/test_calendar_editor_beside.py.
- **Simpler event editor (Nov 15, Leo):** no cover patterns (`hasCover` is
  photos only), no Area select (guessed from Location), no Color picker.
  Optional fields are in `OPTIONAL` in calendar-editor.js behind "+ Add";
  Plan an event's step 4 is "Add a photo?". Tests:
  tests/test_event_editor_simpler.py, tests/test_calendar.py.
- **Two tabs, and the blog start (Nov 15, Leo):** `createGroup` gives a public
  group with joining 'admins' or 'invite' tabs Private ('home', first) and
  Public ('public'); `PUBLIC_FACING` modules start on Public. "Yes, set me
  up" on the Blog tab now lands on #feed (it was #feed-friends). Test:
  tests/test_two_tabs_and_blog_start.py.
- **Group setup, then a tour (Nov 15, Leo):** now one page
  (new-group-page.js; the two-step group-setup.js is gone, its defaults
  live in group-access-defaults.js). It asks visibility and joining
  separately, above the templates, defaulting per template
  (`ACCESS_FOR_KIND`; `joiningAllowed()` keeps a private group off open and
  ask). "What first?" is gone; js/onboarding/group-tour.js shows the new
  group (6 steps, saved in sessionStorage as `3den.group-tour`, synced from
  main.js like the Organizer demo). Test: tests/test_group_setup.py.
- **Welcome splash (Nov 15, Leo):** js/onboarding/welcome-splash.js replaces
  "What brought you here?" (`needsWelcomeSplash()` / `welcomeOnce()` in
  welcome.js, called from main.js over the homepage). Leo's words: "Welcome
  back to 3den", even on a first visit. Test: tests/test_first_two_weeks.py.
- **Account menu trimmed (Nov 15, Leo):** no My blog, Friends, Saved (unless
  blogs are off), Customize my homepage, or Create a group. Test:
  tests/test_account_menu_trimmed.py.
- **New blogs: just a General feed (Nov 15, Leo):** `createStarterBlog` in
  starters.js. Test: tests/test_new_blog_feed_only.py.
- **Simpler set (Nov 15, Leo):** themes cut to Daylight, Match my device,
  Midnight, and High contrast (an old pick falls back to Daylight).
  To-do and Kanban are one module, **Tasks** (type `todo`): `data.view`
  'list' | 'board', `data.columns`; the board code in js/modules/kanban/ is
  driven through `boardContext()` in js/modules/todo/tasks-board.js (cards ↔
  tasks; last column = done). Shared note and Document are one module,
  **Document** (type `note`, on groups, homepages, and blogs). Old types
  are moved by js/data/module-migrations.js (in demo-state.js and when a
  removed module is put back). The library's `LESS_COMMON` menu sits at the
  bottom. On phones a page's Chat module is a button at the start of the
  module chips (module-swiper.js). Leo likes **Superlist** for tasks (its
  look and how it works): use it as the reference when the Tasks list gets
  its next pass. Tests: test_tasks_list_and_board, test_simpler_modules_and_themes,
  test_phone_chat_button.
- **Module backups (Nov 14, Leo):** js/state/module-backups.js.
  `backupRemovedModule()` runs after `removeModule()` in module-frame.js.
  It writes a vault item with `removed: { at, by, type, span, rows, tabId,
  moduleId }` into the page's first vault (folder "Removed from the
  page"), or `space.removedModules` (newest 30) when there's no vault, or
  when the module removed is itself a vault. `putBack(ref)` restores either
  kind; `dropBackup(ref)` is for Undo. `hasContents()` compares a module's
  data with a fresh one, ignoring ids and timestamps. Test:
  tests/test_module_backups.py.
- **Chore wheel removed (Nov 14, Leo):** js/modules/chores/ and its CSS are
  gone. The Household template starts with a House to-do instead; the
  Larsens' "Cleanup crew" is a to-do list with one task each. Old saves
  are cleared by the storage key bump (v66).
- **Bigger sample data (Nov 14):** scripts/build-year-demo.mjs now writes
  the 40 biggest groups, their members, and one in eight of everyone else
  (835 people; it was 1,626 and 80 groups until Nov 15, when storage ran
  full), up to 8 friendships each, and each person's days active.
  js/data/demo/year.js turns that into weeks of use per group, ~200 blogs, Leo's place in four
  groups (he owns `y-grp-*` "Juniper Lane Bike Crew"), and returns
  `conversations`, `notifications`, `reactions`, `visits` (Leo's), and
  `othersVisits`, merged in demo-state.js. Module ids in these groups are
  `${spaceId}-${type}`, so they're stable. Saved state is about 1.7 MB
  (localStorage allows about 5). Encryption keys
  are now made only for the hand-made people and anyone in a direct
  conversation; the rest get keys when first messaged (`ensurePublished` in
  e2ee.js), which keeps the first load near 1.7 s. The sweeps
  (tests/test_contained_in_borders.py and the two in the runner) look at
  one in ten of the simulated groups and blogs. Test:
  tests/test_bigger_demo.py.
- **Compact From groups; nothing past a border (Nov 14):** `renderAsks({ compact })`
  in js/ui/asks.js (one row of buttons; sign-ups as a chip that opens the list);
  the From groups rows put "Not for me" as an × in a third grid column.
  `.feed-cluster__first` needed `minmax(0, 1fr)` (a photo post was wider than
  the cluster on phones). Sweep: tests/test_contained_in_borders.py (slow,
  about 5 minutes).
- **Spreadsheet rebuilt (Nov 14), and back in vaults** (+ New → Spreadsheet;
  `FILE_MODULE_TYPES` in vault-module-files.js). Data is a workbook
  `{ v: 2, active, sheets: [{ id, name, cols, rows, cells, widths, freeze,
  filters, validation, rules, charts }] }`; a cell is a raw string or
  `{ v, s }` (s = style: b, i, u, st, color, fill, align, wrap, n = number
  format). `normalizeWorkbook()` converts the old `{ columns, rows, header,
  formats }` data when it's opened. Files: sheet-formula.js (tokenizer,
  parser, about 130 functions, dates as Excel serial numbers),
  sheet-model.js (recalculation with cycle checks, insert and delete that fix
  formulas across sheets, sort, fill, paste), sheet-xlsx.js (.xlsx in and
  out with no library: a small zip writer and DecompressionStream for
  reading; checked with openpyxl), sheet-chart.js, sheet-editor.js (rows
  drawn only as they scroll into view, so big sheets stay fast). Not yet:
  merged cells, pivot tables, array formulas, and comments; .xlsx charts and
  highlight rules aren't written to the file. For the backend: real-time
  co-editing (today the last save wins). Tests:
  tests/test_spreadsheet_editor.py, tests/test_spreadsheet_vault_xlsx.py
  (tests/files/import-test.xlsx), and tests/test_spreadsheet_live.py (a cell
  typed in one window shows in another); the two older sheet tests were
  replaced.

Data version is 68 (`DATA_VERSION` in js/state/upgrade.js); the storage key no longer changes.

Done this session: the iPhone layout (tab bar, sheets, phone.html, Add to
Home Screen) and onboarding by arrival path (guest viewing + sign-up sheet,
starting homepages, setup note, Get started, tips (those three removed
Nov 17), welcome screens, group templates, suggestions, "Try a first visit" on the sign-in screen). See
README.md, "Phones" and "Onboarding new people".

Also done (Nov 13): quick accounts for event invitations (name + phone or
email, text opt-in; finish the account for groups and blogs), swiping
between modules on phones (chips above the tab bar), Oxford commas in the
app's text, group types ("Band", "News outlet"), one-way Follow on blogs
and groups' public pages, and Settings → Layout (templates for kinds of
people, or modules one at a time), and events near you (your area and
radius in Account settings, event areas and tags, Explore filtered by
distance and tags, a Directions button), "Parts of 3den you use" (blogs,
groups, and messages can each be turned off), and "Household" in place of
"Shared house".

Also done (Nov 13): group access split in two: who can see it (public or
private) and how people join (anyone, ask, invite only, or admins add
people), in `js/state/group-access.js`. Saved data key is now v29.

Also done (Nov 13): "Take a break" from the Feed for 24 hours
(`js/feed/feed-break.js`), and Create a group says "Start from a template"
(with a Blank slate, and a note that everything can change later).

Also done (Nov 13): the growth model, rebuilt for four New York starters
(musician with a band and a climate group, actor, student, line cook), with
Partiful, people leaving, recurring groups, discovery, and seasons
(`js/data/demo/growth-model.js`, `growth.js`, seed 42; 125 people). NYC
neighborhoods added to places.js. Report doc: "3den growth model: 4 New
Yorkers, 12 weeks". Saved data key is now v31. The full sweep is 195 pages.
Also done (Nov 13, overnight), from the growth model's recommendations
(Leo: "do all six, except the Partiful one; we're still competing"):
Recent groups and Recents modules; Plan an event step by step
(`#new-event`); follow on RSVP, "How was it?" follow-ups, event photos,
What's next; skip one date of a repeating event, guest links
(`#event-<id>~<code>`), sign-ups, meeting notes, an all-groups calendar;
start-your-own suggestions and one-step group creation for quick accounts;
share cards, link-in-bio pages (`#links-<id>`), and page meta. See the
README rows after the Dashboard.

Also done (Nov 13, morning): Advanced search (`#search`, js/search/search-page.js and
js/state/advanced-search.js): a query language, a filters form that writes the
same query, removable filter chips, result chips by kind, highlights, sorting,
and saved searches (also in the top bar's search menu).

Also done (Nov 13): app themes in Account settings → Theme (js/ui/themes.js,
css/themes.css): Encyclopedia stays the default, plus 14 more (Match my
device, Zine, Afterhours, Commons, Midnight, Newsprint, Sunset, Forest,
Lavender, Ocean, Library, Bubblegum, Terminal, High contrast). The
wordmark has its own token and never changes. Mockups of the first three:
the "3den visual theme explorations" design canvas.

Also done (Nov 13): every Feed item is now the same card (header with who
did what, then where and when; one text style; one picture frame; one box
for events, blog posts, and threads). On phones, the module library is a
sheet behind an "Add modules" button while editing.

Also done (Nov 13): documents shared from a vault open as previews in posts
(js/modules/blog-feeds/file-preview.js): notes, text, CSV tables, module
files (read-only), pictures, and PDFs, clipped with "Keep reading" to open
the rest in place. Two or more pictures keep their own shapes in rows of
equal height (no square crops). Juniper Tenants Union has a new General
feed, "Shared with the union", with four sample documents, and demo photos
come in shapes (`demoPhoto(name, 'tall')`). Saved data key is now v32.

Also done (Nov 13): a Share button on events (js/events/event-share.js: Send
in 3den, Copy link, Text, Email, Instagram card, the device's share menu)
and event cover images (js/events/event-cover.js, reusing the group cover
patterns and photo upload). Saved data key is now v33.

Fixed (Nov 13): phone.html's iPhone frame was squeezed out of shape in short
or narrow windows (its slot shrank the frame before scaling). The frame now
keeps its real size and scales as a whole, by height and width.

Also done (Nov 13; removed Nov 17 with the first tutorial): the Dashboard adapted to new people
(js/modules/dashboard/dashboard-focus.js): for three weeks it showed only
what they came for (their event, their group, the blog or page they
followed, their messages), with the next two Get started steps inside it
(the separate Get started card steps aside), an "Also:" line, and a tip
about another use every other day. Every starting layout puts the
Dashboard first. "Show everything" / "Back to just …" switch.

Also done (Nov 13): groups, blogs, and homepages can use any theme as their
own look (Settings → Appearance → Theme; appearance.theme, with 'theme'
values for "the theme's" font, accent, background, and corners). Visitors
see it on the whole page unless they chose their theme everywhere. Jamal's
blog uses Afterhours and the Book Club uses Library. Saved data key is v34.

Also done (Nov 13): a Budget module (js/modules/budget/) with templates:
Personal, Group event (links to an event), Organization, Shared household,
Trip, Fundraiser, and Blank. Splitting costs and settling up, a ledger,
next month or year, currencies. Samples in js/data/demo/budgets.js (house,
Thanksgiving, tenants union, Leo). Saved data key is v35; the sweep is 200
pages.

Also done (Nov 13): General feeds show posts as a List or a Grid with one
size and shape for every post (js/modules/blog-feeds/feed-layouts.js; the
owner's "Layout" panel saves data.display). The first ("Home") tab can be
renamed. A new theme, Almanac, between Encyclopedia and Newsprint.

Also done (Nov 13): profile photos (pencil button on the avatar in Account
settings → Profile; member.photo); photos and videos in chat (separate
Photo / Video), forum threads and replies, announcements, and documents
(js/ui/media-attach.js; the editor's ＋ button). Almanac now uses Newsreader
headings and is the default theme for everyone (DEFAULT_THEME in
js/ui/themes.js); Encyclopedia is still a choice.

Also done (Nov 13): a "…" menu on Feed cards and feed posts (js/feed/post-menu.js):
Why am I seeing this? (moved from the line under each card), More
information, and Report (js/state/reports.js: state.reports, notifies a
group's owner and admins).

Publishing: if the prototype artifact is ever set to public, this server
can't republish it: set it back to private (or shared with people) first.

Next ideas (not started):
1. RSVP on announcements; shorter phone pages for long modules.
2. Reminders (the event path's "remind me the day before"), which need a
   notion of scheduled notifications.
3. A real backend: accounts, invite links and guests only work in one browser.

Note: a reminder scheduled earlier for Fri Nov 13, 7 pm ("start the iOS
prototype") may still fire; that work is done.

Also done (Nov 13, evening): the Budget module reworked for shared costs:
per-expense splits (evenly, exact, shares, not shared), who paid, people
outside the group, paybacks with method, Remind, per-person history, and a
tabbed full page (Overview, Expenses, Balances, Plan); next month carries
unsettled balances over. A new default theme, Daylight (Commons' type and
soft cards in Encyclopedia's colors). General and photo feeds default to a
grid where documents show as small pages. Saved data key is v36. Test:
/tmp/t110.py (t104 is superseded).

Also done (Nov 13, night), Leo's 11-item list:
1. **Disappearing messages** per conversation (js/state/messages.js).
2. **Instagram** connect, copy posts into a blog feed, periodic sync, and
   people from Instagram's data download (js/state/instagram.js,
   js/account/instagram-connect.js). Simulated server. Real API facts:
   only professional accounts, no follower lists (hence the data-download
   route).
3. **Modules shared across groups** (js/state/shared-modules.js); sample
   Riverside Rec League with River Foxes and Thunder FC (league.js).
4. **Calendar**: swipe on phones, tap opens the event page, drag-to-frame
   covers, bigger covers, a small typed limit box, and Customize page on
   events (js/events/event-page-layout.js).
5. **Canvas** module for drawing (removed Nov 17).
6. **Photo editor** (js/ui/photo-editor.js) before posting or sending, and
   in vaults for whoever may edit the photo.
7. **Rough location first** on Explore, with a radius map (js/ui/area-map.js).
8-9. **Encrypted direct messages** (js/state/e2ee.js, safety numbers) and
   the security plan doc (link above).
10-11. Code review (in the chat reply) and a full bug pass: both sweeps
   clean (208 pages signed in, 147 guest, at two widths), four unused
   imports removed, tests moved into tests/. Saved data key is v39.

Next ideas: libsignal and a key server for real; group chat encryption (MLS);
a real backend; a build step (minify, split by page) before launch.

Also done (Nov 14): the "Move to tab…" menu on modules in edit mode is gone
(js/editor/module-frame.js). `moveModuleToTab` is still in the store, unused
by the interface.

Also done (Nov 14, early morning), from Leo's comment on the plan doc ("add
all of these") and four chat requests:
- **Spreadsheet** module (js/modules/sheet/), **live changes between
  windows** and presence (store.js "Live between windows", live.js),
  **notifications on the device and a weekly email preview**
  (delivery.js, notification-settings.js), **imports** (.ics into
  calendars, CSV into sheets, member lists in Settings → Members), and a
  **six-module starter list** in the library with "More modules".
- **Less text**: group headers, the Groups list, the Feed's summary line,
  event rows, and document previews trimmed. Join mode shows only as a
  button when there's one to press.
- **Daylight** theme: higher contrast.
- **Area map**: now a world map (world-land.js, world-cities.js). The
  finer-outline CDN step in area-map.js (loadDetail) is untested (no
  network in the sandbox); bundle Natural Earth and remove it when there's
  a way to fetch the file.
- **Top bar**: Home ▾ (My homepage, My blog, Friends) · Feed · Groups ▾ ·
  Messages. js/feed/blog-tabs.js is deleted.
- Plan doc: https://claude.ai/artifact/YMSdEbMRA3S78jCNAYG3t8 ("3den:
  Plan to serve the four goals"), with five decisions waiting on Leo.
- The artifact viewer blocks downloads, geolocation, remote images, and
  fetch to other hosts (see README, Known limitations).
Saved data key is v40.

Also done (Nov 14): a dark Commons theme, **Commons Night** (js/ui/themes.js).

Also done (Nov 14): posts with several pictures show one at a time with
arrows, dots, and swipe (renderMedia in feed-post.js; the old rows-of-tiles
layout is gone); the post's words sit under the pictures; sample photos mix
upright, square, and wide (mixedShape in demo-photos.js); and a photo post
can carry a connected event shown small under the pictures (renderEventStrip;
"Connect an event" in the photo composer). Saved data key is v41.
The Feed page is a centered 500 px column on wide screens (css/feed.css).

Also done (Nov 14, Leo's big list, while he was signed off). Items by
number from the ideas list:
- **1, 3, 16** The Feed: "From groups" at the top with inline
  answers (js/feed/feed-needs.js), filter chips, "You're caught up".
- **17** Save for later (saved.js, `#saved`). **5** Reminders (reminders.js).
  **2** Event recaps (event-recap.js). **6** RSVP and sign-ups on
  announcements (js/ui/asks.js).
- **Dashboard** (Leo, mid-batch: "does not need updates from friends"): now
  Needs you, Coming up (hosting, going, maybe, invited, shifts), Your tasks.
- **7** Spreadsheet ranges, fill, sort, and formats. **8** Start a group in
  three questions (group-setup.js). **30** Welcome checklist for new members
  (welcome-checklist.js; space.joinedAt is set by addMember). **29** Member
  directory (`#directory-<id>`). **48** Organizer demo (`#tour`,
  demo-tour.js).
- **33, 34** Replies, threads, pins, voice notes, and files in messages
  (thread-view.js, voice.js). **37** Block and mute (blocks.js).
- **21, 23, 25** Co-hosts (event.cohostIds; `hostIdsOf`/`isHostOf` replace
  `createdBy === me` checks), waitlists (event.waitlist; `applyRsvp`
  promotes; watchWaitlists notifies), and series pages (`#series-<id>`).
- **27** Volunteer shifts module (js/modules/shifts/). **18** About block
  for blogs. **20** Hashtags (tags.js, `#tag-<name>`). **19** Instagram card.
- **38** Moderation queue (Group settings → Moderation). **39** Privacy
  checkup and "View as a stranger" (store.setStrangerView).
- **46** Front page (`#welcome`, what signed-out visitors see first).
  **47** Help center (`#help`, `#help-<topic>`).
- **43** Empty states (js/ui/empty-state.js). **44** Motion. **10** Dark
  themes lighten danger, warning, and event colors. **11** Keyboard and
  screen-reader passes on the carousel, map, spreadsheet, and photo editor.
  **9** Every module page checked at 390 px (tests/test_phone_overflow.py).
- **12** Lint and type checks (above); the Friends tab moved out of
  feed-page.js into friends-page.js; the linter found and removed a dozen
  unused imports and a duplicate key.
Saved data key is v51. New tests are in tests/ (one per group of items).

Not done from the list, with reasons: nothing was skipped. Things to know:
the Instagram card and file downloads don't work inside the artifact viewer
(its sandbox blocks downloads); voice notes need a microphone permission,
which the viewer may also block; served as a normal website, both work.

Also done (Nov 14, late morning): the area map shows streets when it can
(js/ui/street-map.js: MapLibre + OpenFreeMap, the built-in map underneath
as the fallback). Untested against the real tile server: the sandbox has
no network, so tests/test_street_map.py uses a stand-in for MapLibre.
Serve the folder normally and open Account settings → Your area to see it.
Leo chose OpenFreeMap for now and Protomaps for the backend (see "Before
the backend"), and decided 3den will be open source.

Also done (Nov 14): the friend button on blogs is one word (Friend,
Requested, Respond, Friends), with Unfriend, Cancel request, and Accept or
Decline in a small menu (friendMenu in js/editor/space-header.js). Toasts
were unreadable on dark themes (white on light gray); they now use the
page's colors reversed. Test: tests/test_friend_button.py.

Also done (Nov 14): on phones, Blog (your own blog) replaces Alerts as the
tab bar's last tab; notifications are the bell in the slim top bar, between
search and your avatar (js/editor/tab-bar.js, css/mobile.css). Sign-up
rows in announcement asks no longer wrap their button on phones. Test:
tests/test_phone_tabs.py.
