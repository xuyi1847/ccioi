#!/usr/bin/env python3
"""Read-only-first Music.app capability spike for MHz PoC.

Control tests are opt-in because they change local playback. Catalog testing also
requires an explicit Apple Music URL and never claims success without verifying
the resulting current track and Library membership.
"""
import argparse
import asyncio
import json
import unicodedata
from dataclasses import asdict
from typing import Any
from app.services.providers.mac_music import AppleScriptError, MacMusicProvider


def result(name: str, status: str, detail: Any) -> dict[str, Any]:
    return {"test": name, "status": status, "detail": detail}


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def target_matches(track: Any, expected_title: str, expected_artist: str) -> bool:
    return bool(
        track
        and normalized(track.title) == normalized(expected_title)
        and normalized(track.artist) == normalized(expected_artist)
    )


async def run(args: argparse.Namespace) -> int:
    provider = MacMusicProvider()
    results: list[dict[str, Any]] = []
    try:
        await provider.ensure_available()
        state = await provider.get_player_state()
        results.append(result("current_track", "passed", asdict(state)))
    except Exception as exc:
        results.append(result("current_track", "failed", str(exc)))
        print(json.dumps({"results": results}, ensure_ascii=False, indent=2))
        return 1

    if args.control:
        try:
            await provider.pause()
            await asyncio.sleep(0.5)
            await provider.resume()
            await asyncio.sleep(0.5)
            results.append(result("play_pause", "passed", asdict(await provider.get_player_state())))
        except Exception as exc:
            results.append(result("play_pause", "failed", str(exc)))
        if args.test_next:
            try:
                before = await provider.get_current_track()
                await provider.next()
                await asyncio.sleep(args.wait)
                after = await provider.get_current_track()
                results.append(result("next", "passed" if before != after else "inconclusive", {"before": asdict(before) if before else None, "after": asdict(after) if after else None}))
            except Exception as exc:
                results.append(result("next", "failed", str(exc)))
    else:
        results.append(result("play_pause", "skipped", "Pass --control to change Music.app playback"))
        results.append(result("next", "skipped", "Pass --control --test-next to advance playback"))

    library_tracks = []
    try:
        library_tracks = await provider.list_library_tracks(args.library_limit)
        results.append(result("enumerate_library", "passed", {"count": len(library_tracks), "sample": [asdict(item) for item in library_tracks[:3]]}))
    except Exception as exc:
        results.append(result("enumerate_library", "failed", str(exc)))

    if args.play_library:
        try:
            matches = await provider.find_library_tracks(args.play_library, args.artist)
            if not matches:
                results.append(result("play_specific_library_track", "failed", "No exact Library match"))
            else:
                await provider.play(matches[0])
                await asyncio.sleep(args.wait)
                results.append(result("play_specific_library_track", "passed", asdict(await provider.get_player_state())))
        except Exception as exc:
            results.append(result("play_specific_library_track", "failed", str(exc)))
    else:
        detail = "Use --play-library TITLE [--artist ARTIST] for a non-destructive exact selection"
        if library_tracks:
            detail += f"; example: --play-library {library_tracks[0].title!r} --artist {library_tracks[0].artist!r}"
        results.append(result("play_specific_library_track", "skipped", detail))

    if args.catalog_url:
        if not args.expected_title or not args.expected_artist:
            results.append(result(
                "play_non_library_catalog_track",
                "failed",
                "--catalog-url requires --expected-title and --expected-artist",
            ))
            print(json.dumps({"results": results}, ensure_ascii=False, indent=2))
            return 1
        try:
            before = await provider.get_current_track()
            await provider.open_catalog_url(args.catalog_url)
            await asyncio.sleep(args.wait)
            after = await provider.get_current_track()
            changed = bool(after and (not before or after.provider_id != before.provider_id))
            in_library = await provider.is_in_library(after.provider_id) if after else None
            matches_target = target_matches(after, args.expected_title, args.expected_artist)
            status = "passed" if changed and matches_target and in_library is False else "failed"
            results.append(result("play_non_library_catalog_track", status, {
                "before": asdict(before) if before else None,
                "after": asdict(after) if after else None,
                "expected": {"title": args.expected_title, "artist": args.expected_artist},
                "changed": changed,
                "matchesTarget": matches_target,
                "inLibrary": in_library,
                "criterion": "playback changed, title and artist match, and resulting track is not in Library",
            }))
        except Exception as exc:
            results.append(result("play_non_library_catalog_track", "failed", str(exc)))
    else:
        results.append(result("play_non_library_catalog_track", "not_tested", "Provide --catalog-url with a known Apple Music song URL not already in your Library"))

    print(json.dumps({"results": results}, ensure_ascii=False, indent=2))
    return 1 if any(item["status"] == "failed" for item in results) else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Spike macOS Music.app automation capabilities")
    parser.add_argument("--library-limit", type=int, default=25)
    parser.add_argument("--control", action="store_true", help="Allow pause/resume and explicit playback changes")
    parser.add_argument("--test-next", action="store_true", help="With --control, advance to Music.app's next track")
    parser.add_argument("--play-library", metavar="TITLE", help="Exact Library song title to play")
    parser.add_argument("--artist", help="Optional exact artist for --play-library")
    parser.add_argument("--catalog-url", help="Known Apple Music URL for a song not in your Library")
    parser.add_argument("--expected-title", help="Exact expected title for --catalog-url verification")
    parser.add_argument("--expected-artist", help="Exact expected artist for --catalog-url verification")
    parser.add_argument("--wait", type=float, default=4.0, help="Seconds to wait after changing playback")
    return parser.parse_args()


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(run(parse_args())))
    except (AppleScriptError, KeyboardInterrupt) as exc:
        raise SystemExit(str(exc)) from exc
