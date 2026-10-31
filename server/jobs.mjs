// The GPU queue: long jobs (H3 takes) run one at a time, in order, and answer
// at once with an id. Agents then ask for the job's status, wait for it (at
// most 10 minutes per call) or cancel it — a cancel really stops the work: the
// job gets an AbortSignal and the ComfyUI side interrupts its run.
//
//   const queue = createQueue()
//   const job = queue.submit({ kind: 'take', title, project }, async (job, { signal, progress }) => result)
//   queue.get(id) · queue.list() · await queue.wait([id], 50) · queue.cancel(id)
//
// Jobs live in memory, as long as the TSRS server runs; the last `keep`
// finished ones stay listed.

const ACTIVE = new Set(['queued', 'running', 'canceling'])
export const WAIT_MAX = 600
export const WAIT_DEFAULT = 50

export class QueueError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function createQueue({ max = 20, keep = 50, now = Date.now } = {}) {
  const jobs = new Map()
  const order = []
  const listeners = new Set()
  let running = null
  let counter = 0

  const view = (job) => {
    const { work: _w, controller: _c, ...rest } = job
    return { ...rest, position: job.status === 'queued' ? order.filter((id) => jobs.get(id)?.status === 'queued').indexOf(job.id) + 1 : 0 }
  }
  const changed = () => {
    for (const fn of [...listeners]) fn()
  }

  function prune() {
    const done = order.filter((id) => !ACTIVE.has(jobs.get(id)?.status))
    for (const id of done.slice(0, Math.max(0, done.length - keep))) {
      jobs.delete(id)
      order.splice(order.indexOf(id), 1)
    }
  }

  async function next() {
    if (running) return
    const id = order.find((i) => jobs.get(i)?.status === 'queued')
    if (!id) return
    const job = jobs.get(id)
    running = job
    job.status = 'running'
    job.started = now()
    job.controller = new AbortController()
    changed()
    try {
      const progress = (p) => {
        job.progress = p
        changed()
      }
      job.result = await job.work(view(job), { signal: job.controller.signal, progress })
      job.status = job.controller.signal.aborted ? 'canceled' : 'done'
    } catch (error) {
      job.status = job.controller.signal.aborted ? 'canceled' : 'failed'
      if (job.status === 'failed') job.error = error instanceof Error ? error.message : String(error)
    } finally {
      job.ended = now()
      running = null
      prune()
      changed()
      queueMicrotask(next)
    }
  }

  return {
    submit(info, work) {
      const active = order.filter((id) => ACTIVE.has(jobs.get(id)?.status)).length
      if (active >= max) throw new QueueError('busy', `The queue is full (${max} jobs). Wait for some to end, or cancel one.`)
      const id = `${info.kind ?? 'job'}-${(++counter).toString().padStart(3, '0')}-${now().toString(36).slice(-5)}`
      const job = { id, kind: info.kind ?? 'job', title: info.title ?? '', project: info.project ?? '', params: info.params ?? {}, status: 'queued', created: now(), started: null, ended: null, progress: null, result: null, error: null, work }
      jobs.set(id, job)
      order.push(id)
      changed()
      queueMicrotask(next)
      return view(job)
    },
    get(id) {
      const job = jobs.get(String(id))
      return job ? view(job) : null
    },
    list() {
      return order.map((id) => view(jobs.get(id)))
    },
    busy() {
      return !!running || order.some((id) => jobs.get(id)?.status === 'queued')
    },
    cancel(id) {
      const job = jobs.get(String(id))
      if (!job) throw new QueueError('invalid', `No job ${id}. See: tsrs jobs list`)
      if (job.status === 'queued') {
        job.status = 'canceled'
        job.ended = now()
        changed()
      } else if (job.status === 'running') {
        job.status = 'canceling'
        job.controller.abort()
        changed()
      }
      return view(job)
    },
    // Resolves when every job named has ended, or after `seconds`.
    wait(ids, seconds = WAIT_DEFAULT) {
      const list = (Array.isArray(ids) ? ids : [ids]).map(String)
      for (const id of list) if (!jobs.has(id)) return Promise.reject(new QueueError('invalid', `No job ${id}. See: tsrs jobs list`))
      const limit = Math.max(0, Math.min(WAIT_MAX, Number(seconds) || 0)) * 1000
      const ended = () => list.every((id) => !ACTIVE.has(jobs.get(id)?.status))
      return new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timer)
          listeners.delete(check)
          resolve(list.map((id) => (jobs.has(id) ? view(jobs.get(id)) : { id, status: 'done', gone: true })))
        }
        const check = () => ended() && finish()
        const timer = setTimeout(finish, limit)
        listeners.add(check)
        check()
      })
    },
  }
}
