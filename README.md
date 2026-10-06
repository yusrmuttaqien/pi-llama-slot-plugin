# pi-llama-slot-plugin

Pi extension that saves and restores the llama.cpp server's slot (KV/prompt
cache) per chat, so a chat's full context can be snapshotted and brought back
without re-prefilling tens of thousands of tokens.

## How it works

The extension talks to a running llama.cpp server (single-model or router
mode) over its HTTP API. It is only active when the session's current model
uses llama.cpp provider, no-ops otherwise.

## Commands

| Command | Action |
|---|---|
| `/llama-save` | Save the slot now (notify dialog) |
| `/llama-restore` | Restore the slot now (notify dialog) |
| `/llama-auto` | Toggle auto save/restore for this chat |

All three are no-ops when the active model is not a `llama.cpp` model.

## Auto mode

When auto mode is on for a chat:

- **`agent_settled`** → the slot is saved silently after every settled run
  (after retries/compaction/continuations are done).
- **`before_agent_start`** → the slot is restored silently on the **first
  prompt** of the session only.

Auto mode is persisted per chat.

## Status line

While active, the extension shows `[llama-slot: …]` in the footer. Silent operations show `saving` / `saved` / `restoring` /
`restored` / `failed`, then reset to `auto` (or clear) after 3 seconds. Manual
commands will notify instead.

## Develop

Clone repo to `~/.pi/agent/extensions/`

`cd` to the repo folder

```bash
npm install
```

then run pi

```bash
pi
```

use command `/reload` to reload extension changes

## Notes

- The server must be started with `--slot-save-path` pointing at a writable
  directory, or saves will fail.
- There is no delete endpoint on the server; old `pi-*.bin` files accumulate
  in `--slot-save-path` (each is as big as the saved context, several GB for
  large chats).
- Currently only supports single slot under single/router mode.
