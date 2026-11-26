"""Browser check of server-mode groups, events, and RSVPs (Cycle 4).

Run with `make e2e` from prod/ (the stack must be up, with `make seed` done).
Two browsers, as two people in 14 Juniper Lane: Leo answers, Maya reloads
and sees it, and the other way round. Then Grace (not in Juniper) is
refused its event, and Maya (not in Eastside Mutual Aid) can open that
group's public event by link. Uses the seeded accounts, so it makes no new
ones.
"""

import os
import re
import sys

from playwright.sync_api import Browser, Page, sync_playwright

BASE = os.environ.get("BASE_URL", "http://web:8080")
PASSWORD = os.environ.get("DEMO_PASSWORD", "3den-demo")
VISIBLE = ":visible"

results: list[bool] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f"  ({extra})" if extra and not ok else ""))


def sign_in(browser: Browser, username: str, errors: list[str]) -> Page:
    page = browser.new_context(viewport={"width": 1280, "height": 900}).new_page()
    page.on("pageerror", lambda e: errors.append(f"{username}: {e}"))
    # Expected: 401 from GET /api/v1/me before signing in, 404 for the event
    # Grace may not see, and the 409 this test fakes.
    page.on(
        "console",
        lambda m: m.type == "error"
        and not re.search(r"status of (401|404|409)", m.text)
        and errors.append(f"{username}: {m.text}"),
    )
    page.goto(f"{BASE}/index.html#signin")
    page.wait_for_selector(".auth")
    page.fill("input[autocomplete='username']", username)
    page.fill("input[aria-label='Password']", PASSWORD)
    page.click("form.auth__form button[type=submit]")
    page.wait_for_function("!document.body.classList.contains('is-signed-out')", timeout=10000)
    return page


def api(page: Page, path: str, method: str = "GET", body: object = None):
    return page.evaluate(
        """async ([path, method, body]) => {
            const r = await fetch('/api/v1' + path, {
                method, headers: { 'Content-Type': 'application/json' },
                body: body === null ? undefined : JSON.stringify(body) });
            return { status: r.status, json: r.status === 204 ? null : await r.json() };
        }""",
        [path, method, body],
    )


def open_event(page: Page, event_id: str) -> None:
    page.goto(f"{BASE}/index.html#event-{event_id}")
    page.reload()  # a fresh load, so the page shows what the server has now
    page.wait_for_selector(f".rsvp__button--going{VISIBLE}, .module-empty{VISIBLE}", timeout=10000)


def button_text(page: Page, answer: str) -> str:
    return " ".join(page.locator(f".rsvp__button--{answer}{VISIBLE}").first.inner_text().split())


def guests(page: Page) -> dict[str, list[str]]:
    """The guest list: {'Going': ['Maya', 'Theo'], …}."""
    return page.evaluate(
        """() => {
            const out = {};
            let label = null;
            for (const el of document.querySelectorAll('.guest-list > *')) {
                if (el.tagName === 'DT') label = el.textContent.trim();
                else out[label] = [...el.querySelectorAll('.guest-list__name')].map((n) => n.textContent.trim());
            }
            return out;
        }"""
    )


