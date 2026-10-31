// The commands an agent can give TSRS: one list, read by the server
// (server/agent.mjs), the `tsrs` command (bin/tsrs.mjs) and its MCP server.
// No Node imports here, so every side can load it.
//
// Every command has a kind:
//   read         runs any time; changes nothing
//   write        changes something that can be undone or written again
//   destructive  loses something; only says what it would do until --yes
//   cost         spends money (a paid model); only says what it would do until --yes
//
// `asks`: a write command that also stops for --yes in some cases (replacing a
// file). Destructive and cost commands always do.
//
// Arguments: `at` gives the position of a positional argument (tsrs projects
// read <project> <file>); the others are --flags. `list` is comma-separated.

export const KINDS = ['read', 'write', 'destructive', 'cost']

export const COMMANDS = [
  {
    name: 'status',
    kind: 'read',
    summary: 'What is running: version, projects folder, renderer, local image and audio servers, schedule.',
    args: [],
    example: 'tsrs status',
  },
  {
    name: 'projects list',
    kind: 'read',
    summary: 'The project folders, newest first.',
    args: [],
    example: 'tsrs projects list',
  },
  {
    name: 'projects files',
    kind: 'read',
    summary: "A project's files, with size and date.",
    args: [{ name: 'project', at: 0, required: true, help: 'folder name in the projects folder, or its full path' }],
    example: 'tsrs projects files northwind-lab-page',
  },
  {
    name: 'projects read',
    kind: 'read',
    summary: 'A text file of a project, whole or a range of lines.',
    args: [
      { name: 'project', at: 0, required: true, help: 'project folder' },
      { name: 'file', at: 1, required: true, help: 'path inside the project' },
      { name: 'lines', help: 'a range, like 1:80' },
    ],
    example: 'tsrs projects read northwind-lab-page index.html --lines 1:40',
  },
  {
    name: 'projects new',
    kind: 'write',
    summary: 'Creates a project folder, with NOTES.md.',
    args: [{ name: 'name', at: 0, required: true, help: 'a name; the folder is named after it' }],
    example: 'tsrs projects new "Cafe Aurora ad"',
  },
  {
    name: 'projects write',
    kind: 'write',
    summary: 'Writes a file into a project (text or binary) and notes it in NOTES.md. Replacing a file asks for --yes.',
    asks: true,
    args: [
      { name: 'project', at: 0, required: true, help: 'project folder' },
      { name: 'file', at: 1, required: true, help: 'path inside the project' },
      { name: 'from', help: 'a file on this computer to copy in' },
      { name: 'text', help: 'the content, when not --from' },
    ],
    example: 'tsrs projects write northwind-lab-page midia/logo.png --from ./logo.png',
  },
  {
    name: 'render motion',
    kind: 'write',
    summary: "Renders a motion composition (an HTML page of the project) to MP4, in the project's videos/.",
    args: [
      { name: 'project', at: 0, required: true, help: 'project folder' },
      { name: 'file', at: 1, required: true, help: 'the composition, like motion-1.html' },
      { name: 'audio', help: 'a soundtrack inside the project, like midia/track.mp3' },
      { name: 'name', help: 'the video file name (without .mp4)' },
    ],
    example: 'tsrs render motion cafe-aurora-ad cafe-aurora.html --audio midia/track.mp3',
  },
  {
    name: 'video check',
    kind: 'read',
    summary: "Reads a project's narrated video script (video.json) and says what is missing or wrong, and what a run would make and spend.",
    args: [
      { name: 'project', at: 0, required: true, help: 'project folder' },
      { name: 'spec', help: 'the script file (default video.json)' },
    ],
    example: 'tsrs video check formulario-seguro',
  },
  {
    name: 'video run',
    kind: 'write',
    asks: true,
    summary: 'Makes the narrated video of video.json: voice, word timing, mix, render, captions, 9:16 copy, manifest. Making voice (Runware) asks for --yes.',
    args: [
      { name: 'project', at: 0, required: true, help: 'project folder' },
      { name: 'spec', help: 'the script file (default video.json)' },
    ],
    example: 'tsrs video run formulario-seguro --yes',
  },
  {
    name: 'h3 prompt',
    kind: 'read',
    summary: "Writes a shot (a JSON file of the project) as a MiniMax H3 prompt: its frames, the prompt and what to fix before a take.",
    args: [
      { name: 'project', at: 0, required: true, help: 'project folder' },
      { name: 'shot', at: 1, required: true, help: 'the shot file, like shots/s01.json (see the tsrs skill for its fields)' },
    ],
    example: 'tsrs h3 prompt seu-silva-ep07 shots/s01.json',
  },
  {
    name: 'take',
    kind: 'write',
    summary: "Queues a MiniMax H3 take on this computer's ComfyUI (free) and answers at once with a job id; the video and its notes go to the project's takes/.",
    args: [
      { name: 'project', at: 0, required: true, help: 'project folder' },
      { name: 'shot', at: 1, help: 'the shot file (JSON); or give --prompt' },
      { name: 'prompt', help: 'a ready H3 prompt, instead of a shot file' },
      { name: 'image', help: 'first frame, a picture of the project' },
      { name: 'last', help: 'last frame, a picture of the project' },
      { name: 'refs', type: 'list', help: 'reference pictures of the project (up to 9), for reference mode' },
      { name: 'seconds', type: 'number', help: 'length; snapped to the 17n+5 frames H3 takes (default 5)' },
      { name: 'resolution', help: '360P 416P 480P 540P 640P 720P 768P 832P (default 540P)' },
      { name: 'aspect', help: '16:9 9:16 1:1 4:3 3:4 2:3 3:2 21:9 (default 16:9)' },
      { name: 'seed', type: 'number', help: 'the seed (default: a new one)' },
      { name: 'steps', type: 'number', help: 'sampling steps (default 4 with the speed LoRA, else 20)' },
      { name: 'name', help: 'the take file name (without .mp4)' },
      { name: 'wait', type: 'number', help: 'seconds to wait for it before answering (default 0, at most 600)' },
    ],
    example: 'tsrs take seu-silva-ep07 shots/s01.json --image midia/s01-first.png',
  },
  {
    name: 'jobs list',
    kind: 'read',
    summary: 'The GPU queue: jobs waiting, running and recently ended.',
    args: [],
    example: 'tsrs jobs list',
  },
  {
    name: 'jobs status',
    kind: 'read',
    summary: 'One job: its state, place in the queue, and what it made or why it failed.',
    args: [{ name: 'job', at: 0, required: true, help: 'the job id' }],
    example: 'tsrs jobs status take-001-k3x9a',
  },
  {
    name: 'jobs wait',
    kind: 'read',
    summary: 'Waits until the jobs end, at most --seconds (default 50, at most 600), then says where each one is.',
    args: [
      { name: 'jobs', at: 0, required: true, type: 'list', help: 'job ids, comma-separated' },
      { name: 'seconds', type: 'number', help: 'how long to wait at most' },
    ],
    example: 'tsrs jobs wait take-001-k3x9a --seconds 300',
  },
  {
    name: 'jobs cancel',
    kind: 'write',
    summary: 'Cancels a job: taken off the queue, or stopped in ComfyUI if it is running.',
    args: [{ name: 'job', at: 0, required: true, help: 'the job id' }],
    example: 'tsrs jobs cancel take-001-k3x9a',
  },
  {
    name: 'design check',
    kind: 'read',
    summary: 'Opens a page of the project at three widths and reports what does not fit; the pictures go to .taste-skill/inspect/.',
    args: [
      { name: 'project', at: 0, required: true, help: 'project folder' },
      { name: 'file', at: 1, required: true, help: 'an HTML page of the project' },
      { name: 'widths', type: 'list', help: 'up to three of 1440,1280,1024,768,390,375' },
    ],
    example: 'tsrs design check northwind-lab-page index.html',
  },
  {
    name: 'board list',
    kind: 'read',
    summary: 'The cards on the production board, by column.',
    args: [{ name: 'column', help: 'only this column (its id or name)' }],
    example: 'tsrs board list --column takes',
  },
  {
    name: 'board add',
    kind: 'write',
    summary: 'Adds a card to the production board.',
    args: [
      { name: 'title', at: 0, required: true, help: 'the card title' },
      { name: 'column', help: 'its id or name (default: the first)' },
      { name: 'kind', help: 'episodio, ad or outro' },
      { name: 'series', help: 'a series or client' },
      { name: 'language', help: 'a language or version, like EN' },
      { name: 'due', help: 'due date, YYYY-MM-DD' },
      { name: 'notes', help: 'notes' },
      { name: 'project', help: 'the project folder of the work' },
    ],
    example: 'tsrs board add "Cafe Aurora ad" --kind ad --series "Cafe Aurora" --due 2026-11-07',
  },
  {
    name: 'board move',
    kind: 'write',
    summary: 'Moves a card to a column.',
    args: [
      { name: 'card', at: 0, required: true, help: "the card's id or title" },
      { name: 'column', at: 1, required: true, help: "the column's id or name" },
    ],
    example: 'tsrs board move "Cafe Aurora ad" render',
  },
  {
    name: 'board update',
    kind: 'write',
    summary: "Changes a card's fields.",
    args: [
      { name: 'card', at: 0, required: true, help: "the card's id or title" },
      { name: 'title', help: 'new title' },
      { name: 'kind', help: 'episodio, ad or outro' },
      { name: 'series', help: 'a series or client' },
      { name: 'language', help: 'a language or version' },
      { name: 'due', help: 'due date, YYYY-MM-DD' },
      { name: 'notes', help: 'notes' },
      { name: 'project', help: 'the project folder of the work' },
    ],
    example: 'tsrs board update "Cafe Aurora ad" --due 2026-11-10',
  },
  {
    name: 'board remove',
    kind: 'write',
    summary: 'Takes a card off the board; it is kept with the removed cards and can be brought back in TSRS.',
    args: [{ name: 'card', at: 0, required: true, help: "the card's id or title" }],
    example: 'tsrs board remove "Old test card"',
  },
  {
    name: 'agenda list',
    kind: 'read',
    summary: 'The scheduled tasks: what, when, with which model, and the last run.',
    args: [],
    example: 'tsrs agenda list',
  },
  {
    name: 'agenda run',
    kind: 'cost',
    summary: 'Runs a scheduled task now; it calls its (paid) model. The answer waits in TSRS.',
    args: [{ name: 'task', at: 0, required: true, help: "the task's id or name" }],
    example: 'tsrs agenda run "AI news digest" --yes',
  },
  {
    name: 'image local',
    kind: 'write',
    summary: "Makes an image on this computer, free (ComfyUI or sd-server), into the project's midia/.",
    args: [
      { name: 'prompt', at: 0, required: true, help: 'what the image shows' },
      { name: 'project', required: true, help: 'project folder' },
      { name: 'engine', help: 'comfy or sdcpp (default: the one running)' },
      { name: 'width', type: 'number', help: 'pixels' },
      { name: 'height', type: 'number', help: 'pixels' },
      { name: 'name', help: 'file name (without .png)' },
    ],
    example: 'tsrs image local "a cup of coffee by a window at dawn" --project cafe-aurora-ad',
  },
]

