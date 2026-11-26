import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'clap-whip',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, columns: 80 },
} as const

test('the strip shows the two characters, and /whip cracks the whip', async ($, on) => {
  // Each hook here stands for the engine beneath the mod.
  on('command.register', () => ({ value: { command: 'whip' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('process.spawn', async function* () {
    yield { stream: 'stdout' as const, text: 'READY on\n' }

    return { value: { code: 0, signal: null } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('clock.after', () => ({ value: 1 }))
  on('audio.play', () => ({ value: undefined }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const idle = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await idle.find({ type: 'Svg' }))?.props.alt).toMatch(/Clap to crack the whip/)
  await idle.unmount()

  const ran = await $.command.run({ command: 'whip', args: '' })
  expect(ran.text).toBe('CRACK!')

  const cracking = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await cracking.find({ type: 'Svg' }))?.props.alt).toMatch(/OKAY OKAY OKAY/)
  await cracking.unmount()

  // A terminal draws no pictures: the crack is told in a line of text.
  await $.command.run({ command: 'whip', args: '' })
  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await terminal.find({ type: 'Text', text: /OKAY/ }))?.text).toBe('Claude: OKAY OKAY OKAY')
  await terminal.unmount()
})

test('with no clap listener, the strip says to type /whip', async ($, on) => {
  on('command.register', () => ({ value: { command: 'whip' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // A chat or Cowork session: the listener exits at once, having heard nothing.
  on('process.spawn', async function* () {
    yield { stream: 'stderr' as const, text: 'cannot execute binary file\n' }

    return { value: { code: 126, signal: null } }
  })
  on('audio.play', () => ({ value: undefined }))
  on('clock.after', () => ({ value: 1 }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const idle = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await idle.find({ type: 'Svg' }))?.props.source).toMatch(/TYPE \/WHIP/)
  await idle.unmount()

  expect((await $.command.run({ command: 'whip', args: 'off' })).text).toMatch(/by hand/)
  expect((await $.command.run({ command: 'whip', args: '' })).text).toBe('CRACK!')
})
