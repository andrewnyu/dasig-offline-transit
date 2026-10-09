import hashlib

from fastapi.testclient import TestClient

from server.main import app


client = TestClient(app)


def test_manifest_names_exact_network_bytes():
    manifest = client.get("/api/offline-packs/bacolod/manifest").json()
    response = client.get(manifest["network_url"])

    assert response.status_code == 200
    assert manifest["version"] == manifest["sha256"][:12]
    assert manifest["size_bytes"] == len(response.content)
    assert manifest["sha256"] == hashlib.sha256(response.content).hexdigest()
    assert len(response.json()["features"]) == 24


def test_etag_and_unknown_city():
    response = client.get("/api/offline-packs/bacolod/network")
    cached = client.get(
        "/api/offline-packs/bacolod/network",
        headers={"If-None-Match": response.headers["etag"]},
    )

    assert cached.status_code == 304
    assert client.get("/api/offline-packs/manila/manifest").status_code == 404
