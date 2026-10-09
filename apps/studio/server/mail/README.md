# Transitional Mail host adapters

Mail backend implementation is installed from
[`modules/mail`](../../../../modules/mail/README.md). This folder retains only
application presentation, injection of the host's verified invocation context and
HTTP/MCP fixture composition. It does not own mailbox services or providers.

Production registers the package contribution with the existing shared runtime.
Integration tests here verify the host/package account and transport boundary.
These adapters remain until Studio assumes complete server composition.
