"""Browser check of the web app's server mode (Cycle 3): sign up, sign in, sign out, demo mode.

Run with `make e2e` from prod/ (the stack must be up). It runs in Chromium in
the Playwright container, on the compose network, so the site is http://web:8080.

Each run makes one account (web.check<number>) and tries one more sign-up, so
the sign-up rate limit (10 an hour from one address) allows about five runs an
hour; `docker compose restart api` resets the limits, and `make reset-db`
clears the accounts.
"""

import os
import sys
import time

from playwright.sync_api import Page, sync_playwright

BASE = os.environ.get("BASE_URL", "http://web:8080")
SCREENSHOTS = os.environ.get("SCREENSHOTS")  # a folder, to keep screenshots
USER = f"web.check{int(time.time()) % 1_000_000}"
PASSWORD = "correct horse battery"
DEMO_ACCOUNT = ".auth__demo:not(.auth__preview-new) .auth__demo-account"
SIGN_OUT = {"name": "Sign out", "exact": True}

results: list[bool] = []


def check(name: str, ok: bool, extra: str = "") -> None:
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + (f"  ({extra})" if extra and not ok else ""))


def signed_out(page: Page) -> bool:
    return page.evaluate("document.body.classList.contains('is-signed-out')")


def mode(page: Page) -> str:
    return page.evaluate("document.documentElement.dataset.mode")


def me_status(page: Page) -> int:
    return page.evaluate("fetch('/api/v1/me').then(r => r.status)")


def screenshot(page: Page, name: str) -> None:
    if SCREENSHOTS:
        page.screenshot(path=f"{SCREENSHOTS}/{name}.png")


def form_error(page: Page) -> str:
    page.wait_for_function("document.querySelector('.auth .form-error').textContent.length > 0")
    return page.inner_text(".auth .form-error")


def fill_sign_up(page: Page, name: str, username: str, email: str) -> None:
    page.fill("input[aria-label='Your name']", name)
    page.fill("input[aria-label='Username']", username)
    page.fill("input[aria-label='Email']", email)
    page.fill("input[aria-label='Password']", PASSWORD)
    page.click("form.auth__form button[type=submit]")


def switch_mode(page: Page, link: str) -> None:
    """Click the mode switch and wait for the reload it causes."""
    with page.expect_navigation(wait_until="load"):
        page.click(f"text={link}")
    page.wait_for_selector(".auth")


def sign_out_from_account_page(page: Page) -> None:
    page.goto(f"{BASE}/index.html#account")
    page.wait_for_timeout(1000)
    page.get_by_role("button", **SIGN_OUT).last.click()
    page.wait_for_function("document.body.classList.contains('is-signed-out')")


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    # Script errors only: a 401 from GET /api/v1/me (not signed in) is expected.
    page.on(
        "console",
        lambda m: m.type == "error" and "status of 401" not in m.text and errors.append(m.text),
    )

    page.goto(f"{BASE}/index.html#signin")
    page.wait_for_selector(".auth")
    check("starts in server mode", mode(page) == "server")
    check("signed out at first", signed_out(page))
    check("no demo accounts in server mode", page.locator(".auth__demo").count() == 0)
    check("mode line shown", "Server mode." in page.inner_text(".auth__mode"))
    screenshot(page, "1-signin")

    # Create an account
    page.click("a.auth__tab[href='#signup']")
    fill_sign_up(page, "Web Check", USER, f"{USER}@example.com")
    page.wait_for_function("!document.body.classList.contains('is-signed-out')", timeout=10000)
    check("signed up and in", not signed_out(page))
    check("server session after sign-up", me_status(page) == 200)
    screenshot(page, "2-after-signup")

    page.reload()
    page.wait_for_load_state("networkidle")
    check("still signed in after reload", not signed_out(page))

    # The same username from a second browser tab: the server says it's taken
    other = browser.new_page()
    other.goto(f"{BASE}/index.html#signup")
    other.wait_for_selector(".auth")
    fill_sign_up(other, "Someone Else", USER, f"other.{USER}@example.com")
    message = form_error(other)
    check("taken username refused", message == f"@{USER} is taken.", message)
    other.close()

    # Sign out
    sign_out_from_account_page(page)
    page.wait_for_timeout(500)
    check("signed out here", signed_out(page))
    check("server session ended", me_status(page) == 401)

    # Wrong password, then the right one
    page.goto(f"{BASE}/index.html#signin")
    page.wait_for_selector(".auth")
    page.fill("input[autocomplete='username']", USER)
    page.fill("input[aria-label='Password']", "not the password")
    page.click("form.auth__form button[type=submit]")
    message = form_error(page)
    check("wrong password refused", message == "That username or email and password don’t match.", message)
    page.fill("input[aria-label='Password']", PASSWORD)
    page.click("form.auth__form button[type=submit]")
    page.wait_for_function("!document.body.classList.contains('is-signed-out')", timeout=10000)
    check("signed in with username and password", not signed_out(page) and me_status(page) == 200)

    # Demo mode still works without the server, then back to server mode
    sign_out_from_account_page(page)
    switch_mode(page, "Use demo mode instead")
    check("demo mode after switching", mode(page) == "demo")
    check("demo accounts listed", page.locator(DEMO_ACCOUNT).count() > 0)
    screenshot(page, "3-demo-mode")
    page.locator(DEMO_ACCOUNT).first.click()
    page.wait_for_function("!document.body.classList.contains('is-signed-out')")
    check("demo account signs in, with no server session", not signed_out(page) and me_status(page) == 401)

    page.wait_for_timeout(800)  # demo mode saves to IndexedDB in the background
    sign_out_from_account_page(page)
    switch_mode(page, "Use the 3den server instead")
    check("back to server mode", mode(page) == "server")
    check("demo accounts hidden again", page.locator(".auth__demo").count() == 0)

    page.goto(f"{BASE}/hello.html")
    page.wait_for_selector("#greetings li")
    check("hello page still works", page.inner_text("#db-status") == "connected")

    check("no script errors", not errors, "; ".join(errors[:3]))
    browser.close()

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
