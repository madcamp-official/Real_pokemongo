from fastapi.testclient import TestClient

from professor_worker import api


def test_embed_contract_without_loading_real_model(monkeypatch):
    monkeypatch.setattr(api, "embed_texts", lambda texts: [[1.0] + [0.0] * 383])
    client = TestClient(api.app)
    response = client.post("/embed", json={"text": "참새는 어디에서 살아요?"})
    assert response.status_code == 200
    body = response.json()
    assert body["dimension"] == 384
    assert body["normalized"] is True
    assert len(body["vector"]) == 384


def test_embed_rejects_empty_question():
    client = TestClient(api.app)
    response = client.post("/embed", json={"text": ""})
    assert response.status_code == 422

