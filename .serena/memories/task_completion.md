# Done checklist

- `pnpm check` passes (run `pnpm engine` first; a linked `engine/` hides drift from the pin, so re-run against the pinned engine before trusting it).
- New or changed endpoint, setting or secret: README tables and the header comment of `src/index.ts` updated.
- Behaviour change in the bridge flow: the matching engine change is merged and `engine.json` moved to its release commit.
- Page change: `site/_headers` CSP still matches (the test checks it).
- Data change: `data/plateau/README.md` numbers still true; broker reload is a separate manual `--apply` step.
