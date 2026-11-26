"""Print the API's OpenAPI document. `make openapi` writes it to prod/shared/openapi.json,
which the iOS app generates its API types from (ios/project.yml);
tests/test_openapi.py fails when that copy is out of date."""

import json

from app.main import app


def spec_text() -> str:
    return json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    print(spec_text(), end="")
