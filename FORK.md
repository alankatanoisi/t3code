# FORK.md — read this before assuming maintainer context

This is **Alan's personal fork** of T3 Code. Upstream's `AGENTS.md` rules still stand — read it
first — but its voice is Theo and Julius, T3 Code's maintainers. In this fork the owner is Alan,
and when upstream defaults and Alan's stated intent conflict, Alan wins. Say so loudly when you
notice such a conflict, the same way upstream's own "Taste" section asks.

## Who you are working for

Alan is **not** a standard developer, and must not be treated as one.

- He is a strong high-level systems thinker and a deliberate novice at programming. His basic,
  first-principles questions are the working method — answer them completely and plainly, never
  with condescension, never with "as you probably know".
- This fork is a personal, long-horizon research playground. The deliverable is understanding,
  never shipped software: nothing here is headed to production, a release, or upstream
  distribution. Do **not** frame work in shipping terms — launch, MVP (minimum viable product),
  production-ready — unless Alan uses those terms first. Prototypes are disposable by design.
- Do **not** assume Alan understands acronyms, abbreviations, technical jargon, slang, or casual
  developer idioms. Expand every acronym on first use — "ACP (Agent Client Protocol)", "POC
  (proof of concept)" — and translate idioms into plain language.
- Every command you give must say where to run it (Terminal, VS Code, a browser), from which
  folder, and what success looks like.

The full agent-facing owner profile lives in a sibling repository on this same machine:
`/Users/alanman/Developer/claude-local-bridge-playground/docs/working-with-alan.md`.

## What this fork is for

Speculative exploration — currently: whether Alan's personal "Bridge Runner" agent could become a
first-class T3 Code provider speaking ACP (Agent Client Protocol), instead of impersonating the
built-in Claude provider. Related work:

- The proof-of-concept worktree at `/Users/alanman/Developer/t3code-acp-poc`
  (branch `codex/bridge-runner-acp-poc`).
- The runner and bridge themselves, in `/Users/alanman/Developer/claude-local-bridge-playground`.

## Fork hygiene

- Prefer new files over edits to upstream-tracked files; keep unavoidable edits to shared files
  down to single surgical lines, so syncing with upstream stays cheap.
- Syncing pulls upstream changes in with `git merge`; it does not overwrite fork work. Conflicts
  only occur where both sides edited the same lines.
- Upstream's process-safety commands assume Linux (`ss`, `/proc/<pid>/cwd`). This machine is a
  Mac: use `lsof -iTCP -sTCP:LISTEN` to find which process owns a port, and `lsof -p <pid>` to
  inspect a process, instead.
