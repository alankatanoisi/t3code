#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off
//
// Bridge Runner — mock ACP (Agent Client Protocol) agent.
//
// WHAT THIS IS: a fake coding agent that speaks ACP over stdio so we can see what
// Alan's real Bridge Runner would look like inside T3 Code's user interface, without
// calling any model, reading any credential, or touching any file.
//
// WHY IT EXISTS: T3 renders provider turns from protocol events (plan, tool call,
// permission request, streamed text). If this script emits those events, T3 draws the
// real user interface for them. That answers "what does our runner look like in T3?"
// before a single line of real integration is written.
//
// HOW IT IS REACHED: T3's Cursor driver spawns a binary and speaks ACP to it. A tiny
// shell shim (bridge-runner-agent-shim.sh) pretends to be that binary and execs this
// script. So no T3 production code is modified for this experiment.
//
// EVERYTHING HERE IS FAKE. No model call, no credential read, no file touched.
import * as Effect from "effect/Effect";

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";

import * as EffectAcpAgent from "effect-acp/agent";
import * as AcpError from "effect-acp/errors";
import type * as AcpSchema from "effect-acp/schema";

const SESSION_ID = "bridge-runner-mock-session-1";

// Live session state. Real runner state would live in the AgentKernel instead.
let currentModelId = "bridge-fable-5";
let currentEffort = "high";
let currentTokenBudget = "8192";
let currentFast = false;
let currentModeId = "ask";
const cancelledSessions = new Set<string>();

/**
 * The models this fake provider advertises. In the real thing these would be the
 * models the bridge can reach.
 */
const BRIDGE_MODELS: ReadonlyArray<{ readonly value: string; readonly name: string }> = [
  { value: "bridge-fable-5", name: "Bridge Fable 5" },
  { value: "bridge-sonnet-5", name: "Bridge Sonnet 5" },
  { value: "bridge-haiku-4.5", name: "Bridge Haiku 4.5" },
];

/**
 * Session modes map onto T3's Chat/Plan toggle and its access levels.
 * T3 matches these ids by alias: "ask" -> approval required, "plan" -> plan mode,
 * "code" -> implement.
 */
const AVAILABLE_MODES: ReadonlyArray<AcpSchema.SessionMode> = [
  { id: "ask", name: "Ask", description: "Ask before running any tool" },
  { id: "plan", name: "Plan", description: "Plan only; never touch the workspace" },
  { id: "code", name: "Code", description: "Run tools without asking each time" },
];

/**
 * The per-model knobs. These names are chosen so T3's existing option mapper picks
 * them up and turns each one into a composer dropdown:
 *   effort  -> "Reasoning" dropdown
 *   context -> a select dropdown labelled by its own name ("Token Budget")
 *   fast    -> an on/off toggle
 * The token budget is a set of presets rather than a number box because ACP config
 * options are only ever select-or-boolean shaped.
 */
function modelKnobs(): ReadonlyArray<AcpSchema.SessionConfigOption> {
  return [
    {
      id: "effort",
      name: "Effort",
      category: "thought_level",
      type: "select",
      currentValue: currentEffort,
      options: [
        { value: "low", name: "Low" },
        { value: "medium", name: "Medium" },
        { value: "high", name: "High" },
        { value: "max", name: "Max" },
      ],
    },
    {
      id: "context",
      name: "Token Budget",
      category: "model_config",
      type: "select",
      currentValue: currentTokenBudget,
      options: [
        { value: "4096", name: "4K tokens" },
        { value: "8192", name: "8K tokens" },
        { value: "16384", name: "16K tokens" },
        { value: "32768", name: "32K tokens" },
      ],
    },
    {
      id: "fast",
      name: "Fast",
      category: "model_config",
      type: "select",
      currentValue: String(currentFast),
      options: [
        { value: "false", name: "Off" },
        { value: "true", name: "Fast" },
      ],
    },
  ];
}

