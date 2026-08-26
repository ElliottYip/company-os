# HTTP Agent Node reference server

This private package is a maintained implementation of the server side of the
Company OS HTTP Agent Node protocol. It is **not an Agent** and never invokes a
model by itself. A customer supplies a driver that binds an authorized Agent
runtime to `deploy`, `submit`, and `command` callbacks.

`createReferenceAgentNode` provides bounded JSON HTTP routes, constant-time
bearer authentication, idempotent deployment/work/command handling and ordered
observations. `JsonFileReferenceNodeStore` persists only secret-free protocol
state through atomic file replacement. Put the file on an encrypted,
operator-owned volume and terminate TLS before the server.

The driver receives a `recordObservation` function. It must publish summaries,
opaque evidence references/digests and results only; credentials, external
sessions and private reasoning are rejected at the protocol boundary.
