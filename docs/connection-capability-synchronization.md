# Connection capability synchronization

As the installation owner, I enable a module to make its capabilities available
to my existing agent connections without separately reviewing each registration.
The module confirmation saves policy and synchronizes eligible registration
ceilings. Startup also reconciles existing enabled policy after an upgrade.
No existing consent, access token or refresh grant is changed. Disabled, unrelated,
shared and foreign-code registrations are excluded and metadata changes are audited.

When a host reconnects with an audited former complete registration scope list,
the authorization request offers the currently enabled registered capabilities.
The same client, redirect, state, PKCE and resource are retained. Explicit narrow
requests and silent/other-resource requests are not expanded. The owner selects
the account and reviews the ordinary consent page. Denial or unselected actions
remain ungranted. A newly enabled capability can therefore require one fresh
consent in each host, but no additional registration Review action.

Acceptance: enabling policy updates eligible ceilings once; grants remain identical;
shared boundaries deny expansion; a cached reconnect displays added permissions;
state and PKCE survive; denial preserves grants; narrow reads retain their scope.
Synthetic checks establish these source and OAuth boundaries. Local deployment
and real host consent are separate acceptance steps. No Home device is operated
by this workflow.

Delivered in PR135, local release 0.1.100. Source checks: 78 bounded tests, additional
final boundary checks, complete application build and tooling typecheck passed.
These are same-agent checks; no PR CI or independent review is claimed. Actual
CLI authorization readback confirms the previously cached ChatGPT request now
offers HomeKit scenes and Photos with unchanged state/PKCE. Real host consent and
physical iPhone visual acceptance remain unverified. No physical operation occurred.
