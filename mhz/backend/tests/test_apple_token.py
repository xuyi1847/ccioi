from app.core.config import Settings
from app.services.apple_token import AppleDeveloperTokenService
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def test_apple_token_reports_missing_configuration() -> None:
    service = AppleDeveloperTokenService(Settings(apple_team_id=None, apple_key_id=None, apple_private_key_path=None))
    assert service.configured is False


def test_apple_token_is_signed_and_cached(tmp_path) -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    key_path = tmp_path / "AuthKey_test.p8"
    key_path.write_bytes(private_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    settings = Settings(apple_team_id="TEAM123", apple_key_id="KEY123", apple_private_key_path=str(key_path), apple_music_origin="https://mhz.example")
    service = AppleDeveloperTokenService(settings)
    first, first_expiry = service.get_token()
    second, second_expiry = service.get_token()
    assert first == second
    assert first_expiry == second_expiry
