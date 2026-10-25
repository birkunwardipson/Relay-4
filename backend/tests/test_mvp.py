def webhook_payload(event_id="event-1", conversation_id="conversation-1", **overrides):
    payload = {
        "event_id": event_id,
        "conversation_id": conversation_id,
        "incident_type": "stranded_vehicle",
        "description": "A vehicle is surrounded by water.",
        "location": "Cypress Bend Market",
        "landmark": "West service entrance",
        "hazard": "rising_water",
        "people_count": 2,
        "location_confirmed": True,
        "source_quote": "We are stuck near the market.",
        "transcript_reference": "message-1",
    }
    payload.update(overrides)
    return payload


def test_health(test_context):
    response = test_context.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_operator_login_uses_configured_admin_key_fallback(test_context):
    response = test_context.post(
        "/api/auth/login",
        json={"username": "Pete", "password": "test-admin-key"},
    )
    assert response.status_code == 200
    assert response.json() == {"authenticated": True, "operator": "Pete"}

    rejected = test_context.post(
        "/api/auth/login",
        json={"username": "Pete", "password": "wrong-password"},
    )
    assert rejected.status_code == 401


def test_webhook_creates_incident_and_unverified_evidence(test_context, webhook_headers):
    response = test_context.post(
        "/api/elevenlabs/tools/upsert-incident",
        headers=webhook_headers,
        json=webhook_payload(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["created"] is True
    assert body["duplicate"] is False
    assert body["caller_message"] == (
        "Your report has been received and sent to the dispatch console. "
        "I cannot confirm a responder or arrival distance yet. Please stay safe; help is being coordinated."
    )

    incident = test_context.get(f"/api/incidents/{body['incident_id']}")
    assert incident.status_code == 200
    data = incident.json()
    assert data["status"] == "intake"
    assert data["evidence"][0]["verification_status"] == "unverified"


def test_missing_information_remains_null(test_context, webhook_headers):
    payload = webhook_payload(
        event_id="event-null-fields",
        conversation_id="conversation-null-fields",
        description=None,
        location=None,
        landmark=None,
        injuries=None,
        people_count=None,
        location_confirmed=False,
    )
    response = test_context.post(
        "/api/elevenlabs/tools/upsert-incident", headers=webhook_headers, json=payload
    )
    assert response.status_code == 200
    incident = test_context.get(f"/api/incidents/{response.json()['incident_id']}").json()
    assert incident["description"] is None
    assert incident["location"] is None
    assert incident["people_count"] is None


def test_conversation_start_creates_empty_incident_idempotently(test_context, webhook_headers):
    payload = {"conversation_id": "conversation-start"}
    first = test_context.post(
        "/api/elevenlabs/tools/start-incident", headers=webhook_headers, json=payload
    )
    second = test_context.post(
        "/api/elevenlabs/tools/start-incident", headers=webhook_headers, json=payload
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["created"] is True
    assert second.json()["duplicate"] is True
    assert first.json()["incident_id"] == second.json()["incident_id"]
    assert first.json()["dispatch_confirmed"] is False


def test_invalid_payload_rejected(test_context, webhook_headers):
    response = test_context.post(
        "/api/elevenlabs/tools/upsert-incident",
        headers=webhook_headers,
        json={"event_id": "event-invalid", "conversation_id": "conversation-invalid", "people_count": -1},
    )
    assert response.status_code == 422


def test_webhook_authentication(test_context):
    response = test_context.post(
        "/api/elevenlabs/tools/upsert-incident",
        json=webhook_payload(event_id="event-auth"),
    )
    assert response.status_code == 401


def test_same_conversation_updates_existing_incident(test_context, webhook_headers):
    first = test_context.post(
        "/api/elevenlabs/tools/upsert-incident",
        headers=webhook_headers,
        json=webhook_payload(event_id="event-first", conversation_id="conversation-repeat"),
    ).json()
    second = test_context.post(
        "/api/elevenlabs/tools/upsert-incident",
        headers=webhook_headers,
        json=webhook_payload(
            event_id="event-second",
            conversation_id="conversation-repeat",
            location="Cypress Bend Market - north entrance",
            source_quote="Correction: use the north entrance.",
        ),
    )
    assert second.status_code == 200
    assert second.json()["created"] is False
    assert second.json()["incident_id"] == first["incident_id"]
    incident = test_context.get(f"/api/incidents/{first['incident_id']}").json()
    assert incident["location"] == "Cypress Bend Market - north entrance"


def test_correction_history_preserves_previous_value(test_context, webhook_headers):
    first = test_context.post(
        "/api/elevenlabs/tools/upsert-incident",
        headers=webhook_headers,
        json=webhook_payload(event_id="event-history-1", conversation_id="conversation-history"),
    ).json()
    test_context.post(
        "/api/elevenlabs/tools/upsert-incident",
        headers=webhook_headers,
        json=webhook_payload(
            event_id="event-history-2",
            conversation_id="conversation-history",
            location="Bayou Oak Lane",
        ),
    )
    history = test_context.get(f"/api/incidents/{first['incident_id']}/history").json()
    location_changes = [item for item in history if item["field_name"] == "location"]
    assert location_changes[-1]["previous_value"] == "Cypress Bend Market"
    assert location_changes[-1]["new_value"] == "Bayou Oak Lane"


def test_duplicate_webhook_retry_is_idempotent(test_context, webhook_headers):
    payload = webhook_payload(event_id="event-duplicate", conversation_id="conversation-duplicate")
    first = test_context.post(
        "/api/elevenlabs/tools/upsert-incident", headers=webhook_headers, json=payload
    )
    second = test_context.post(
        "/api/elevenlabs/tools/upsert-incident", headers=webhook_headers, json=payload
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["duplicate"] is True
    assert second.json()["incident_id"] == first.json()["incident_id"]
    assert len(test_context.get("/api/incidents").json()) == 1


def test_reused_event_id_with_different_payload_is_rejected(test_context, webhook_headers):
    payload = webhook_payload(event_id="event-conflict", conversation_id="conversation-conflict")
    first = test_context.post(
        "/api/elevenlabs/tools/upsert-incident", headers=webhook_headers, json=payload
    )
    conflicting = dict(payload, location="A different location")
    second = test_context.post(
        "/api/elevenlabs/tools/upsert-incident", headers=webhook_headers, json=conflicting
    )
    assert first.status_code == 200
    assert second.status_code == 409


def test_manual_incident_modification_requires_admin_auth(test_context):
    response = test_context.post("/api/incidents", json={"hazard": "rising_water"})
    assert response.status_code == 401


def test_manual_incident_update_is_authenticated_and_audited(test_context, admin_headers):
    created = test_context.post(
        "/api/incidents", headers=admin_headers, json={"location": "Bayou Oak Lane"}
    )
    assert created.status_code == 201
    incident_id = created.json()["id"]
    updated = test_context.patch(
        f"/api/incidents/{incident_id}",
        headers=admin_headers,
        json={"location": "Cypress Bend Market", "status": "reviewed"},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "reviewed"
    history = test_context.get(f"/api/incidents/{incident_id}/history").json()
    assert {item["field_name"] for item in history} == {"location", "status"}


def test_webhook_cannot_approve_dispatch_assignment(test_context, webhook_headers):
    response = test_context.post(
        "/api/elevenlabs/tools/upsert-incident",
        headers=webhook_headers,
        json=webhook_payload(event_id="event-no-dispatch"),
    )
    assert response.status_code == 200
    incident_id = response.json()["incident_id"]
    # The webhook secret is not a dispatcher credential: the agent cannot assign units.
    assigned = test_context.post(
        f"/api/incidents/{incident_id}/assignments", headers=webhook_headers, json={"unit_id": "any-unit"}
    )
    assert assigned.status_code == 401
    assert test_context.get(f"/api/incidents/{incident_id}/assignments").json() == []
