from app.core.config import Settings
from app.services.providers.audius import AudiusProvider


def test_audius_maps_track_and_uses_stable_stream_endpoint() -> None:
    provider = AudiusProvider(Settings(audius_app_name="MHz Test"))
    item = {
        "id": "dlk8KgJ",
        "title": "Night Signal",
        "user_id": "artist-42",
        "user": {"name": "Northbound"},
        "duration": 123,
        "genre": "Electronic",
        "tags": "indie,night",
        "artwork": {"1000x1000": "https://node.example/cover.jpg"},
        "is_streamable": True,
    }
    track = provider._map(item)
    assert track.provider_id == "dlk8KgJ"
    assert track.duration_ms == 123000
    assert track.genres == ["Electronic"]
    assert track.metadata["tags"] == ["Electronic", "indie", "night"]
    assert track.metadata["streamUrl"] == "https://api.audius.co/v1/tracks/dlk8KgJ/stream?app_name=MHz Test"


def test_audius_excludes_hour_long_mixes_from_radio_candidates() -> None:
    assert AudiusProvider._playable_song({"duration": 239, "is_streamable": True})
    assert not AudiusProvider._playable_song({"duration": 3673, "is_streamable": True})
    assert not AudiusProvider._playable_song({"duration": 239, "is_streamable": False})


def test_audius_chinese_filter_excludes_podcasts() -> None:
    assert AudiusProvider._is_chinese_song({"title": "夜航", "genre": "Electronic", "user": {}})
    assert not AudiusProvider._is_chinese_song({"title": "中文播客", "genre": "Podcasts", "user": {}})
    assert not AudiusProvider._is_chinese_song({"title": "Night Flight", "genre": "Electronic", "user": {}})
