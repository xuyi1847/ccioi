import asyncio
from dataclasses import dataclass

FIELD_SEPARATOR = "␟"
ROW_SEPARATOR = "␞"


class MacMusicError(RuntimeError):
    pass


@dataclass(slots=True)
class MacTrack:
    persistent_id: str
    title: str
    artist: str
    album: str | None
    duration: float | None


async def run_applescript(script: str, timeout: float = 30) -> str:
    process = await asyncio.create_subprocess_exec(
        "/usr/bin/osascript", "-e", script,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout)
    except TimeoutError:
        process.kill();await process.wait()
        raise MacMusicError("Music.app automation timed out") from None
    if process.returncode:
        raise MacMusicError(stderr.decode(errors="replace").strip() or "Music.app automation failed")
    return stdout.decode(errors="replace").strip()


def quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def parse_track(row: str) -> MacTrack:
    fields = row.split(FIELD_SEPARATOR)
    if len(fields) != 5:
        raise MacMusicError("Unexpected Music.app track response")
    return MacTrack(fields[0], fields[1], fields[2], fields[3] or None, float(fields[4]) if fields[4] else None)


class MacMusicService:
    async def list_tracks(self, limit: int = 100) -> list[MacTrack]:
        script = f'''
tell application "Music"
    set allTracks to every track of library playlist 1
    set itemCount to count of allTracks
    if itemCount > {limit} then set itemCount to {limit}
    set output to ""
    repeat with i from 1 to itemCount
        set t to item i of allTracks
        set output to output & (persistent ID of t as text) & "{FIELD_SEPARATOR}" & (name of t as text) & "{FIELD_SEPARATOR}" & (artist of t as text) & "{FIELD_SEPARATOR}" & (album of t as text) & "{FIELD_SEPARATOR}" & (duration of t as text) & "{ROW_SEPARATOR}"
    end repeat
    return output
end tell
'''
        raw = await run_applescript(script, max(30, min(180, limit / 5)))
        return [parse_track(row.strip()) for row in raw.split(ROW_SEPARATOR) if row.strip()]

    async def play(self, persistent_id: str) -> MacTrack:
        script = f'''
tell application "Music"
    activate
    set matches to every track of library playlist 1 whose persistent ID is {quote(persistent_id)}
    if (count of matches) is 0 then error "Track not found in Music Library"
    play item 1 of matches with once
end tell
'''
        await run_applescript(script)
        await asyncio.sleep(1)
        state = await self.state()
        if state["state"] != "playing" or not state["track"] or state["track"].persistent_id != persistent_id:
            raise MacMusicError("Music.app did not start the selected track")
        return state["track"]

    async def pause(self) -> None:
        await run_applescript('tell application "Music" to pause')

    async def resume(self) -> None:
        await run_applescript('tell application "Music" to play')

    async def state(self) -> dict:
        script = f'''
tell application "Music"
    set stateName to player state as text
    if stateName is "stopped" then return stateName & "||0||"
    set t to current track
    return stateName & "||" & (player position as text) & "||" & (persistent ID of t as text) & "{FIELD_SEPARATOR}" & (name of t as text) & "{FIELD_SEPARATOR}" & (artist of t as text) & "{FIELD_SEPARATOR}" & (album of t as text) & "{FIELD_SEPARATOR}" & (duration of t as text)
end tell
'''
        raw = await run_applescript(script)
        state, position, track = (raw.split("||", 2) + [""])[:3]
        return {"state": state, "position": float(position or 0), "track": parse_track(track) if track else None}
