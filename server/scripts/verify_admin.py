from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def main() -> None:
    settings = get_settings()
    client = TestClient(app)
    login = client.post(
        "/api/v1/auth/login",
        json={"email": settings.admin_email, "password": settings.admin_password},
    )
    print("login", login.status_code, (login.json().get("me") or {}).get("primary_role"))
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print("overview", client.get("/api/v1/admin/overview", headers=headers).json())
    print("orgs", len(client.get("/api/v1/admin/organizations", headers=headers).json()))
    print("users", len(client.get("/api/v1/admin/users", headers=headers).json()))

    demo = client.post(
        "/api/v1/auth/login",
        json={"email": "ghulam@acmelabs.io", "password": "demo1234"},
    )
    demo_headers = {"Authorization": f"Bearer {demo.json()['access_token']}"}
    print("owner blocked", client.get("/api/v1/admin/overview", headers=demo_headers).status_code)


if __name__ == "__main__":
    main()
