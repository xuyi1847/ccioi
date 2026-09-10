from app.core.config import Settings
from app.services.providers.musicbrainz import MusicBrainzProvider


def test_musicbrainz_maps_metadata_without_claiming_audio() -> None:
    provider = MusicBrainzProvider(Settings())
    track = provider._map(
        {
            "id": "recording-id",
            "title": "七里香",
            "length": 299000,
            "isrcs": ["TWA530400001"],
            "artist-credit": [{"name": "周杰伦", "joinphrase": ""}],
            "releases": [{"id": "release-id", "title": "七里香", "status": "Official"}],
            "tags": [{"name": "mandopop"}],
            "score": 100,
        }
    )

    assert track.provider_id == "recording-id"
    assert track.artist == "周杰伦"
    assert track.metadata["playbackType"] == "external"
    assert "streamUrl" not in track.metadata
    assert track.metadata["externalLinks"]["appleMusic"].startswith("https://music.apple.com/")
    assert track.artwork_url == "https://coverartarchive.org/release/release-id/front-500"


def test_musicbrainz_external_links_are_search_links() -> None:
    links = MusicBrainzProvider._links("No Surprises", "Radiohead")
    assert "No+Surprises+Radiohead" in links["appleMusic"]
    assert "No+Surprises+Radiohead" in links["qqMusic"]
    assert "No+Surprises+Radiohead" in links["netease"]
