import pytest

from app.services.mac_music import MacMusicError, MacTrack, parse_track, quote


def test_parse_mac_track() -> None:
    assert parse_track("ABC␟Song␟Artist␟Album␟123.5") == MacTrack("ABC", "Song", "Artist", "Album", 123.5)


def test_parse_mac_track_rejects_invalid_payload() -> None:
    with pytest.raises(MacMusicError):
        parse_track("invalid")


def test_quote_escapes_applescript_values() -> None:
    assert quote('A "song"') == '"A \\"song\\""'
