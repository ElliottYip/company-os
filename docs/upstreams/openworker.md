# OpenWorker upstream record

- URL: https://github.com/openworker-io/openworker
- Audit pin: no release tag; commit `91a2419654a4bb8f7479a7b56693984330625e47`
- License: **no LICENSE file present at the audited pin**; README claims are not sufficient
- Decision: **REJECT**

Code evidence: 122 files and three test files. Worker YAML, permission engine and
approval router are useful product concepts, but the database is a one-shot SQL
schema with no migration/rollback chain; audit rows are described as append-only
without a database trigger; tenancy and human identity are not production-shaped.
No code may be copied unless repository licensing is first cured and re-audited.

