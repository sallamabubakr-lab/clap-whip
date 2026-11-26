import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Status } from '../types'
import { CRACK_SECONDS, SHOWN_HEIGHT, SHOWN_WIDTH, crackScene, idleScene } from './art'


const crack = atom({ plugin: 'clap-whip', key: 'crack' } as const, 0)
const status = atom({ plugin: 'clap-whip', key: 'status' } as const, 'starting' as Status)

const HELP =
  'Clap and the taskmaster cracks the whip. /whip cracks it by hand, /whip off and /whip on switch clap listening (for every session), /whip sensitivity 1-10 sets how loud a clap must be (10 hears soft claps; 4 is the default).'

let cracks = 0

/** Plays one whip crack on the strip, with its sound when this session is the one that heard the clap. */
async function whip($: EngineInterface, hasSound: boolean) {
  cracks += 1
  const mine = cracks
  await update($, crack, () => mine)
  if (hasSound) {
    void $.audio.play({ asset: 'sounds/crack.wav' }).catch(() => undefined)
  }
  $.clock.after(CRACK_SECONDS * 1000, () => {
    void update($, crack, now => (now === mine ? 0 : now)).catch(() => undefined)
  })
}

/**
 * The command line that runs the clap listener with `args`. The mod's own
 * folder is asked of the engine; where it does not say, the folder the mod is
 * installed in is used.
 */
async function helper($: EngineInterface, args: string[]): Promise<string[]> {
  try {
    const env = await $.process.hookEnv()
    if (env.CLAUDE_PLUGIN_ROOT) {
      const session = env.CLAUDE_CODE_SESSION_ID ? ['--session', env.CLAUDE_CODE_SESSION_ID] : []

      return [`${env.CLAUDE_PLUGIN_ROOT}/helper/clapd`, ...args, ...session]
    }
  } catch {
    // Fall through to the installed folder.
  }

  return ['/bin/sh', '-c', 'exec "$HOME/.claude/mods/clap-whip/helper/clapd" "$@"', 'clapd', ...args]
}

/** Runs the clap listener for the session's life and turns each line it writes into what the strip shows. */
async function listen($: EngineInterface) {
  let pending = ''
  let hasStarted = false
  try {
    const argv = await helper($, [])
    for await (const { stream, text } of $.process.spawn({ argv })) {
      if (stream !== 'stdout') continue
      pending += text
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('READY')) hasStarted = true
        if (line === 'CLAP owner') await whip($, true)
        else if (line === 'CLAP') await whip($, false)
        else if (line === 'READY on' || line === 'ON') await update($, status, () => 'on' as Status)
        else if (line === 'READY off' || line === 'OFF') await update($, status, () => 'off' as Status)
        else if (line === 'DUPLICATE') await update($, status, () => 'duplicate' as Status)
        else if (line === 'DENIED') {
          await update($, status, () => 'denied' as Status)
          $.ui.toast(
            'Clap whip: macOS is blocking the microphone. Allow Claude under System Settings > Privacy & Security > Microphone.',
            { timeoutMs: 12000 },
          )
        }
      }
    }
  } catch {
    // No listener here: handled below.
  }
  // Where the listener cannot run (a chat or Cowork session, which has no
  // microphone, or a computer that is not a Mac) the whip is cracked by hand.
  if (!hasStarted) {
    await update($, status, () => 'manual' as Status)
  }
}

const NO_LISTENER =
  'Clap listening needs Claude Code on a Mac, where the mod can hear the microphone. Here, /whip cracks the whip by hand.'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await update($, crack, () => 0)
    await update($, status, () => 'starting' as Status)
    await $.command.register({
      name: 'whip',
      description: 'Crack the whip at Claude, or switch clap listening on or off',
      argumentHint: '[on | off | sensitivity 1-10]',
    })
    // The listener outlives this hook; when the mod unloads under it, its last writes are refused, and that is fine.
    void listen($).catch(() => undefined)

    return started
  })

  on('command.run', { command: 'whip' }, async ($, e) => {
    const [word = '', amount = ''] = e.args.trim().toLowerCase().split(/\s+/)

    if (word === '') {
      await whip($, true)

      return { text: 'CRACK!', isTextDisplayOnly: true }
    }
    if ((word === 'on' || word === 'off' || word === 'sensitivity') && (await read($, status)) === 'manual') {
      return { text: NO_LISTENER, isTextDisplayOnly: true }
    }
    if (word === 'on' || word === 'off') {
      try {
        await $.process.run(await helper($, ['--set', word]))
      } catch {
        return { text: NO_LISTENER, isTextDisplayOnly: true }
      }
      await update($, status, now => (now === 'duplicate' ? now : word))

      return {
        text: word === 'on' ? 'Clap listening is on in every session.' : 'Clap listening is off in every session, and the microphone is released. /whip on brings it back.',
        isTextDisplayOnly: true,
      }
    }
    if (word === 'sensitivity' && /^([1-9]|10)$/.test(amount)) {
      try {
        await $.process.run(await helper($, ['--set-sensitivity', amount]))
      } catch {
        return { text: NO_LISTENER, isTextDisplayOnly: true }
      }

      return { text: `Clap sensitivity set to ${amount} of 10.`, isTextDisplayOnly: true }
    }

    return { text: HELP, isTextDisplayOnly: true }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, status)
    if (e.props.hasSurvey || now === 'duplicate') {
      return next(e)
    }

    const cracking = await read($, crack)

    if (e.surface === 'terminal') {
      // A terminal draws no pictures: say it in a line while the whip cracks, and stay out of the way otherwise.
      if (cracking === 0) {
        return next(e)
      }
      const { Box, Text } = $.ui.resolve(e)

      return (
        <Box>
          <Text color="yellow" bold>
            CRACK!{' '}
          </Text>
          <Text>Claude: OKAY OKAY OKAY</Text>
        </Box>
      )
    }

    const { Svg } = $.ui.resolve(e)

    return cracking === 0 ? (
      <Svg
        source={idleScene(e.props.isWorking, now === 'on' ? 'CLAP TO WHIP' : now === 'manual' ? 'TYPE /WHIP' : '')}
        alt="A pixel taskmaster with a whip stands across from the Claude critter. Clap to crack the whip."
        width={SHOWN_WIDTH}
        height={SHOWN_HEIGHT}
        isInteractive
      />
    ) : (
      <Svg
        source={crackScene(cracking)}
        alt="The taskmaster cracks the whip. CRACK! The Claude critter jumps and says OKAY OKAY OKAY."
        width={SHOWN_WIDTH}
        height={SHOWN_HEIGHT}
        isInteractive
      />
    )
  })
}
