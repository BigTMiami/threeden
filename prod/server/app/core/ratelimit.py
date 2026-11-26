"""A simple in-memory rate limit (sliding window), for sign-in and sign-up.

Good for one API process, which is what runs locally and on the first testing
server. With several workers or servers it moves to Postgres or Redis.
"""

import math
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, status


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str) -> None:
        """Count one attempt for `key`; raise 429 if it's over the limit."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                retry = math.ceil(hits[0] + self.window - now)
                minutes = max(1, math.ceil(retry / 60))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many tries. Wait {minutes} minute{'s' if minutes > 1 else ''} "
                    "and try again.",
                    headers={"Retry-After": str(retry)},
                )
            hits.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


# Per network address, and per username or email (so spreading guesses over
# many addresses doesn't help either).
signin_by_ip = RateLimiter(limit=20, window_seconds=15 * 60)
signin_by_login = RateLimiter(limit=10, window_seconds=15 * 60)
signup_by_ip = RateLimiter(limit=10, window_seconds=60 * 60)

ALL = (signin_by_ip, signin_by_login, signup_by_ip)
