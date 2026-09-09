import asyncio
from collections.abc import Sequence
from app.services.providers.base import PlaybackProvider, PlaybackState, PlaybackTrack

FIELD_SEPARATOR = "␟"
ROW_SEPARATOR = "␞"


class AppleScriptError(RuntimeError):
    pass


async def run_applescript(script: str, *, timeout: float = 30) -> str:
    """Run all Music.app automation through one auditable subprocess boundary."""
    process = await asyncio.create_subprocess_exec(
        "/usr/bin/osascript", "-e", script,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
    except TimeoutError:
        process.kill()
        await process.wait()
        raise AppleScriptError(f"Music.app automation timed out after {timeout:g}s") from None
    if process.returncode != 0:
        message = stderr.decode("utf-8", errors="replace").strip()
        raise AppleScriptError(message or f"osascript exited with {process.returncode}")
    return stdout.decode("utf-8", errors="replace").strip()


def _quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _optional_text(value: str) -> str | None:
    value = value.strip()
    return value or None


def _parse_track(value: str) -> PlaybackTrack | None:
    if not value:
        return None
    fields = value.split(FIELD_SEPARATOR)
    if len(fields) < 8:
        raise AppleScriptError(f"Unexpected Music.app track payload: {value!r}")
    return PlaybackTrack(
        provider_id=fields[0], title=fields[1], artist=fields[2], album=_optional_text(fields[3]),
        duration_seconds=float(fields[4]) if fields[4] else None,
        genre=_optional_text(fields[5]), year=int(fields[6]) if fields[6] not in {"", "0"} else None,
        database_id=int(fields[7]) if fields[7] else None,
    )


class MacMusicProvider(PlaybackProvider):
    name = "mac_music"

    async def ensure_available(self) -> None:
        result = await run_applescript('tell application "Music" to launch\nreturn "ok"')
        if result != "ok":
            raise AppleScriptError("Music.app did not acknowledge launch")

    async def pause(self) -> None:
        await run_applescript('tell application "Music" to pause')

    async def resume(self) -> None:
        await run_applescript('tell application "Music" to play')

    async def next(self) -> None:
        await run_applescript('tell application "Music" to next track')

    async def play(self, track: PlaybackTrack) -> None:
        if not track.provider_id:
            raise ValueError("A Music.app persistent ID is required")
        persistent_id = _quote(track.provider_id)
        script = f'''
tell application "Music"
    set matches to (every track of library playlist 1 whose persistent ID is {persistent_id})
    if (count of matches) is 0 then error "Track is not present in the Music Library"
    play item 1 of matches
end tell
'''
        await run_applescript(script)

    async def get_current_track(self) -> PlaybackTrack | None:
        script = f'''
tell application "Music"
    if player state is stopped then return ""
    set t to current track
    return (persistent ID of t as text) & "{FIELD_SEPARATOR}" & (name of t as text) & "{FIELD_SEPARATOR}" & (artist of t as text) & "{FIELD_SEPARATOR}" & (album of t as text) & "{FIELD_SEPARATOR}" & (duration of t as text) & "{FIELD_SEPARATOR}" & (genre of t as text) & "{FIELD_SEPARATOR}" & (year of t as text) & "{FIELD_SEPARATOR}" & (database ID of t as text)
end tell
'''
        return _parse_track(await run_applescript(script))

    async def get_player_state(self) -> PlaybackState:
        script = '''
tell application "Music"
    set stateName to player state as text
    if player state is stopped then return stateName & "||0"
    return stateName & "||" & (player position as text)
end tell
'''
        raw = await run_applescript(script)
        state, position = (raw.split("||", 1) + ["0"])[:2]
        return PlaybackState(state=state, position_seconds=float(position or 0), track=await self.get_current_track())

    async def list_library_tracks(self, limit: int = 100) -> list[PlaybackTrack]:
        if limit < 1 or limit > 10000:
            raise ValueError("limit must be between 1 and 10000")
        script = f'''
tell application "Music"
    set allTracks to every track of library playlist 1
    set output to ""
    set itemCount to count of allTracks
    if itemCount > {limit} then set itemCount to {limit}
    repeat with i from 1 to itemCount
        set t to item i of allTracks
        set output to output & (persistent ID of t as text) & "{FIELD_SEPARATOR}" & (name of t as text) & "{FIELD_SEPARATOR}" & (artist of t as text) & "{FIELD_SEPARATOR}" & (album of t as text) & "{FIELD_SEPARATOR}" & (duration of t as text) & "{FIELD_SEPARATOR}" & (genre of t as text) & "{FIELD_SEPARATOR}" & (year of t as text) & "{FIELD_SEPARATOR}" & (database ID of t as text) & "{ROW_SEPARATOR}"
    end repeat
    return output
end tell
'''
        raw = await run_applescript(script, timeout=max(30, min(300, limit / 10)))
        return [parsed for row in raw.split(ROW_SEPARATOR) if row.strip() and (parsed := _parse_track(row.strip()))]

    async def is_in_library(self, persistent_id: str) -> bool:
        script = f'''tell application "Music" to return (count of (every track of library playlist 1 whose persistent ID is {_quote(persistent_id)})) > 0'''
        return (await run_applescript(script)).casefold() == "true"

    async def open_catalog_url(self, url: str) -> None:
        if not url.startswith(("https://music.apple.com/", "music://")):
            raise ValueError("Only Apple Music catalog URLs are allowed")
        await run_applescript(f'open location {_quote(url)}')

    async def find_library_tracks(self, title: str, artist: str | None = None, limit: int = 20) -> Sequence[PlaybackTrack]:
        title_clause = f'name is {_quote(title)}'
        artist_clause = f' and artist is {_quote(artist)}' if artist else ""
        script = f'''
tell application "Music"
    set matches to (every track of library playlist 1 whose {title_clause}{artist_clause})
    set output to ""
    set itemCount to count of matches
    if itemCount > {limit} then set itemCount to {limit}
    repeat with i from 1 to itemCount
        set t to item i of matches
        set output to output & (persistent ID of t as text) & "{FIELD_SEPARATOR}" & (name of t as text) & "{FIELD_SEPARATOR}" & (artist of t as text) & "{FIELD_SEPARATOR}" & (album of t as text) & "{FIELD_SEPARATOR}" & (duration of t as text) & "{FIELD_SEPARATOR}" & (genre of t as text) & "{FIELD_SEPARATOR}" & (year of t as text) & "{FIELD_SEPARATOR}" & (database ID of t as text) & "{ROW_SEPARATOR}"
    end repeat
    return output
end tell
'''
        raw = await run_applescript(script)
        return [parsed for row in raw.split(ROW_SEPARATOR) if row.strip() and (parsed := _parse_track(row.strip()))]
