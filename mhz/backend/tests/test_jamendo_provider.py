import pytest

from app.core.config import Settings
from app.services.providers.jamendo import JamendoProvider


def test_jamendo_requires_client_id() -> None:
    with pytest.raises(ValueError, match="JAMENDO_CLIENT_ID"):
        JamendoProvider(Settings(jamendo_client_id=None))


def test_jamendo_maps_track_to_provider_neutral_model() -> None:
    item = {
        "id": "1890123",
        "name": "Night Signal",
        "artist_id": "42",
        "artist_name": "Northbound",
        "album_name": "Low Orbit",
        "duration": "123",
        "album_image": "https://usercontent.jamendo.com/cover.jpg",
        "audio": "https://prod-1.storage.jamendo.com/audio.mp3",
        "license_ccurl": "https://creativecommons.org/licenses/by/4.0/",
        "musicinfo": {"tags": {"genres": ["rock"], "vartags": ["indie", "rock"]}},
    }
    track = JamendoProvider._map(item)
    assert track.provider_id == "1890123"
    assert track.duration_ms == 123000
    assert track.genres == ["rock"]
    assert track.metadata["tags"] == ["rock", "indie"]
    assert track.metadata["streamUrl"].endswith("audio.mp3")
