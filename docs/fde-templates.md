# FDE and industry template boundary

An FDE template is a versioned Company OS configuration package, not executable
code. Schema v1 can carry one organization, its complete responsibility
contracts, a vendor-neutral Connector catalog, and the model/data governance
catalog. Cross-domain validation requires every Agent to retain an accountable
human and a configured Connector; critical actions still require human
approval.

Templates contain only references to deployment-owned Secrets. A deployment
adapter verifies publisher trust and the content digest through
`FdeTemplateTrustPort`. `dryRun` returns the four catalog replacements and prior
revisions without mutating state. `apply` records the complete verified package
as one event at an expected sequence; projectors therefore never observe a
partially applied template. `rollback` records the exact application event and
reason code, allowing projections to restore the recorded prior revisions.

Industry templates are a delivery accelerator and remain inspectable customer
configuration. They cannot weaken formal identity, responsibility, approval,
data-egress, Secret, or Connector rules.
