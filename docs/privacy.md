# Repository privacy

Keep original personal photos, real account/library activity, credentials and runtime exports outside every code repository and worktree. Use invented fixtures and example.invalid addresses in code, tests and screenshots. Preserve technical conclusions without publishing private validation narratives or claiming synthetic tests prove live-user acceptance.

Before committing, run `python3 scripts/check_private_material.py` (CAD: `uv run --no-sync python scripts/check_private_material.py`). Install the repository hook explicitly with `git config --local core.hooksPath .githooks`. The check inspects staged bytes locally; it never uploads them or prints matched credential values.

New or changed images, video and PDFs require an entry in `.privacy-assets.json` keyed by the repository-relative path, with the exact staged SHA-256, a `category` of `synthetic-ui`, `owner-authored-design` or `public-reference`, and `reviewed_by`. Review actual contents, metadata and origin before attesting. Real personal photos are never permitted through a provenance label. Existing files still need independent review; this gate does not certify them.

Run `python3 -m unittest discover -s tests -p test_privacy_gate.py` for the adversarial gate checks. Credential-pattern checks and hooks are partial prevention, not proof that an image or narrative contains no private data. Keep the private identity denylist and history-cleanup recovery materials outside Git.
