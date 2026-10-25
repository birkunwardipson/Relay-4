import pytest


@pytest.fixture()
def incident_id(test_context, admin_headers):
    return test_context.post("/api/incidents", headers=admin_headers, json={"location": "Jackson Square"}).json()["id"]


def add_unit(client, headers, name="Engine 04", service="fire", **extra):
    response = client.post("/api/units", headers=headers, json={"name": name, "service": service, "point": [29.9574, -90.0629], **extra})
    assert response.status_code == 201
    return response.json()


def assign(client, headers, incident_id, unit_id, key=None):
    extra = {"Idempotency-Key": key} if key else {}
    return client.post(f"/api/incidents/{incident_id}/assignments", headers={**headers, **extra}, json={"unit_id": unit_id})


def log(client, headers, incident_id, unit_id, status):
    return client.post(f"/api/incidents/{incident_id}/response-events", headers=headers, json={"unit_id": unit_id, "status": status})


def test_unit_crud_requires_admin(test_context, admin_headers):
    assert test_context.post("/api/units", json={"name": "Engine 04", "service": "fire"}).status_code == 401
    unit = add_unit(test_context, admin_headers)
    assert unit["point"] == [29.9574, -90.0629]
    assert unit["route"] is None

    assert test_context.patch(f"/api/units/{unit['id']}", json={"out_of_service": True}).status_code == 401
    changed = test_context.patch(f"/api/units/{unit['id']}", headers=admin_headers, json={"out_of_service": True, "point": None})
    assert changed.json()["out_of_service"] is True
    assert changed.json()["point"] is None

    assert test_context.delete(f"/api/units/{unit['id']}", headers=admin_headers).status_code == 204
    assert test_context.get("/api/units").json() == []


def test_assignment_records_assigned_event(test_context, admin_headers, incident_id):
    unit = add_unit(test_context, admin_headers)
    response = assign(test_context, admin_headers, incident_id, unit["id"])
    assert response.status_code == 201
    body = response.json()
    assert (body["incident_id"], body["unit_id"], body["service"]) == (incident_id, unit["id"], "fire")

    events = test_context.get(f"/api/incidents/{incident_id}/response-events").json()
    assert [(event["status"], event["unit_id"], event["actor"]) for event in events] == [("assigned", unit["id"], "dispatcher")]
    assert len(test_context.get("/api/assignments").json()) == 1


def test_assignment_requires_admin(test_context, admin_headers, incident_id):
    unit = add_unit(test_context, admin_headers)
    assert assign(test_context, {}, incident_id, unit["id"]).status_code == 401


def test_idempotency_key_replays_original(test_context, admin_headers, incident_id):
    unit = add_unit(test_context, admin_headers)
    first = assign(test_context, admin_headers, incident_id, unit["id"], key="key-1")
    again = assign(test_context, admin_headers, incident_id, unit["id"], key="key-1")
    assert first.status_code == 201
    assert again.status_code == 200
    assert again.json()["id"] == first.json()["id"]
    assert len(test_context.get(f"/api/incidents/{incident_id}/response-events").json()) == 1

    other = add_unit(test_context, admin_headers, name="Engine 05")
    assert assign(test_context, admin_headers, incident_id, other["id"], key="key-1").status_code == 409


def test_assignment_conflicts(test_context, admin_headers, incident_id):
    unit = add_unit(test_context, admin_headers)
    assert assign(test_context, admin_headers, incident_id, unit["id"]).status_code == 201

    duplicate = assign(test_context, admin_headers, incident_id, unit["id"])
    assert duplicate.status_code == 409
    assert "already assigned to this incident" in duplicate.json()["detail"]

    second_incident = test_context.post("/api/incidents", headers=admin_headers, json={"location": "Baton Rouge"}).json()["id"]
    busy = assign(test_context, admin_headers, second_incident, unit["id"])
    assert busy.status_code == 409
    assert "another unresolved incident" in busy.json()["detail"]

    out = add_unit(test_context, admin_headers, name="Medic 2", service="medical", out_of_service=True)
    assert assign(test_context, admin_headers, incident_id, out["id"]).status_code == 409
    assert assign(test_context, admin_headers, incident_id, "no-such-unit").status_code == 404


def test_resolution_frees_unit_and_closes_incident(test_context, admin_headers, incident_id):
    unit = add_unit(test_context, admin_headers)
    assign(test_context, admin_headers, incident_id, unit["id"])
    for status in ("accepted", "en_route", "on_scene", "resolved"):
        assert log(test_context, admin_headers, incident_id, unit["id"], status).status_code == 201

    other = add_unit(test_context, admin_headers, name="Engine 05")
    closed = assign(test_context, admin_headers, incident_id, other["id"])
    assert closed.status_code == 409
    assert "resolved" in closed.json()["detail"]
    assert log(test_context, admin_headers, incident_id, unit["id"], "on_scene").status_code == 409

    next_incident = test_context.post("/api/incidents", headers=admin_headers, json={"location": "Shreveport"}).json()["id"]
    assert assign(test_context, admin_headers, next_incident, unit["id"]).status_code == 201


def test_response_event_rules(test_context, admin_headers, incident_id):
    unit = add_unit(test_context, admin_headers)
    assert log(test_context, admin_headers, incident_id, unit["id"], "en_route").status_code == 409  # not assigned
    assign(test_context, admin_headers, incident_id, unit["id"])
    assert log(test_context, admin_headers, incident_id, unit["id"], "assigned").status_code == 409
    assert log(test_context, {}, incident_id, unit["id"], "en_route").status_code == 401
    assert log(test_context, admin_headers, incident_id, unit["id"], "teleported").status_code == 422


def test_unit_with_history_cannot_be_deleted(test_context, admin_headers, incident_id):
    unit = add_unit(test_context, admin_headers)
    assign(test_context, admin_headers, incident_id, unit["id"])
    response = test_context.delete(f"/api/units/{unit['id']}", headers=admin_headers)
    assert response.status_code == 409
    assert "out of service" in response.json()["detail"]
