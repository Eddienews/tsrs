---
name: tsrs
description: Drive the TSRS app running on this computer from the terminal with the tsrs command — project folders, motion video renders (MP4), MiniMax H3 video takes on the local GPU (queued), the design check, the production board, scheduled tasks and free local images. Use when the user asks to do something "in TSRS", on its board, in one of its projects, or to render a TSRS motion composition.
---

# tsrs: TSRS from the terminal

TSRS must be running (`npm run dev` in the TSRS folder). The `tsrs` command
talks to it; it never starts it. Run commands from any folder on the same
computer, as the same user.

Start with:

```bash
tsrs status            # is TSRS up, which local servers answer
tsrs --help            # every command
tsrs <command> --help  # its arguments and an example
```

If `tsrs` is not on the PATH, run `node <TSRS folder>/bin/tsrs.mjs` instead
(or `npm link` once in the TSRS folder).

## Rules

- Add `--json` when you need to read the answer: `{ "ok": true, "text", "result" }`
  or `{ "ok": false, "code", "error" }`. The shape stays the same between versions.
- Exit codes: `0` done · `2` wrong arguments (read the message, fix, retry) ·
  `3` needs `--yes` · `4` TSRS is not running (tell the user to start it; do not
  start it yourself unless asked) · `5` failed.
- **Exit 3 means stop and ask the user.** The message says exactly what would
  happen (a file replaced, a paid model called). Only rerun with `--yes` after
  the user agrees. Never add `--yes` on the first try.
- `agenda run` calls a paid model: it always needs the user's go-ahead.
- Board cards and project files are never deleted: `board remove` keeps the
  card with the removed ones, and TSRS brings it back.
- Projects are named by folder name (`tsrs projects list`); cards by id, title,
  or an unambiguous part of the title; columns by id or name.

## Typical work

```bash
tsrs projects new "Cafe Aurora ad"
tsrs projects write cafe-aurora-ad ad.html --from ./ad.html
tsrs design check cafe-aurora-ad ad.html            # pages: what does not fit at 1440/768/390
tsrs render motion cafe-aurora-ad ad.html --audio midia/track.mp3
tsrs board add "Cafe Aurora ad" --kind ad --series "Cafe Aurora" --due 2026-11-07 --project cafe-aurora-ad
tsrs board move "Cafe Aurora ad" render
tsrs image local "a cup of coffee by a window at dawn" --project cafe-aurora-ad
```

## Narrated videos

When a project has a `video.json` (scenes with their lines, voice, music, the
composition, captions, 9:16 — see "Narrated videos" in the TSRS README):

```bash
tsrs video check <project>        # read first: problems, and what a run would make and spend
tsrs video run <project>          # exit 3 when voice lines must be made: ask the user, then --yes
```

In the composition, land animations on the narration with
`NWLab.word('scene-id', 'word')` (seconds) and read `NWLab.timeline`; the
check reports words the script does not say.

A motion composition is an HTML page with `nwlab:size`, `nwlab:duration` and
`nwlab:fps` meta tags whose frames depend only on the time `t` (see "Motion
video" in the TSRS README). The MP4 goes to the project's `videos/`.

## MiniMax H3 takes (video with sound, on this computer's GPU)

Write each shot as a JSON file of the project (`shots/s01.json`), then check it
and queue it. Never write the H3 prompt by hand when a shot file will do: TSRS
writes it in H3's own form with the fixes that are measured.

```json
{ "scene": "...", "size": "MS", "angle": "eye level", "movement": "push-in",
  "beats": ["first thing that happens", "then this"],
  "dialogue": [{ "speaker": "Seu Silva", "voice": "a calm, low voice", "text": "Bom dia.", "language": "pt" }],
  "soundscape": "what is heard", "seconds": 5 }
```

```bash
tsrs h3 prompt <project> shots/s01.json                 # read: the prompt, its frames, what to fix
tsrs take <project> shots/s01.json --image midia/s01.png   # queued; answers at once with a job id
tsrs jobs wait <job id> --seconds 300                   # repeat until it ends (each call ≤ 600 s)
tsrs jobs cancel <job id>                               # also stops it in ComfyUI
```

- Fix every ✗ the check reports; read the ! warnings and fix them unless the
  user wants otherwise.
- Spoken words go only in `dialogue` (never in `scene`, `action` or `beats`),
  with their `language`. At most about 3 words a second (2.8 in Portuguese).
- Say what is there, never "no X" / "sem X": H3 has no negative prompt, so
  naming a thing brings it ("no photographs" puts photographs on the walls).
- One clip is one shot: use `beats`, never `[Shot 2]` (that asks for a cut).
- Lengths are 17n+5 frames at 24 fps: 5 s = 124, 8 s = 192, 10 s = 243, 15 s = 362.
- Frames: `--image` (first), `--last`, both; or `--refs a.png,b.png` (up to 9
  reference pictures of the cast) — not both kinds.
- One take at a time runs on the GPU; queue a scene's shots, then wait. Each
  take writes `takes/<name>.mp4` and `takes/<name>.json` (status `pending`).
  Report the job ids and files that really exist, not what you expect.

## As MCP tools

`tsrs mcp` offers the same commands as an MCP server on stdio (tool names use
`_`: `projects_write`, `board_move`…). Commands that ask for `--yes` take
`yes: true` there, under the same rule: ask the user first.
