import uuid
from app.models import Channel, Track, UserTrackEvent
from app.services.recommendation import RecommendationEngine
from app.services.taste_profile import TasteProfileService


def track(title: str, artist: str, genre: str = "Indie", popularity: float = .5) -> Track:
    return Track(id=uuid.uuid4(), title=title, artist_name=artist, album_name="Album", genre=[genre], metadata_json={}, popularity=popularity)


def event(item: Track, event_type: str, played: int = 0, duration: int = 100) -> UserTrackEvent:
    return UserTrackEvent(user_id=uuid.uuid4(), track_id=item.id, event_type=event_type, play_duration_ms=played, track_duration_ms=duration, context={})


def channel() -> Channel:
    return Channel(id="private", frequency=87.5, name="私人兆赫", channel_type="personal", config={"discoveryRatio": .65, "exploreRatio": .2})


def test_favorite_increases_artist_affinity() -> None:
    liked = track("A", "Favorite Artist")
    profile = TasteProfileService().build([(event(liked, "favorite"), liked)])
    assert profile.artists["Favorite Artist"] > 0


def test_disliked_track_is_filtered() -> None:
    disliked = track("A", "One")
    ranked = RecommendationEngine().rank([disliked], [(event(disliked, "dislike"), disliked)], channel(), set(), {})
    assert ranked == []


def test_recent_track_is_filtered() -> None:
    recent = track("A", "One")
    ranked = RecommendationEngine().rank([recent], [(event(recent, "play_start"), recent)], channel(), set(), {})
    assert ranked == []


def test_recent_artist_is_filtered() -> None:
    heard = track("A", "Same Artist")
    candidate = track("B", "Same Artist")
    ranked = RecommendationEngine().rank([candidate], [(event(heard, "play_start"), heard)], channel(), set(), {})
    assert ranked == []


def test_skip_penalty_reduces_score() -> None:
    first, second = track("A", "One"), track("B", "Two")
    ranked = RecommendationEngine().rank([first, second], [], channel(), set(), {first.id: 2})
    assert ranked[0].track.id == second.id


def test_fallback_returns_available_popular_track() -> None:
    first, second = track("A", "One", popularity=.2), track("B", "Two", popularity=.9)
    assert RecommendationEngine().fallback([first, second], set()).id == second.id


def test_early_skip_has_stronger_negative_weight() -> None:
    item = track("A", "One")
    assert TasteProfileService.event_weight(event(item, "skip", 5, 100)) == -2
    assert TasteProfileService.event_weight(event(item, "skip", 80, 100)) == -1
