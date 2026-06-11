// Dev verification helper: connect to the running app over CDP,
// capture console errors, evaluate an expression, and screenshot the window.
// Usage: node scripts/cdp.mjs [screenshot <outfile>] | [eval '<js>']
import WebSocket from 'ws'

const PORT = process.env.CDP_PORT ?? 9223

async function target() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`)
  const pages = await res.json()
  const page = pages.find((p) => p.type === 'page' && !p.url.startsWith('devtools'))
  if (!page) throw new Error('No page target found')
  return page
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { perMessageDeflate: false })
    let id = 0
    const pending = new Map()
    const events = []
    ws.on('open', () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res2, rej2) => {
            const mid = ++id
            pending.set(mid, { res2, rej2 })
            ws.send(JSON.stringify({ id: mid, method, params }))
          }),
        events,
        close: () => ws.close()
      })
    )
    ws.on('error', reject)
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      if (msg.id && pending.has(msg.id)) {
        const { res2, rej2 } = pending.get(msg.id)
        pending.delete(msg.id)
        msg.error ? rej2(new Error(msg.error.message)) : res2(msg.result)
      } else if (msg.method) {
        events.push(msg)
      }
    })
  })
}

const page = await target()
const cdp = await connect(page.webSocketDebuggerUrl)
const [cmd, arg] = process.argv.slice(2)

await cdp.send('Runtime.enable')
await cdp.send('Log.enable')

if (cmd === 'screenshot') {
  // CDP_SIZE=1760x1100 renders at a fixed viewport (2x) regardless of window size
  const size = process.env.CDP_SIZE
  if (size) {
    const [w, h] = size.split('x').map(Number)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 2,
      mobile: false
    })
    await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' })
    await new Promise((r) => setTimeout(r, 400))
  }
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: Boolean(size)
  })
  if (size) await cdp.send('Emulation.clearDeviceMetricsOverride')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(arg ?? '/tmp/app.png', Buffer.from(shot.data, 'base64'))
  console.log('saved', arg ?? '/tmp/app.png')
} else if (cmd === 'eval') {
  const result = await cdp.send('Runtime.evaluate', {
    expression: arg,
    returnByValue: true,
    awaitPromise: true
  })
  console.log(JSON.stringify(result.result?.value ?? result, null, 2))
}

// drain a moment for console events
await new Promise((r) => setTimeout(r, 600))
const errors = cdp.events.filter(
  (e) =>
    (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') ||
    (e.method === 'Runtime.exceptionThrown')
)
if (errors.length) {
  console.log('CONSOLE ERRORS:')
  for (const e of errors) console.log(JSON.stringify(e.params).slice(0, 500))
} else {
  console.log('no console errors captured')
}
cdp.close()
