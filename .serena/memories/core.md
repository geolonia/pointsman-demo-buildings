# pointsman-demo-buildings (Pointsman demo: building requests after a disaster, sorted by priority; buildings.demo.pointsman.net)

Canonical docs (do not duplicate): README.md (entity shape, API table, bridge flow, Worker settings and secrets, one-time setup, dev), CONTRIBUTING.md (checks, DCO), data/plateau/README.md (data source, edits, how to rebuild the GeoJSON), site/photos/README.md (photo credits). No AGENTS.md.

Source map:
- `src/index.ts` = Worker entry: routes, bridge wiring (`/notify`, `/reviews`, queue consumer, hourly cleanup/retry). Header comment lists the endpoints.
- `src/` other: `board.ts` staff view, `broker.ts` NGSI-LD client, `buildings.ts` Building entity + PLATEAU code names, `requests.ts` request entity and input parsing, `photos.ts` R2 photos, `env.ts` bindings, `http.ts`.
- `site/` = static page (plain HTML/CSS/JS, no build); `site/_headers` = CSP that `pnpm test` checks the page against.
- `data/plateau/satozuka.geojson` = committed building data; made by `scripts/plateau/` (Python, stdlib only, run with `python3 -I`): `rzip.py` reads single files from the remote PLATEAU zip, `to_geojson.py` makes the GeoJSON.
- `scripts/*.mjs`: `fetch-engine.mjs` (`pnpm engine`), `load-buildings.mjs` (GeoJSON to broker), `setup.mjs` (broker subscriptions), `mock-broker.mjs` (local stand-in broker).
- `test/` = vitest in the Workers runtime (`*.test.ts`). `engine/` = git-ignored engine checkout; the bridge is imported from `engine/packages/fiware/src/bridge`.

Cross-repo:
- `engine.json` pins a geolonia/pointsman commit (SHA); `scripts/fetch-engine.mjs` refuses `engine/` that differs from it or has changed files. A link to a local engine clone skips that check.
- Profiles `building-check-priority` and `building-concern` are published on the Pointsman service (`POINTSMAN_URL`), not kept here; this repo only names them.
- Engine docs: no page about this demo. `docs/fiware-demo.md` is the roads demo's storyboard (same FIWARE pattern); `docs/profile-format.md` covers profile fields.
- Sibling demo with the same layout: geolonia/pointsman-demo-roads.

Further: `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`.
