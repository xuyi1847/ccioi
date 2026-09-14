from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from app.models import Track, UserTrackEvent


@dataclass(slots=True)
class TasteProfile:
    artists: dict[str, float] = field(default_factory=dict)
    genres: dict[str, float] = field(default_factory=dict)
    composers: dict[str, float] = field(default_factory=dict)
    decades: dict[str, float] = field(default_factory=dict)
    languages: dict[str, float] = field(default_factory=dict)
    durations: dict[str, float] = field(default_factory=dict)


class TasteProfileService:
    @staticmethod
    def track_features(track: Track) -> dict[str, list[str]]:
        provider_metadata = track.providers[0].provider_metadata if getattr(track, "providers", None) else {}
        release_date = provider_metadata.get("releaseDate") or (track.release_date.isoformat() if track.release_date else "")
        try:
            decade = f"{int(str(release_date)[:4]) // 10 * 10}s" if release_date else ""
        except ValueError:
            decade = ""
        duration = track.duration_ms or provider_metadata.get("durationInMillis") or 0
        duration_bucket = "short" if duration and duration < 180_000 else "long" if duration > 300_000 else "medium"
        language = track.metadata_json.get("language") or provider_metadata.get("language") or ""
        composer = provider_metadata.get("composerName") or ""
        return {
            "artists": [track.artist_name] if track.artist_name else [],
            "genres": list(track.genre or []),
            "composers": [composer] if composer else [],
            "decades": [decade] if decade else [],
            "languages": [str(language)] if language else [],
            "durations": [duration_bucket],
        }

    @staticmethod
    def event_weight(event: UserTrackEvent) -> float:
        ratio = (event.play_duration_ms or 0) / max(event.track_duration_ms or 1, 1)
        if event.event_type == "favorite": return 5.0
        if event.event_type == "replay": return 3.0
        if event.event_type == "play_complete": return 1.5
        if event.event_type == "dislike": return -5.0
        if event.event_type == "skip": return -2.0 if ratio < 0.2 else -1.0
        if ratio >= 0.8: return 1.0
        if ratio >= 0.5: return 0.3
        return 0.0

    def build(self, history: list[tuple[UserTrackEvent, Track]]) -> TasteProfile:
        values: dict[str, defaultdict[str, float]] = {
            key: defaultdict(float) for key in ("artists", "genres", "composers", "decades", "languages", "durations")
        }
        favorite_state_seen: set[object] = set()
        for event, track in history:
            if event.event_type in {"favorite", "unfavorite"}:
                if event.track_id in favorite_state_seen:
                    continue
                favorite_state_seen.add(event.track_id)
                if event.event_type == "unfavorite":
                    continue
            weight = self.event_weight(event)
            created_at = event.created_at
            if created_at:
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                age_days = max(0.0, (datetime.now(timezone.utc) - created_at).total_seconds() / 86400)
                weight *= 0.5 ** (age_days / 60)
            for group, features in self.track_features(track).items():
                for feature in features:
                    values[group][feature] += weight

        def normalized(group: str) -> dict[str, float]:
            scale = max([1.0, *[abs(value) for value in values[group].values()]])
            return {key: value / scale for key, value in values[group].items()}

        return TasteProfile(**{group: normalized(group) for group in values})
