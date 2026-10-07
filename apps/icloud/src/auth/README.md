# Transitional authentication presentation

The pure backend is owned by [the account module](../../../../modules/account/README.md).
This subtree retains application integration tests, browser compatibility code,
locale/scope labels and Svelte presentation adapters until Studio assumes server
composition. It owns no second authentication or credential-store implementation.

Build the account module and Studio before running the application tests;
`bun bin/test` performs the required order. Native installed builds consume the
same account facade copied into their private distribution.
