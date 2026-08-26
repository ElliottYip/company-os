# Codex acceptance Agent Node

The Codex adapter runs outside the Company OS control plane. It uses the stable
non-interactive `codex exec` command with JSONL output, a fixed JSON output
schema, an ephemeral session and a read-only sandbox. The prompt is sent on
stdin and is never placed in process arguments.

The node owns Codex authentication and local artifacts. Company OS receives
only status summaries, token counts, opaque evidence/result references and
SHA-256 digests. It never receives the Codex login token, external session ID,
raw JSONL stream, private reasoning or workspace files.

## Required runtime configuration

- `COMPANY_OS_CODEX_BINARY=/usr/local/bin/codex`
- `COMPANY_OS_CODEX_WORKSPACE=/work`
- `COMPANY_OS_CODEX_STATE_DIRECTORY=/var/lib/company-os-codex`
- `COMPANY_OS_CODEX_NODE_BEARER_TOKEN_FILE=/run/secrets/node-bearer-token`
- optional `COMPANY_OS_CODEX_MODEL`, bound to the admitted model route
- optional bounded timeout and request-size settings
- optional `COMPANY_OS_CODEX_TERMINATION_GRACE_SECONDS` (1–30; default 5)

The container is intended for a separate execution host, not the constrained
`raft-generator` Web/API host. Inject either a customer-controlled `CODEX_HOME`
or a short-lived workload credential at runtime. Never copy a personal Codex
home directory into an image.

## Approval behavior

The first acceptance profile is read-only. Pause terminates the active process
and records `AWAITING_APPROVAL`; resume starts a fresh read-only execution bound
to the opaque approval reference. This is safe only because the driver cannot
perform external side effects. A future side-effecting driver must implement
provider-native durable pause/resume and idempotency before advertising that
capability.

The implementation intentionally rejects `--yolo`, full-access sandboxes and
credentials in prompts or control-plane payloads.

On timeout, cancellation, pause or service shutdown, the node signals the
entire detached process group with `SIGTERM`, waits the bounded grace period,
then escalates to `SIGKILL` if the run is still active. Windows falls back to
direct-child signaling.

## Engineering reference boundary

The process lifecycle, bounded-output, recovery and usage-accounting design was
checked against the existing pinned Paperclip audit. Company OS independently
implements those generic invariants and imports no Paperclip package, schema,
session type or runtime service. See ADR 0017 and ADR 0029.

The current read-only driver deliberately implements restart-as-resume rather
than pretending to preserve a vendor session. Before enabling side effects, add
process-group termination escalation, inactivity/liveness evidence and a
provider-native durable continuation contract, then admit each capability with
focused restart and idempotency tests.
