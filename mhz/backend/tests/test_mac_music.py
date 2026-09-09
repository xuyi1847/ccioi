import pytest
from app.services.providers.base import PlaybackTrack
from app.services.providers.mac_music import AppleScriptError, MacMusicProvider, _parse_track, _quote
from spike_music import normalized, target_matches


def test_applescript_quote_escapes_user_values() -> None:
    assert _quote('A "quoted" \\ title') == '"A \\"quoted\\" \\\\ title"'


def test_parse_track_payload() -> None:
    track = _parse_track("ABC␟No Surprises␟Radiohead␟OK Computer␟228.4␟Alternative␟1997␟42")
    assert track == PlaybackTrack("ABC", "No Surprises", "Radiohead", "OK Computer", 228.4, "Alternative", 1997, 42)


def test_parse_track_rejects_unknown_shape() -> None:
    with pytest.raises(AppleScriptError):
        _parse_track("incomplete")


@pytest.mark.asyncio
async def test_play_requires_persistent_id() -> None:
    with pytest.raises(ValueError):
        await MacMusicProvider().play(PlaybackTrack("", "Unknown", "Unknown"))


def test_catalog_target_requires_title_and_artist_match() -> None:
    track = PlaybackTrack("ABC", "No Surprises", "Radiohead")
    assert target_matches(track, " no surprises ", "RADIOHEAD")
    assert not target_matches(track, "Youth", "Sandee Chan")
    assert normalized("  Ｎｏ   Surprises ") == "no surprises"
