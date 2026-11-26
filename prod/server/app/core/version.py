"""3den's version, from prod/shared/version.json (shared with the web and iOS apps)."""

import json
from pathlib import Path

# /srv/server/app/core/version.py → /srv/shared (compose mounts prod/shared there).
SHARED_DIR = Path(__file__).resolve().parents[3] / "shared"

VERSION: str = json.loads((SHARED_DIR / "version.json").read_text())["version"]