export function needsYes(command) {
  return command.asks === true || command.kind === 'destructive' || command.kind === 'cost'
}

export function findCommand(name) {
  return COMMANDS.find((c) => c.name === name)
}

// Turns command-line words into a command and its arguments:
// ['projects', 'read', 'site', 'index.html', '--lines', '1:9'] →
// { command, args: { project: 'site', file: 'index.html', lines: '1:9' }, yes, json }.
export function parseWords(words) {
  const flags = { yes: false, json: false, help: false }
  const loose = []
  const named = {}
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (word === '--yes' || word === '-y') flags.yes = true
    else if (word === '--json') flags.json = true
    else if (word === '--help' || word === '-h') flags.help = true
    else if (word.startsWith('--')) {
      const eq = word.indexOf('=')
      const key = eq > 0 ? word.slice(2, eq) : word.slice(2)
      const value = eq > 0 ? word.slice(eq + 1) : words[i + 1]
      if (eq < 0) i++
      if (value === undefined) throw usage(`--${key} needs a value.`)
      named[key] = value
    } else loose.push(word)
  }
  const command = COMMANDS.find((c) => {
    const parts = c.name.split(' ')
    return parts.every((part, i) => loose[i] === part)
  })
  if (!command) return { command: null, words: loose, ...flags }
  const positional = loose.slice(command.name.split(' ').length)
  const args = {}
  for (const arg of command.args) {
    const raw = arg.at !== undefined ? positional[arg.at] : named[arg.name]
    if (raw === undefined) continue
    args[arg.name] = arg.type === 'number' ? Number(raw) : arg.type === 'list' ? String(raw).split(',').map((s) => s.trim()).filter(Boolean) : raw
  }
  const known = new Set(command.args.filter((a) => a.at === undefined).map((a) => a.name))
  const unknown = Object.keys(named).filter((k) => !known.has(k))
  if (unknown.length) throw usage(`${command.name} takes no --${unknown[0]}.`)
  const extra = positional.length - command.args.filter((a) => a.at !== undefined).length
  if (extra > 0) throw usage(`Too many words for ${command.name}: ${positional.slice(-extra).join(' ')}`)
  return { command, args, ...flags }
}

