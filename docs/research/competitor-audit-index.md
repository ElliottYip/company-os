# Competitor audit index

Status: active; product implementation frozen  
Audit date: 2026-08-18

This index is the human-readable entry point. Machine-verifiable path and unit
coverage lives in `research/competitive-audit/inventories/`,
`research/competitive-audit/assessments/`, and the dedicated Paperclip ledger.
`Pinned` means identity, source commit and license surface were checked; it does
not mean the repository audit is complete.

## Coverage snapshot

- 19 pinned source repositories.
- 49,389 tracked paths classified.
- 2,637 auditable units generated.
- Paperclip: 103 complete units, 1,457 pending units.
- Agent Compiler: all 6 units complete. Other non-Paperclip units are pending.
- BeanOS Blueprint: public architecture evidence only; no proven codebase.
- Ten commercial products: public product-boundary research only.

## Pinned repository register

| Project | Full commit | Tag | License finding | Paths | Units | Status |
|---|---|---|---|---:|---:|---|
| Paperclip | `213dabab4f8e1f3bb1803a2924c0fea1289fcd4c` | `v2026.817.0` | MIT | 4,464 | 1,560 | 103 complete / 1,457 pending |
| AgentSpace | `0f9da1b125def4d5a0d05b34bf7c5cec0686bbf2` | — | Apache-2.0 | 758 | 78 | pending |
| StaffDeck | `b18aebb9523cb32363b18806d258b0cf28e8781d` | `v0.4.1` | AGPL-3.0-only | 757 | 33 | pending |
| Provision | `535cdbd651a47bff3ef583b4450fe337326c89ad` | — | MIT | 1,023 | 71 | pending |
| OpenSpawn | `30a70886e7e13a2f750c07fb9e464cb5743ded19` | — | MIT | 1,288 | 109 | pending |
| Org Studio | `30cfffb52c1da347285472b01680c445907d0555` | `v0.4.1` | MIT | 659 | 39 | pending |
| Agent Compiler | `81f1e81ba5d82ed38408bba09e0c104209c1d9cc` | — | no license grant | 9 | 6 | complete; code REJECT, design REFERENCE ONLY, copying prohibited |
| SynthOrg | `55cb552b98433df6fcc53c27c97daebbe39f3908` | `v0.9.4-dev.138` | BUSL-1.1; Apache-2.0 change 2029-07-08 | 10,481 | 46 | pending; source-available, copying prohibited |
| DeepSeek Harness | `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca` | `dsh-v0.1.0-rc.7` | MIT | 7,466 | 330 | pending |
| Cordis | `8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4` | — | MIT | 112 | 33 | pending |
| CompozyOS | `86e92b6d63aa7976c3c0ffcb69eb11e69a570257` | beta commit | MIT | 15,202 | 88 | pending |
| SmythOS SRE | `5c382a1ec07accc75947c3e4fa24841532ae7c88` | — | MIT; trademark/private modules excluded | 936 | 60 | pending |
| Juggler | `ada4754c7230280c2172c87d2882997ef36a50c7` | — | AGPL-3.0-or-later; `web/sdk` and `web/extensions` Apache-2.0 | 1,405 | 33 | pending; submodule not silently included |
| Symphony | `8001b52e3062495a16e520e4ceaf8f9de868c4d0` | — | Apache-2.0 | 130 | 8 | pending |
| AgentArea | `66f66dd1e5bb96eba8de469744736eddd3d93142` | — | Apache-2.0 | 2,996 | 35 | pending |
| HumanLayer ACP | `bc703d36579edb973da1ca2a748381cdb4eb8b55` | `v0.5.1` | Apache-2.0 | 241 | 12 | pending |
| Agent Room | `9faaae7f1bef15e25648560f27ac25eea3383b42` | `v0.1.0` | Apache-2.0 | 207 | 27 | pending |
| OpenWorker | `91a2419654a4bb8f7479a7b56693984330625e47` | — | MIT claimed in README; no license text | 122 | 27 | pending; copying prohibited |
| Agent Control | `541f872e79b109524ed029db038118d3beb8b033` | `v8.5.0` | Apache-2.0 | 936 | 24 | pending |
| Mesa | `1bd047c3d8727ad685b374f0947850a123db2a5b` | — | MIT | 197 | 18 | pending |

## Explicit non-code and unresolved surfaces

- BeanOS Blueprint is a public design document. Until an official implementation
  and license are proven, it receives product/architecture analysis only.
- Juggler's `3rdparty/wails` gitlink is an explicit separately owned dependency;
  it was not initialized and is not counted as Juggler first-party source.
- Commercial products are never mixed into source audit completion claims.

## Commercial/public product scope

Workday Agent System of Record, Microsoft Agent 365, ServiceNow AI Control
Tower, Salesforce Agentforce, Relevance AI Workforce, Sintra, Lindy, Artisan,
11x, and OpenAI Presence. Required dimensions are target customer, core objects,
human accountability, Agent lifecycle, governance, deployment, pricing and
packaging, FDE/implementation service, and product entry. Unknown or undisclosed
facts stay explicit.

## Next audit sequence

1. Continue Paperclip from the first pending unit/range; do not reread its 103
   completed units.
2. Complete first-batch control-plane competitors from generated inventories.
3. Complete runtime/plugin and Company-as-Code references.
4. Trace critical end-to-end paths and reconcile the cross-project matrix.
5. Produce at least three mutually exclusive Company OS product options and a
   GO / NARROW / PARTNER / STOP decision brief.
