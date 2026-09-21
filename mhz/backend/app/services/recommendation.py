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
        disliked = {event.track_id for event, _ in history if event.event_type in {"dislike", "unavailable"}}
        plays = [(event, track) for event, track in history if event.event_type == "play_start"]
        recent_track_window = 12 if channel.id == "familiar" else 20
        recent_artist_window = 4 if channel.id == "familiar" else 12 if channel.id == "roam" else 8
        recent_track_list = list(dict.fromkeys(event.track_id for event, _ in plays))[:recent_track_window]
        recent_artist_list = list(dict.fromkeys(track.artist_name for _, track in plays))[:recent_artist_window]
        recent_tracks = set(recent_track_list)
        recent_artists = set(recent_artist_list)
        exposed = {event.track_id for event, _ in history if event.event_type == "impression"}
        heard = {event.track_id for event, _ in history if event.event_type in {"play_start", "play_30s", "play_complete", "skip", "favorite", "replay"}}
        config = channel.config or {}
        familiar_ratio = float(config.get("familiarRatio", 0.3))
        discovery_ratio = float(config.get("discoveryRatio", 0.5))
        explore_ratio = float(config.get("exploreRatio", 0.2))
        ranked: list[RankedTrack] = []
        for track in candidates:
            if track.id in explicit_excludes or track.id in disliked or track.id in recent_tracks or track.artist_name in recent_artists:
                continue
            artist_affinity = profile.artists.get(track.artist_name, 0.0)
            genre_affinity = max([profile.genres.get(genre, 0.0) for genre in track.genre or []] or [0.0])
            features = self.taste_service.track_features(track)
            composer_affinity = max([profile.composers.get(value, 0.0) for value in features["composers"]] or [0.0])
            decade_affinity = max([profile.decades.get(value, 0.0) for value in features["decades"]] or [0.0])
            language_affinity = max([profile.languages.get(value, 0.0) for value in features["languages"]] or [0.0])
            duration_affinity = max([profile.durations.get(value, 0.0) for value in features["durations"]] or [0.0])
            novelty = 1.0 if track.id not in exposed and track.id not in heard else 0.72 if track.id not in heard else 0.10
            exploration = random.Random(str(track.id)).random()
            affinity = 0.30 * artist_affinity + 0.30 * genre_affinity + 0.12 * composer_affinity + 0.10 * decade_affinity + 0.10 * language_affinity + 0.08 * duration_affinity
            familiarity = max(0.0, affinity)
            discovery = novelty * max(0.12, 0.68 + 0.32 * genre_affinity)
            serendipity = novelty * (0.75 * (1.0 - max(0.0, affinity)) + 0.25 * exploration)
            score = familiar_ratio * familiarity + discovery_ratio * discovery + explore_ratio * serendipity + 0.05 * max(0.0, min(1.0, track.popularity))
            if channel.id == "familiar" and track.id in heard:
                score += 0.22
            elif channel.id == "discovery" and track.id not in heard:
                score += 0.16
            elif channel.id == "roam":
                score += 0.22 * serendipity - 0.10 * familiarity
            if affinity < 0:
                score += 0.35 * affinity
            if skip_counts.get(track.id, 0) >= 2:
                score -= 0.75
            affinities = {"artist": artist_affinity, "genre": genre_affinity, "composer": composer_affinity, "era": decade_affinity, "language": language_affinity}
            best_reason, best_affinity = max(affinities.items(), key=lambda item: item[1])
            reason = "familiar" if channel.id == "familiar" and track.id in heard else "explore" if channel.id == "roam" and serendipity > .5 else best_reason if best_affinity > 0.2 else "discovery" if novelty > 0.5 else "explore"
            ranked.append(RankedTrack(track, score, reason))
        return sorted(ranked, key=lambda item: item.score, reverse=True)

    @staticmethod
    def choose(ranked: list[RankedTrack], rng: random.Random | None = None) -> RankedTrack | None:
        """Weighted sampling keeps quality high without repeating the same deterministic top result."""
        pool = ranked[:20]
        if not pool:
            return None
        generator = rng or random.SystemRandom()
        floor = min(item.score for item in pool)
        weights = [max(0.05, item.score - floor + 0.05) ** 1.6 for item in pool]
        return generator.choices(pool, weights=weights, k=1)[0]

    @staticmethod
    def blend_collaborative(ranked: list[RankedTrack], collaborative_scores: dict[uuid.UUID, float], weight: float = 0.25) -> list[RankedTrack]:
        if not collaborative_scores:
            return ranked
        blended: list[RankedTrack] = []
        for item in ranked:
            collaborative = collaborative_scores.get(item.track.id, 0.0)
            reason = "collaborative" if collaborative >= 0.35 else item.reason
            blended.append(RankedTrack(item.track, (1 - weight) * item.score + weight * collaborative, reason))
        return sorted(blended, key=lambda item: item.score, reverse=True)

    def fallback(self, candidates: list[Track], forbidden: set[uuid.UUID]) -> Track | None:
        allowed = [track for track in candidates if track.id not in forbidden]
        return max(allowed, key=lambda item: item.popularity, default=None)