// Missing or wrong arguments, before anything is sent.
export function checkArgs(command, args) {
  for (const arg of command.args) {
    if (arg.required && (args[arg.name] === undefined || args[arg.name] === '')) throw usage(`${command.name} needs <${arg.name}>.`)
    if (arg.type === 'number' && args[arg.name] !== undefined && !Number.isFinite(args[arg.name])) {
      throw usage(`--${arg.name} must be a number.`)
    }
  }
}

function usage(message) {
  return Object.assign(new Error(message), { code: 'invalid' })
}

// The help for one command, or for all.
export function helpText(command) {
  if (command) {
    const words = command.args.filter((a) => a.at !== undefined).map((a) => `<${a.name}>`)
    const lines = [`tsrs ${command.name} ${words.join(' ')}`.trim(), '', `${command.summary} [${command.kind}]`, '']
    for (const arg of command.args) {
      const name = arg.at !== undefined ? `<${arg.name}>` : `--${arg.name}`
      lines.push(`  ${name.padEnd(14)} ${arg.help}${arg.required && arg.at === undefined ? ' (required)' : ''}`)
    }
    if (needsYes(command)) lines.push(`  ${'--yes'.padEnd(14)} do it (without, it only says what it would do)`)
    lines.push(`  ${'--json'.padEnd(14)} the answer as JSON`, '', `Example: ${command.example}`)
    return lines.join('\n')
  }
  const width = Math.max(...COMMANDS.map((c) => c.name.length))
  return [
    'tsrs: use TSRS from a terminal or an agent. It talks to the TSRS that is running (npm run dev).',
    '',
    ...COMMANDS.map((c) => `  tsrs ${c.name.padEnd(width)}  ${c.kind.padEnd(11)} ${c.summary.split('. ')[0].replace(/\.$/, '')}`),
    '',
    '  tsrs mcp' + ' '.repeat(Math.max(1, width - 1)) + ' the same commands as an MCP server (stdio)',
    '',
    'read: changes nothing · write: can be undone or written again · destructive, cost: only with --yes',
    'Add --json for a stable JSON answer, --help after a command for its arguments.',
    'Exit codes: 0 done · 2 wrong arguments · 3 needs --yes · 4 TSRS is not running · 5 failed',
  ].join('\n')
}
