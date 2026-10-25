import hmac

from fastapi import APIRouter, HTTPException, Request, status

from app.schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request):
    settings = request.app.state.settings
    configured_password = settings.configured_operator_password
    valid_user = hmac.compare_digest(payload.username.strip().lower(), settings.operator_username.strip().lower())
    valid_password = bool(configured_password) and hmac.compare_digest(payload.password, configured_password)
    if not valid_user or not valid_password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid operator credentials")
    return LoginResponse(operator=settings.operator_username)
