# Paperclip competitive research boundary

Paperclip is a fixed-SHA competitive research subject, not a Company OS
dependency, upstream owner, compatibility target, or deployment component.
Nothing below `research/paperclip` is included by TypeScript, product tests,
the Web build, service startup, or either deployment profile.

The authoritative audit pin is `v2026.817.0` at full commit
`213dabab4f8e1f3bb1803a2924c0fea1289fcd4c`, licensed MIT and copyright Paperclip
AI. The ignored read-only source checkout is `work/upstream-audit/paperclip`.

`retired-runtime-spike` preserves the former API adapter experiment for
historical evidence. It is Company OS-authored spike code and is not shipped.
`legacy-compatibility` preserves the superseded headless compatibility-train
fixtures. Neither directory establishes a supported integration.

Any future copied implementation must first receive a module decision in
`audit-manifest.json`, then record source file, full commit SHA, license,
destination file, local modifications, and tests in `copiedCode`. Brand assets,
logos, trademarks, EE/private sources, upstream database schemas, and internal
types are outside the allowed reuse boundary.
