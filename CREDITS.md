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
