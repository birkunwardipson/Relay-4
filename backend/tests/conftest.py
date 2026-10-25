import pytest
import anyio
import httpx

from app.config import Settings
from app.main import create_app


class SyncASGIClient:
    """Small synchronous adapter for HTTPX's ASGI transport."""

    def __init__(self, app):
        self.app = app

    def request(self, method, url, **kwargs):
        async def send():
            transport = httpx.ASGITransport(app=self.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.request(method, url, **kwargs)

        return anyio.run(send)

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)

    def patch(self, url, **kwargs):
        return self.request("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self.request("DELETE", url, **kwargs)


@pytest.fixture()
def test_context(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        elevenlabs_webhook_secret="test-webhook-secret",
        admin_api_key="test-admin-key",
        simulation_mode=True,
    )
    app = create_app(settings)
    yield SyncASGIClient(app)


@pytest.fixture()
def webhook_headers():
    return {"X-ElevenLabs-Webhook-Secret": "test-webhook-secret"}


@pytest.fixture()
def admin_headers():
    return {"X-Admin-API-Key": "test-admin-key"}