/** Everything the session advertises: mode + model pickers plus the per-model knobs. */
function configOptions(): ReadonlyArray<AcpSchema.SessionConfigOption> {
  return [
    {
      id: "mode",
      name: "Mode",
      category: "mode",
      type: "select",
      currentValue: currentModeId,
      options: AVAILABLE_MODES.map((mode) => ({
        value: mode.id,
        name: mode.name,
        ...(mode.description ? { description: mode.description } : {}),
      })),
    },
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: currentModelId,
      options: BRIDGE_MODELS.map((model) => ({ value: model.value, name: model.name })),
    },
    ...modelKnobs(),
  ];
}

function modeState(): AcpSchema.SessionModeState {
  return { currentModeId, availableModes: AVAILABLE_MODES };
}

function modelState(): AcpSchema.SessionModelState {
  return {
    currentModelId,
    availableModels: BRIDGE_MODELS.map((model) => ({ modelId: model.value, name: model.name })),
  };
}

/** Answer for the model catalogue T3 asks for while probing the provider. */
function availableModelsResponse() {
  return {
    models: BRIDGE_MODELS.map((model) => ({
      value: model.value,
      name: model.name,
      configOptions: modelKnobs(),
    })),
  };
}

const program = Effect.gen(function* () {
  const agent = yield* EffectAcpAgent.AcpAgent;

  yield* agent.handleInitialize(() =>
    Effect.succeed({
      protocolVersion: 1,
      agentCapabilities: { loadSession: true },
    }),
  );

  // No credentials exist here. T3 always sends authenticate, so accept and move on.
  yield* agent.handleAuthenticate(() => Effect.succeed({}));

  yield* agent.handleCreateSession(() =>
    Effect.succeed({
      sessionId: SESSION_ID,
      modes: modeState(),
      models: modelState(),
      configOptions: configOptions(),
    }),
  );

  // Reopening an existing thread. A real runner would replay its transcript here.
  yield* agent.handleLoadSession((request) =>
    Effect.gen(function* () {
      const requestedSessionId = String(request.sessionId ?? SESSION_ID);
      yield* agent.client.sessionUpdate({
        sessionId: requestedSessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Bridge Runner session reattached." },
        },
      });
      return { modes: modeState(), models: modelState(), configOptions: configOptions() };
    }),
  );

  yield* agent.handleSetSessionModel((request) =>
    Effect.gen(function* () {
      if (!BRIDGE_MODELS.some((model) => model.value === request.modelId)) {
        return yield* AcpError.AcpRequestError.invalidParams(
          `Unknown Bridge Runner model id: ${request.modelId}`,
          { method: "session/set_model", params: request },
        );
      }
      currentModelId = request.modelId;
      return {};
    }),
  );

  // Every composer dropdown change arrives here.
  yield* agent.handleSetSessionConfigOption((request) =>
    Effect.sync(() => {
      const value = request.value;
      if (request.configId === "mode" && typeof value === "string") currentModeId = value;
      if (request.configId === "model" && typeof value === "string") currentModelId = value;
      if (request.configId === "effort" && typeof value === "string") currentEffort = value;
      if (request.configId === "context" && typeof value === "string") currentTokenBudget = value;
      if (request.configId === "fast") currentFast = value === true || value === "true";
      return { configOptions: configOptions() };
    }),
  );

  yield* agent.handleCancel(({ sessionId }) =>
    Effect.sync(() => {
      cancelledSessions.add(String(sessionId ?? SESSION_ID));
    }),
  );

  yield* agent.handlePrompt((request) =>
    Effect.gen(function* () {
      const session = String(request.sessionId ?? SESSION_ID);
      const modelName =
        BRIDGE_MODELS.find((model) => model.value === currentModelId)?.name ?? currentModelId;

      // 1. A plan. T3 draws this as a checklist above the reply.
      yield* agent.client.sessionUpdate({
        sessionId: session,
        update: {
          sessionUpdate: "plan",
          entries: [
            {
              content: "Read the Bridge Runner session settings",
              priority: "high",
              status: "completed",
            },
            {
              content: "Echo the selected settings back to the composer",
              priority: "high",
              status: "in_progress",
            },
          ],
        },
      });

      // Plan mode: never touch the workspace, so stop before any tool call.
      if (currentModeId === "plan") {
        yield* agent.client.sessionUpdate({
          sessionId: session,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text:
                `Plan mode — no tools were run.\n\n` +
                `Model: ${modelName}\nEffort: ${currentEffort}\n` +
                `Token budget: ${currentTokenBudget}\nFast: ${currentFast ? "on" : "off"}`,
            },
          },
        });
        return { stopReason: "end_turn" };
      }

      // 2. A tool call. Nothing is actually read; this is protocol theatre.
      const toolCallId = "bridge-runner-tool-1";
      yield* agent.client.sessionUpdate({
        sessionId: session,
        update: {
          sessionUpdate: "tool_call",
          toolCallId,
          title: "Read MOCK_SESSION_SUMMARY.txt",
          kind: "read",
          status: "pending",
          rawInput: { path: "MOCK_SESSION_SUMMARY.txt" },
        },
      });
      yield* agent.client.sessionUpdate({
        sessionId: session,
        update: { sessionUpdate: "tool_call_update", toolCallId, status: "in_progress" },
      });

      // 3. Ask permission, unless the mode says run freely. This is the clickable
      //    allow/deny card in T3 — and the piece that also works from the phone.
      let denied = false;
      if (currentModeId !== "code") {
        const permission = yield* agent.client.requestPermission({
          sessionId: session,
          toolCall: {
            toolCallId,
            title: "Read `MOCK_SESSION_SUMMARY.txt`",
            kind: "read",
            status: "pending",
            content: [
              {
                type: "content",
                content: {
                  type: "text",
                  text: "Bridge Runner would like to read a file. Nothing is actually read; this is a mock.",
                },
              },
            ],
          },
          options: [
            { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
            { optionId: "allow-always", name: "Allow always", kind: "allow_always" },
            { optionId: "reject-once", name: "Deny", kind: "reject_once" },
          ],
        });
        const outcome = permission.outcome;
        denied = outcome.outcome === "selected" && outcome.optionId === "reject-once";
      }

      const cancelled = cancelledSessions.delete(session);

      yield* agent.client.sessionUpdate({
        sessionId: session,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: denied ? "failed" : "completed",
          rawOutput: denied
            ? { error: "Denied by the user." }
            : { summary: "No file was read; this is protocol-only mock output." },
        },
      });

      // 4. The streamed reply, echoing every live setting so the round trip is visible.
      yield* agent.client.sessionUpdate({
        sessionId: session,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text:
              `Bridge Runner (mock) reply.\n\n` +
              `Model: ${modelName}\n` +
              `Effort: ${currentEffort}\n` +
              `Token budget: ${currentTokenBudget}\n` +
              `Fast: ${currentFast ? "on" : "off"}\n` +
              `Mode: ${currentModeId}\n` +
              `Tool call: ${denied ? "denied by you" : "allowed"}\n\n` +
              `These values crossed the Agent Client Protocol from T3's composer into a ` +
              `separate agent process and back. No model was called.`,
          },
        },
      });

      return { stopReason: cancelled ? "cancelled" : "end_turn" };
    }),
  );

  // T3's Cursor driver asks for the model catalogue with this extension method, and
  // builds the composer dropdowns from the configOptions attached to each model.
  yield* agent.handleUnknownExtRequest((method, params) => {
    if (method === "cursor/list_available_models") {
      return Effect.succeed(availableModelsResponse());
    }

    if (method === "session/mode/set") {
      const nextModeId =
        typeof params === "object" &&
        params !== null &&
        "modeId" in params &&
        typeof params.modeId === "string"
          ? params.modeId
          : undefined;
      const requestedSessionId =
        typeof params === "object" &&
        params !== null &&
        "sessionId" in params &&
        typeof params.sessionId === "string"
          ? params.sessionId
          : SESSION_ID;

      if (nextModeId && nextModeId.trim()) {
        currentModeId = nextModeId.trim();
        return agent.client
          .sessionUpdate({
            sessionId: requestedSessionId,
            update: { sessionUpdate: "current_mode_update", currentModeId },
          })
          .pipe(Effect.as({}));
      }
      return Effect.succeed({});
    }

    return Effect.fail(AcpError.AcpRequestError.methodNotFound(method));
  });

  return yield* Effect.never;
}).pipe(
  Effect.provide(EffectAcpAgent.layerStdio({})),
  Effect.scoped,
  Effect.provide(NodeServices.layer),
);

NodeRuntime.runMain(program);
