# Local Codex execution admission — 2026-08-26

Classification: real provider inference, synthetic non-production input, local
driver admission only. This is not customer staging or production acceptance.

## Boundaries

- Codex CLI: `0.144.1`, authenticated locally through ChatGPT.
- execution: stable non-interactive `codex exec` JSONL mode;
- sandbox: `read-only` with approval policy `never`;
- session: ephemeral and excluded from retained evidence;
- workspace: disposable empty directory outside the project;
- input: protocol-only synthetic text, no enterprise data, credentials or
  customer identifiers;
- tools and external side effects: none requested or observed.

## Result

- outcome: `PASS`;
- summary: the read-only non-production Agent Node protocol prompt was received;
- evidence summary: no enterprise data or credentials were used;
- result digest:
  `sha256:390496cbe5b7625e16e9e8b60878f9cc25fd09564cda1c81350c079dbaa6079e`;
- reported usage: 18,976 input tokens, 0 cached input tokens and 48 output
  tokens; cost was not reported and is not inferred.

No Codex thread/session identifier, raw login material or raw JSONL stream is
retained in this record.

## Findings incorporated

The admission caught three fail-closed integration defects before the passing
run: the global approval flag position, the explicit non-Git workspace flag,
and the JSON Schema `type` required alongside `const`. All three are now fixed
and covered by focused tests.

The unexpectedly large input count came from the current desktop Codex context.
The deployed Agent Node must use a dedicated minimal `CODEX_HOME` with only the
approved runtime configuration. Personal desktop configuration, plugins and
skills must not be copied into the container.
