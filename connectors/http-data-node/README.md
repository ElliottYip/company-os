# Company OS HTTP Data Node connector

Maintained, vendor-neutral Data Connector for customer-controlled data planes.
It sends authorization context, purpose, classification, destination and
digests to an HTTPS node and receives only opaque data/evidence references and
content digests. Enterprise records, credentials and private sessions are not
valid protocol fields.

This package is a connector client, not an enterprise data store.

The package ships its OpenAPI 3.1 contract as `openapi.json` and exports it at
`@company-os/http-data-node-connector/openapi`. The schema permits only
reference/digest grant results or structured denials; raw enterprise records
are not response fields.
