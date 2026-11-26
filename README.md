# Clap Whip

A mod for Claude. Two pixel characters live above your prompt: the Claude
character on the left and a taskmaster with a whip on the right. Clap your
hands and the taskmaster cracks the whip. **CRACK!** Claude jumps and says
**OKAY OKAY OKAY**.

It is a joke. It does not change how Claude answers.

## Install

At the prompt of a Claude Code session in a terminal:

```
/plugin install clap-whip --marketplace sallamabubakr-lab/clap-whip
```

Answer `y` to add the marketplace, then press Enter to install it for your user.

From a shell:

```
claude plugin install clap-whip --marketplace sallamabubakr-lab/clap-whip
```

In the Claude desktop app: click **+** next to the prompt box, then **Plugins**,
**Add marketplace** with `sallamabubakr-lab/clap-whip`, then **Add plugin**.

It loads in every session you start afterwards.

## Where clapping works

| Where | Characters | Clap to whip | `/whip` |
| --- | --- | --- | --- |
| Claude Code on a Mac (desktop app or terminal) | yes | yes | yes |
| Claude chats and Cowork (not yet tested) | should | no | should |
| Claude Code on Windows or Linux (not yet tested) | should | no | should |

Hearing a clap needs your microphone, and only a Claude Code session running
on your own Mac can reach it. Chats and Cowork run in a sandbox with no
microphone, so there the taskmaster's sign says **TYPE /WHIP** and you crack the
whip by typing `/whip`.

A terminal cannot draw pictures, so it shows a line of text when the whip cracks.

## Commands

| Command | What it does |
| --- | --- |
| `/whip` | Cracks the whip by hand |
| `/whip off` | Stops listening for claps in every session and releases the microphone |
| `/whip on` | Starts listening again |
| `/whip sensitivity 1-10` | How loud a clap must be. 10 hears soft claps, 1 only very loud ones. The default is 4 |

## The microphone

- The first time, macOS asks whether Claude (or your terminal) may use the
  microphone. Say yes, or clapping will not work.
- The orange microphone light stays on while a Claude Code session is open,
  because the mod is listening for claps. `/whip off` turns it off.
- Sound is only measured for loudness, on your Mac, to spot a clap. Nothing is
  recorded, saved or sent anywhere. The listener is one small file you can
  read: `helper/clapd.swift`.
- With several sessions open, only one holds the microphone and tells the
  others, so every session whips at once.

## Building the listener yourself

`helper/clapd` is the listener, built for both Apple and Intel Macs from
`helper/clapd.swift`. To rebuild it (needs Xcode's command line tools):

```
swiftc -O helper/clapd.swift -o helper/clapd
```

`helper/clapd --selftest` checks that claps are heard and that speech, typing
and desk thumps are not.
