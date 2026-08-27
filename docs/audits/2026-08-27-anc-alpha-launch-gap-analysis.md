# ANC Alpha launch gap analysis

Date: 2026-08-27  
Baseline: RC12 / `HK_CLOSED_INGRESS_ACCEPTED`

## Current truth

- The Agent Portfolio and deterministic exhibition journey pass local browser
  admission.
- RC12 is published and installed in Hong Kong. One API and one Web replica are
  running behind closed ingress with fixed private bridge addresses; public
  traffic, DNS and TLS remain unchanged.
- The complete API/browser/recovery path and 30-minute 180-sample observation
  passed with zero P0/P1. RC11 is stopped while its release and evidence remain
  retained.
- A pinned Paperclip `v2026.817.0` adapter now implements credential-file-only
  Agent inventory and Federated Issue synchronization behind an authorized
  formal trigger. Current demonstrations still use explicit fixtures, and no
  sandbox credential is installed on the Hong Kong candidate. A separate local
  authenticated sandbox has accepted anonymous denial, official API sync and
  fail-closed key revocation, but the formal OIDC route is not live-accepted.
- The two approved `raft.xin` A records were created and are enabled in the
  AliDNS console. The console contains the intended `47.242.52.235` values,
  but AliDNS authority and public resolvers still rewrite all `raft.xin` A
  answers, including older records, to deterministic `28.0.*` addresses with a
  one-second TTL. WHOIS and the registrar console report the domain as normal,
  while a control domain in the same account resolves normally. Certificate
  issuance and ingress activation remain stopped until the authority returns
  the configured address or the owner approves a healthy alternate domain.
- Therefore the system is a running closed-ingress Alpha candidate, not a
  publicly available service and not yet a customer-connected control plane.

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
| `raft.xin` authority rewrites all A answers | Resolve the upstream domain hold/filter with AliDNS or obtain explicit authorization for a healthy alternate domain; do not request a certificate against rewritten DNS. |
| No TLS route | After DNS authority converges, obtain explicit TLS/traffic authorization, proxy only the two loopback services, and retain certificate/route evidence without exposing admin ports. |
| No target-host browser evidence | Run the full three-minute journey, two-visitor isolation, reset, API restart/recovery, responsive bilingual checks, and formal-route rejection against the TLS URL. |
| No observation | Record at least 30 minutes with zero P0/P1, bounded error/latency/resource metrics, and a tested withdrawal command. |

## Private Alpha and real Connector gaps

| Gap | Required result |
|---|---|
| External platform selected but not customer-accepted | Paperclip `v2026.817.0` official API and key revocation pass an authenticated synthetic sandbox; repeat through a customer-owned non-production tenant before claiming it live. |
| No formal-runtime sandbox credential | Obtain a minimum-scope, revocable test credential through the formal Secret boundary; never place it in Git, Demo, logs, or browser storage. |
| Adapter not target-accepted | Inventory and Federated Work are implemented under `adapters/connectors`; truthful Usage remains disabled because the official cost API is aggregate rather than event-level. |
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
