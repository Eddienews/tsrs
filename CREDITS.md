# Credits

Ideas, rules and measurements TSRS takes from other projects.

## Imagination Studio by Keys + Wasserman

The MiniMax H3 prompt rules in `server/h3prompt.mjs` follow Imagination Studio
(github.com/drowzeys/Imagination-Studio-by-keys-Wasserman), Apache License 2.0:

- the text-to-video, first/last-frame and reference prompt forms, the line that
  opens a keyframe prompt and the sentence that closes the mouth after a line;
- the camera vocabulary (shot sizes, angles, movements);
- the 17n+5 frame rule, the 7000-character limit and the words-per-second check;
- the negation check ("no X" brings X: H3 has no negative prompt) and the quiet
  sentences for shots without lines;
- the soundscape under its own heading in the reference form.

The take checks in `server/takecheck.mjs` follow its `wordcheck.py` (after
TensorFold's drama3 `verify.py`, Apache-2.0) and `shot.py`: the redo policy
(85 % of the words, 3 missing in a row, the ending), the word alignment with
near misses, and the cut and keyframe thresholds. The FCPXML/EDL/zip export in
`server/nle.mjs` follows its timeline export.

The film plan in `server/film.mjs` follows its Director and Slate: the bible
repeated word for word in every prompt, lines kept out of the picture, a
checked plan answered with exact messages, the shot before as the opening of a
continuous move. The studio leash in `server/cli.mjs` (the agent's tools held
to TSRS, secrets kept out of its environment, the line about material and
instructions), the refusal of a repeated failed call and the ledger in
`server/agent.mjs`, and the bench in `bench/` (briefs with machine-checkable
specs, a dry studio, complete/exact/honest) follow its agent room and bench.

The night shift and its dailies (`server/nightshift.mjs`), the phone access
key and Web Push (`server/access.mjs`) and the turnaround settings and prompt
(`server/comfy.mjs`) follow its night shift, access key, push and turnaround.

## Turnaround

The turnaround runs matlod's Turnaround LoRA (huggingface.co/matlod/minimax-h3-turnaround,
a derivative of MiniMax H3 under its Community License) with MATLOWAI's
contact-sheet nodes (github.com/matlowai/ComfyUI-H3-ContactSheet, GPL-3.0),
both installed in ComfyUI by the user; TSRS only calls ComfyUI over HTTP.

Imagination Studio was built by **Keys (github.com/drowzeys)**, with production
design and workflow by **Sam Wasserman / Wasserman Productions
(wassermanproductions.com)**. The code in TSRS is a new implementation in
JavaScript; the measurements quoted in its comments are theirs.

## ComfyUI-MiniMaxH3-Easy

The H3 take graph in `server/comfy.mjs` (`h3Graph`) follows the workflow that
ships with the ComfyUI-MiniMaxH3-Easy nodes; TSRS only calls ComfyUI over HTTP.

## Models

What a model makes is under that model's own license. MiniMax H3 is licensed
under the MiniMax H3 Community License Agreement, Copyright © 2026 MiniMax, which
limits the territories in which it may be used.
