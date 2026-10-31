---
name: tsrs
description: Drive the TSRS app running on this computer from the terminal with the tsrs command — project folders, motion video renders (MP4), the design check, the production board, scheduled tasks and free local images. Use when the user asks to do something "in TSRS", on its board, in one of its projects, or to render a TSRS motion composition.
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

## As MCP tools

`tsrs mcp` offers the same commands as an MCP server on stdio (tool names use
`_`: `projects_write`, `board_move`…). Commands that ask for `--yes` take
`yes: true` there, under the same rule: ask the user first.
