from fastapi.testclient import TestClient

URL = "/api/v1/hello"


def test_empty_at_first(client: TestClient) -> None:
    response = client.get(URL)
    assert response.status_code == 200
    assert response.json() == {"count": 0, "latest": []}


def test_add_then_read(client: TestClient) -> None:
    response = client.post(URL, json={"message": "  Hello from the desktop  "})
    assert response.status_code == 201
    added = response.json()
    assert added["message"] == "Hello from the desktop"  # trimmed
    assert isinstance(added["id"], int)
    assert added["created_at"]

    body = client.get(URL).json()
    assert body["count"] == 1
    assert body["latest"][0]["message"] == "Hello from the desktop"


def test_latest_is_five_newest_first(client: TestClient) -> None:
    for i in range(7):
        assert client.post(URL, json={"message": f"greeting {i}"}).status_code == 201

    body = client.get(URL).json()
    assert body["count"] == 7
    assert [g["message"] for g in body["latest"]] == [f"greeting {i}" for i in (6, 5, 4, 3, 2)]


def test_exactly_200_characters_is_allowed(client: TestClient) -> None:
    assert client.post(URL, json={"message": "x" * 200}).status_code == 201


def test_too_long_is_refused(client: TestClient) -> None:
    response = client.post(URL, json={"message": "x" * 201})
    assert response.status_code == 422
    assert client.get(URL).json()["count"] == 0


def test_empty_or_blank_is_refused(client: TestClient) -> None:
    assert client.post(URL, json={"message": ""}).status_code == 422
    assert client.post(URL, json={"message": "   "}).status_code == 422
    assert client.post(URL, json={}).status_code == 422
    assert client.get(URL).json()["count"] == 0
