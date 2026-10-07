# Account UI

Feature-owned browser components for the trusted bundled module. Studio supplies
copy/toast/dialog context and composes the module; it does not own its requirement
implementation. Disabled policy retains this UI so requirements can be configured.

Use shared controls from `packages/ui`. Browser dependencies are pinned separately
from backend dependencies. No backend entry, native provider or global Studio model
may be imported. Account view/edit ports expose only the fields/actions used by the
component. Server policy and authorization remain authoritative.

Studio's build and UI checker compile every bundled UI owner. Source compilation
and fixture browser checks are separate from live provider/device acceptance.
