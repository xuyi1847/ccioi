import random
import uuid
from dataclasses import dataclass
from app.models import Channel, Track, UserTrackEvent
from app.services.taste_profile import TasteProfileService


@dataclass(slots=True)
class RankedTrack:
    track: Track
    score: float
    reason: str


class RecommendationEngine:
    def __init__(self, taste_service: TasteProfileService | None = None):
        self.taste_service = taste_service or TasteProfileService()

    def rank(
        self,
        candidates: list[Track],
        history: list[tuple[UserTrackEvent, Track]],
        channel: Channel,
        explicit_excludes: set[uuid.UUID],
        skip_counts: dict[uuid.UUID, int],
    ) -> list[RankedTrack]:
        profile = self.taste_service.build(history)
        disliked = {event.track_id for event, _ in history if event.event_type == "dislike"}
        recent_tracks = {event.track_id for event, _ in history[:20]}
        recent_artists = {track.artist_name for _, track in history[:8]}
        seen = {event.track_id for event, _ in history}
        config = channel.config or {}
        discovery_ratio = float(config.get("discoveryRatio", 0.5))
        explore_ratio = float(config.get("exploreRatio", 0.2))
        ranked: list[RankedTrack] = []
        for track in candidates:
            if track.id in explicit_excludes or track.id in disliked or track.id in recent_tracks or track.artist_name in recent_artists:
                continue
            artist_affinity = profile.artists.get(track.artist_name, 0.0)
            genre_affinity = max([profile.genres.get(genre, 0.0) for genre in track.genre or []] or [0.0])
            novelty = 1.0 if track.id not in seen else 0.15
            exploration = random.Random(str(track.id)).random()
            score = (
                0.35 * genre_affinity
                + 0.20 * max(artist_affinity, genre_affinity)
                + 0.15 * novelty
                + 0.10 * artist_affinity
                + 0.10 * discovery_ratio * novelty
                + 0.10 * explore_ratio * exploration
            )
            if skip_counts.get(track.id, 0) >= 2:
                score -= 0.75
            reason = "familiar" if artist_affinity > 0.45 else "discovery" if novelty > 0.5 else "explore"
            ranked.append(RankedTrack(track, score, reason))
        return sorted(ranked, key=lambda item: item.score, reverse=True)

    def fallback(self, candidates: list[Track], forbidden: set[uuid.UUID]) -> Track | None:
        allowed = [track for track in candidates if track.id not in forbidden]
        return max(allowed, key=lambda item: item.popularity, default=None)
