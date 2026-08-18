# Paperclip compatibility tests

This directory is the executable admission seam between Company OS and the one
generic work-substrate upstream. It must never import Paperclip server internals.

Every stable-version train must supply fixtures for the admitted and candidate
full SHAs and verify:

- API requests/responses and error envelopes;
- event schema, cursor, ordering and idempotency;
- Plugin SDK capability/version negotiation;
- tenant isolation and responsible-human attribution;
- exact Company OS approval/evidence projection;
- Connector pause/resume/cancel and secret-free runtime proof;
- backup/migration/restore and previous-version rollback;
- Company OS Web projections against both versions;
- no Paperclip brand/page/i18n dependency.

The pinned manifest is `paperclip-versions.json`. Live upstream execution is an
admission-runner concern; repository verification validates the manifest and
Company OS fixtures without credentials or network access.

