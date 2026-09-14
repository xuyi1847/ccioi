from collections import defaultdict
from dataclasses import dataclass, field
from app.models import Track, UserTrackEvent


@dataclass(slots=True)
class TasteProfile:
    artists: dict[str, float] = field(default_factory=dict)
    genres: dict[str, float] = field(default_factory=dict)


class TasteProfileService:
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
        artists: defaultdict[str, float] = defaultdict(float)
        genres: defaultdict[str, float] = defaultdict(float)
        favorite_state_seen: set[object] = set()
        for event, track in history:
            if event.event_type in {"favorite", "unfavorite"}:
                if event.track_id in favorite_state_seen:
                    continue
                favorite_state_seen.add(event.track_id)
                if event.event_type == "unfavorite":
                    continue
            weight = self.event_weight(event)
            artists[track.artist_name] += weight
            for genre in track.genre or []:
                genres[genre] += weight
        scale = max([1.0, *[abs(value) for value in [*artists.values(), *genres.values()]]])
        return TasteProfile(
            artists={key: value / scale for key, value in artists.items()},
            genres={key: value / scale for key, value in genres.items()},
        )
