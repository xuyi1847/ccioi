import uuid

from app.models import Track, UserTrackEvent
from app.services.collaborative_filtering import CollaborativeFilteringService


def make_track(name: str) -> Track:
    return Track(id=uuid.uuid4(), title=name, artist_name=name, album_name=None, genre=[], metadata_json={}, popularity=0.5)


def make_event(user_id: uuid.UUID, track_id: uuid.UUID, kind: str = "favorite") -> UserTrackEvent:
    return UserTrackEvent(user_id=user_id, track_id=track_id, event_type=kind, play_duration_ms=100, track_duration_ms=100, context={})


def test_item_cf_finds_tracks_liked_by_similar_listeners() -> None:
    target, peer_one, peer_two = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    seed, candidate = make_track("Seed"), make_track("Candidate")
    target_event = make_event(target, seed.id)
    events = [
        make_event(peer_one, seed.id), make_event(peer_one, candidate.id),
        make_event(peer_two, seed.id), make_event(peer_two, candidate.id),
        target_event,
    ]
    scores = CollaborativeFilteringService().score_candidates(target, [(target_event, seed)], events)
    assert scores[candidate.id] == 1.0


def test_item_cf_waits_for_enough_peer_users() -> None:
    target, peer = uuid.uuid4(), uuid.uuid4()
    seed, candidate = make_track("Seed"), make_track("Candidate")
    target_event = make_event(target, seed.id)
    events = [make_event(peer, seed.id), make_event(peer, candidate.id), target_event]
    assert CollaborativeFilteringService().score_candidates(target, [(target_event, seed)], events) == {}


def test_item_cf_ignores_negative_candidate_feedback() -> None:
    target, peer_one, peer_two = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    seed, candidate = make_track("Seed"), make_track("Candidate")
    target_event = make_event(target, seed.id)
    events = [
        make_event(peer_one, seed.id), make_event(peer_one, candidate.id, "dislike"),
        make_event(peer_two, seed.id), make_event(peer_two, candidate.id, "skip"),
        target_event,
    ]
    assert CollaborativeFilteringService().score_candidates(target, [(target_event, seed)], events) == {}
