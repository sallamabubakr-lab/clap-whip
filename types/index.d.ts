/**
 * Where the clap listener stands: still starting, listening, switched off,
 * refused the microphone by macOS, standing down because another copy of
 * this mod already serves the session, or absent (a chat or Cowork session,
 * or not a Mac), where the whip is cracked by hand.
 */
export type Status = 'starting' | 'on' | 'off' | 'denied' | 'duplicate' | 'manual'

declare module 'claude-code' {
  interface PluginState {
    'clap-whip': {
      /** 0 while idle; otherwise the number of the whip crack being played. */
      crack: number
      status: Status
    }
  }
}
