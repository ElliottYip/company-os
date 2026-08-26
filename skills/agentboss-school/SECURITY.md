# Security Policy

## Supported version

Security fixes are applied to the latest tagged release. Earlier curriculum and credential versions remain historically verifiable but may not receive code fixes.

## Reporting a vulnerability

Do not open a public issue containing credentials, learner data, private case material or an exploitable vulnerability. Use GitHub's private vulnerability reporting for this repository. If that feature is unavailable, open a public issue containing only a request for a private maintainer contact and no sensitive details.

The repository never needs production credentials to run its curriculum validation, synthetic cases or practice Labs. A report asking maintainers or learners to upload a token, private key, customer document or production trace should be treated as suspicious.

## Credential boundary

The sample keyring contains public-key metadata only. Issuer private keys must remain outside the repository. Compromise of an issuer key requires key status update, credential review and revocation according to `references/certification.md`.
