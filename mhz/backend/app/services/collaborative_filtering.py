import math
import uuid
from collections import defaultdict

from app.models import Track, UserTrackEvent
from app.services.taste_profile import TasteProfileService


class CollaborativeFilteringService:
    """Item-based collaborative filtering over implicit listening feedback."""

    def __init__(self, min_peer_users: int = 2, max_seed_tracks: int = 40):
        self.min_peer_users = min_peer_users
        self.max_seed_tracks = max_seed_tracks

    @staticmethod
    def _preferences(events: list[UserTrackEvent]) -> dict[tuple[uuid.UUID, uuid.UUID], float]:
        values: defaultdict[tuple[uuid.UUID, uuid.UUID], float] = defaultdict(float)
        favorite_seen: set[tuple[uuid.UUID, uuid.UUID]] = set()
        for event in events:  # newest first
            key = (event.user_id, event.track_id)
            if event.event_type in {"favorite", "unfavorite"}:
                if key in favorite_seen:
                    continue
                favorite_seen.add(key)
                if event.event_type == "unfavorite":
                    continue
            values[key] += TasteProfileService.event_weight(event)
        return {key: max(-5.0, min(5.0, value)) for key, value in values.items()}

    def score_candidates(
        self,
        target_user_id: uuid.UUID,
        target_history: list[tuple[UserTrackEvent, Track]],
        all_events: list[UserTrackEvent],
    ) -> dict[uuid.UUID, float]:
        preferences = self._preferences(all_events)
        peer_ids = {user_id for user_id, _ in preferences if user_id != target_user_id}
        if len(peer_ids) < self.min_peer_users:
            return {}

        target_preferences = self._preferences([event for event, _ in target_history])
        target_values = {track_id: value for (user_id, track_id), value in target_preferences.items() if user_id == target_user_id}
        seeds = sorted(((track_id, value) for track_id, value in target_values.items() if value > 0), key=lambda item: item[1], reverse=True)[:self.max_seed_tracks]
        if not seeds:
            return {}

        vectors: defaultdict[uuid.UUID, dict[uuid.UUID, float]] = defaultdict(dict)
        for (user_id, track_id), value in preferences.items():
            if user_id != target_user_id and value > 0:
                vectors[track_id][user_id] = value

        scores: defaultdict[uuid.UUID, float] = defaultdict(float)
        for candidate_id, candidate_vector in vectors.items():
            if candidate_id in target_values or not candidate_vector:
                continue
            candidate_norm = math.sqrt(sum(value * value for value in candidate_vector.values()))
            for seed_id, target_weight in seeds:
                seed_vector = vectors.get(seed_id)
                if not seed_vector:
                    continue
                common = candidate_vector.keys() & seed_vector.keys()
                if not common:
                    continue
                seed_norm = math.sqrt(sum(value * value for value in seed_vector.values()))
                similarity = sum(candidate_vector[user] * seed_vector[user] for user in common) / max(candidate_norm * seed_norm, 1e-9)
                scores[candidate_id] += similarity * min(target_weight / 5.0, 1.0)
        if not scores:
            return {}
        scale = max(scores.values())
        return {track_id: score / scale for track_id, score in scores.items() if score > 0}
