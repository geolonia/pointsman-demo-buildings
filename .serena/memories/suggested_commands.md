# Commands

- First time and after changing `engine.json`: `pnpm engine`, then `pnpm install`.
- `pnpm check` = typecheck + tests + dry-run deploy: the last step of CI, which first runs `node scripts/fetch-engine.mjs` and `pnpm install --frozen-lockfile`. After a dependency change, update the lockfile before `pnpm check`.
- `pnpm dev` runs the Worker; without a broker tenant start `node scripts/mock-broker.mjs` first. `.dev.vars` needs `POINTSMAN_TOKEN` and `NOTIFY_SECRET` too (example in the header of `scripts/mock-broker.mjs`), or checks answer 503.
- `node scripts/load-buildings.mjs` is a dry run; `--apply` (with `BROKER_API_KEY`) writes to the broker.
- `scripts/setup.mjs` creates broker subscriptions; set `WORKER_URL` for your own deployment, or notifications go to the public demo.
- Python scripts: `python3 -I scripts/plateau/...`; full steps in data/plateau/README.md.
