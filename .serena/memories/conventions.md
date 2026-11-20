# Conventions

CONTRIBUTING.md has the PR steps; the rest comes from README and code, and the `engine.json` and plain-English rules from the Pointsman org practice. Key ones agents trip on:
- Public repo: no secrets, account ids or resource ids; secrets only via `wrangler secret put` or env vars.
- `git commit -s` (DCO). Plain, simple English in comments, commits and docs.
- Never point `engine.json` at an unmerged engine commit (merge and release in geolonia/pointsman first).
- Pointsman sorts and explains; it never says a building is safe. Keep that wording in page text.
- The broker drops notifications for entities over about 230 KB: photos go to R2, not into entities.
- PLATEAU codes stay codes in the data; names are in `src/buildings.ts`. Keep the data credit (`source`) on entities and page.