with sync_playwright() as p:
    browser = p.chromium.launch()
    errors: list[str] = []

    leo = sign_in(browser, "leo", errors)
    spaces = api(leo, "/me/spaces")["json"]
    if not isinstance(spaces, list) or not any(s["slug"] == "juniper" for s in spaces):
        sys.exit("Leo isn't in 14 Juniper Lane: run `make seed` first.")
    juniper = next(s for s in spaces if s["slug"] == "juniper")
    aid = next(s for s in spaces if s["slug"] == "mutualaid")
    events = api(leo, f"/spaces/{juniper['id']}/events")["json"]
    meeting = next(e for e in events if e["title"] == "House meeting")
    pantry = next(e for e in api(leo, f"/spaces/{aid['id']}/events")["json"] if e["visibility"] == "public")

    # Start clean: no answer from Leo or Maya beyond the seeded "going".
    api(leo, f"/events/{meeting['id']}/rsvp", "PUT", {"answer": None})

    version = leo.evaluate("fetch('/shared/version.json').then((r) => r.json()).then((v) => v.version)")
    footer = leo.inner_text(".page__version")
    check("the footer shows the version", footer == f"3den {version}", footer)

    leo.goto(f"{BASE}/index.html#groups")
    leo.wait_for_timeout(800)
    page_text = leo.inner_text("body")
    check("Leo's groups come from the server", "14 Juniper Lane" in page_text and "Eastside Mutual Aid" in page_text)

    leo.goto(f"{BASE}/index.html#space-{juniper['id']}")
    leo.wait_for_selector(".space-header__server-note")
    check("the group says what's saved where", "saved on the 3den server" in leo.inner_text(".space-header__server-note"))

    # Leo answers Maybe on the event page.
    open_event(leo, meeting["id"])
    going_before = int(re.sub(r"\D", "", button_text(leo, "going")))
    leo.locator(f".rsvp__button--maybe{VISIBLE}").first.click()
    leo.wait_for_function(
        f"[...document.querySelectorAll('.rsvp__button--maybe')].some((b) => b.classList.contains('is-mine'))"
    )
    leo.wait_for_timeout(800)  # the PUT
    saved = api(leo, f"/events/{meeting['id']}")["json"]
    check("Leo's answer is saved on the server", saved["my_answer"] == "maybe", str(saved.get("my_answer")))

    # Maya, in another browser, sees it after a reload.
    maya = sign_in(browser, "maya", errors)
    open_event(maya, meeting["id"])
    check("Maya sees Leo's Maybe", button_text(maya, "maybe") == "🤔 Maybe · 1", button_text(maya, "maybe"))
    check("and Leo in the guest list", "Leo" in guests(maya).get("Maybe", []), str(guests(maya)))

    # The other way round: Maya says she can't go after all.
    maya.locator(f".rsvp__button--no{VISIBLE}").first.click()
    maya.wait_for_timeout(1000)
    open_event(leo, meeting["id"])
    check("Leo sees Maya's Can't go", button_text(leo, "no") == "😢 Can’t go · 1", button_text(leo, "no"))
    check("Going went down by one", button_text(leo, "going") == f"👍 Going · {going_before - 1}", button_text(leo, "going"))

    # A refusal puts the old answer back, with a toast.
    leo.route(
        "**/api/v1/events/*/rsvp",
        lambda route: route.fulfill(
            status=409,
            content_type="application/json",
            body='{"detail": "This event changed since you opened it. Have a look, then answer again."}',
        ),
    )
    leo.locator(f".rsvp__button--going{VISIBLE}").first.click()
    refused = leo.wait_for_selector(".toast:has-text('changed since you opened it')", timeout=5000)
    check("a refusal is explained", refused is not None)
    leo.wait_for_timeout(500)
    mine = leo.locator(f".rsvp__button.is-mine{VISIBLE}").first
    check("and the old answer comes back", "Maybe" in mine.inner_text(), mine.inner_text())
    leo.unroute("**/api/v1/events/*/rsvp")

    # Grace isn't in Juniper: its event isn't there for her, on the page or the API.
    grace = sign_in(browser, "grace", errors)
    open_event(grace, meeting["id"])
    check(
        "someone outside the group can't open its event",
        grace.locator(".rsvp__button--going:visible").count() == 0
        and "doesn’t exist" in grace.inner_text(".module-empty:visible"),
    )
    check("and the API says 404", api(grace, f"/events/{meeting['id']}")["status"] == 404)
    grace.goto(f"{BASE}/index.html#groups")
    grace.wait_for_timeout(800)
    check("Juniper isn't in Grace's groups", "14 Juniper Lane" not in grace.inner_text("body"))

    # Maya isn't in Eastside Mutual Aid, but its public events are open to her.
    open_event(maya, pantry["id"])
    check("a public event opens by link for a non-member", maya.locator(".rsvp__button--going:visible").count() == 1)

    # Leave things as they were for the next run (Maya going, Leo unanswered).
    api(maya, f"/events/{meeting['id']}/rsvp", "PUT", {"answer": "going"})
    api(leo, f"/events/{meeting['id']}/rsvp", "PUT", {"answer": None})

    check("no script errors", not errors, "; ".join(errors[:3]))
    browser.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
