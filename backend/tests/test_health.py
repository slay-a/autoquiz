"""
Liveness endpoint smoke test.

The /health route is consumed by docker-compose health checks, future
container orchestration, and CI smoke tests. It must always return 200
with a JSON body identifying the service.
"""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_returns_200():
    res = client.get("/health")
    assert res.status_code == 200


def test_health_payload_contains_status_ok():
    res = client.get("/health")
    body = res.json()
    assert body["status"] == "ok"


def test_health_payload_includes_service_metadata():
    """Service name and version are included so probes can identify the running build."""
    res = client.get("/health")
    body = res.json()
    assert body["service"] == app.title
    assert body["version"] == app.version


def test_health_does_not_require_auth():
    """Liveness probes must work without an Authorization header."""
    res = client.get("/health")
    assert res.status_code == 200
    assert "error" not in res.json()
