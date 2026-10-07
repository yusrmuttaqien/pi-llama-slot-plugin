import type {
  ExtensionAPI,
  ExtensionCommandContext,
  CustomEntry,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

type State = {
  auto: boolean;
};
type Context = ExtensionCommandContext | ExtensionContext;

const TYPE = "llama-slot";
const TRACKED_CHAT = new Set<string>();

let compactedThisRun = false;

async function slotOps(
  ctx: Context,
  action: "save" | "restore",
  slot: number,
  chatId: string,
) {
  const base = ctx.model?.baseUrl.replace(/\/v1\/?$/, "");
  const model = ctx.model?.id;

  if (!base || !model)
    throw new Error("llama slot plugin: missing model or base url");
  const filename = `pi-${chatId}.bin`;
  const res = await fetch(
    `${base}/slots/${slot}?action=${action}&model=${encodeURIComponent(model)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, filename }),
    },
  );

  if (!res.ok)
    throw new Error(
      `llama ${action} failed: ${res.status} ${await res.text()}`,
    );
  return filename;
}
function setState(pi: ExtensionAPI, state: State) {
  pi.appendEntry(TYPE, state);
}
function getState(ctx: Context) {
  const mine = ctx.sessionManager
    .getBranch()
    .filter(
      (e): e is CustomEntry<State> =>
        e.type === "custom" && e.customType === TYPE,
    );
  return mine.at(-1)?.data;
}
function isAuto(ctx: Context) {
  const state = getState(ctx);
  return state?.auto ?? false;
}
function setStatus(ctx: Context, message?: string) {
  if (message) {
    ctx.ui.setStatus(TYPE, "[llama-slot: " + message + "]");
  } else {
    ctx.ui.setStatus(TYPE, undefined);
  }
}
function isLlama(ctx: Context) {
  return ctx.model?.provider === "llama.cpp";
}
function trackChat(ctx: Context) {
  TRACKED_CHAT.add(ctx.sessionManager.getSessionId());
}
function timer(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function _resetSilentStatus(ctx: Context, auto: boolean) {
  await timer(3000);
  setStatus(ctx, auto ? "auto" : undefined);
}
async function saveSlot(ctx: Context, silent = false, slot = 0) {
  const auto = isAuto(ctx);

  try {
    !silent && ctx.ui.notify("llama slot saving...", "info");
    silent && setStatus(ctx, "saving");
    const filename = await slotOps(
      ctx,
      "save",
      slot,
      ctx.sessionManager.getSessionId(),
    );
    silent && setStatus(ctx, "saved");
    !silent &&
      ctx.ui.notify("llama slot saved successfully: " + filename, "info");
  } catch (err) {
    silent && setStatus(ctx, "failed");
    !silent &&
      ctx.ui.notify(
        err instanceof Error ? err.message : "llama slot failed to save",
      );
  }

  silent && _resetSilentStatus(ctx, auto);
}
async function restoreSlot(ctx: Context, silent = false, slot = 0) {
  const auto = isAuto(ctx);

  try {
    !silent && ctx.ui.notify("llama slot restoring...", "info");
    silent && setStatus(ctx, "restoring");
    const filename = await slotOps(
      ctx,
      "restore",
      slot,
      ctx.sessionManager.getSessionId(),
    );
    silent && setStatus(ctx, "restored");
    !silent &&
      ctx.ui.notify("llama slot restored successfully: " + filename, "info");
  } catch (err) {
    silent && setStatus(ctx, "failed/no saved slot");
    !silent &&
      ctx.ui.notify(
        err instanceof Error ? err.message : "llama slot failed to restore",
      );
  }

  silent && _resetSilentStatus(ctx, auto);
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("llama-save", {
    description: "Save llama slot",
    handler: async (_, ctx) => {
      if (!isLlama(ctx)) return;

      await saveSlot(ctx);
    },
  });
  pi.registerCommand("llama-restore", {
    description: "Restore llama slot",
    handler: async (_, ctx) => {
      if (!isLlama(ctx)) return;

      await restoreSlot(ctx);
    },
  });
  pi.registerCommand("llama-auto", {
    description: "Toggle llama slot auto save/restore",
    handler: async (_, ctx) => {
      if (!isLlama(ctx)) return;

      const state = getState(ctx);
      const newState = { auto: !state?.auto };

      setState(pi, newState);
      setStatus(ctx, newState.auto ? "auto" : undefined);
    },
  });

  pi.on("session_start", async (_, ctx) => {
    if (!isLlama(ctx)) return;
    const auto = isAuto(ctx);

    setStatus(ctx, auto ? "auto" : undefined);
  });
  pi.on("agent_settled", async (_, ctx) => {
    if (!isLlama(ctx)) return;
    const auto = isAuto(ctx);

    if (!auto || compactedThisRun) {
      compactedThisRun = false;
      
      return;
    };
    await saveSlot(ctx, true);
  });
  pi.on("before_agent_start", async (_, ctx) => {
    if (!isLlama(ctx)) return;
    const auto = isAuto(ctx);

    if (!auto || TRACKED_CHAT.has(ctx.sessionManager.getSessionId())) return;
    trackChat(ctx);
    await restoreSlot(ctx, true);
  });
  pi.on("session_compact", async (_, ctx) => {
    if (!isLlama(ctx)) return;
    const reasonThreshold = _.reason === "threshold"

    if (!reasonThreshold) return;
    compactedThisRun = true;
  });
}
