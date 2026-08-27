# ANC Alpha launch gap analysis

Date: 2026-08-27  
Baseline: RC7 / `HK_CANDIDATE_INSTALLED_NOT_STARTED`

## Current truth

- The Agent Portfolio and deterministic exhibition journey pass local browser
  admission.
- RC7 is installed in Hong Kong but no Company OS container is running.
- Public ingress, runtime coordinates, `staging.env`, and Secret files are
  absent.
- No live external Agent platform is configured. Current demonstrations use
  explicit fixtures; the Codex execution driver is real code but is not
  installed or authenticated on the Hong Kong candidate.
- Therefore the system is a verified Alpha code candidate, not a running Alpha
  service and not a live multi-platform control plane.

## Retain

- RC4–RC7 tags, digests, release directories, and prepare-only evidence.
- Formal OIDC, membership, Secret-reference, PostgreSQL, migration,
  backup/restore, rollback, responsibility, approval, evidence, and audit
  contracts.
- Provider-neutral Agent Portfolio, Work, commercial, and Connector capability
  contracts.
- Fixture labels, Demo Session isolation, bilingual Web shell, and browser E2E.

## Public Demo gaps

| Gap | Required result |
|---|---|
| Formal staging is the only release topology | Ship the separate no-Secret, no-egress `public-demo` runtime profile. |
| Anonymous session capacity is process-local and unbounded | Add bounded capacity, expiry collection, overload behavior, and request throttling before ingress. |
| No host runtime is started | Install the next immutable RC, start exactly one Demo API and one Web replica, and retain runtime status evidence. |
| No TLS route | Obtain explicit DNS/TLS/traffic authorization, proxy only the two loopback services, and retain certificate/route evidence without exposing admin ports. |
| No target-host browser evidence | Run the full three-minute journey, two-visitor isolation, reset, API restart/recovery, responsive bilingual checks, and formal-route rejection against the TLS URL. |
| No observation | Record at least 30 minutes with zero P0/P1, bounded error/latency/resource metrics, and a tested withdrawal command. |

## Private Alpha and real Connector gaps

| Gap | Required result |
|---|---|
| No external platform selected | Compare only official stable APIs and choose one platform whose exposed data matches a truthful ANC capability subset. |
| No sandbox credential | Obtain a minimum-scope, revocable test credential through the formal Secret boundary; never place it in Git, Demo, logs, or browser storage. |
| No live adapter | Implement the selected vendor only under `adapters/connectors` or `connectors`, mapping into neutral inventory, identity/source, health/capability, Work, usage, and cost contracts. |
| No authenticated Alpha runtime | Configure OIDC and company membership separately from the anonymous Demo, with Connector access denied outside the bound company. |
| No live acceptance | Prove at least one real inventory sync and one platform-supported Observed or Federated Work/usage round trip with source references and audit evidence. |

## Stop gates requiring user confirmation

- selecting a platform when available sandbox credentials differ materially;
- transmitting or installing any credential;
- any paid model/API call or production-data access;
- DNS/TLS or public traffic change;
- formal-mode first start.

## Completion evidence

The Alpha goal closes only with a new immutable RC, full `npm run verify`,
release CI, migration preflight, rollback/withdrawal plan, target-host health and
browser artifacts, a 30-minute observation record, and one real sandbox
Connector acceptance. Passing fixtures alone is insufficient.
