# Pointsman buildings demo

A demo of [Pointsman](https://github.com/geolonia/pointsman) on a smart-city
data platform (FIWARE), for buildings. After a large earthquake (or a flood,
a landslide, heavy snow), a city gets thousands of requests at once.
Pointsman sorts them, so the most serious ones are seen first, with a reason
for each. The same system runs before a disaster: residents and staff check
homes and public buildings, and the city gets a list of what to check first.

Pointsman sorts and explains. It never decides that a building is safe: that
is always a person's decision.

Address (once deployed): https://buildings.demo.pointsman.net (all demos:
https://pointsman.net/demos/). The first demo, for closed roads, is
[pointsman-demo-roads](https://github.com/geolonia/pointsman-demo-roads).

## Status

This is the first step: the buildings.

- 3,866 buildings of one neighbourhood in Kiyota-ku, Sapporo, from the
  national 3D city model [PLATEAU](https://www.mlit.go.jp/plateau/)
  ([data/plateau](data/plateau/README.md)).
- They are `Building` entities in GeonicDB, an NGSI-LD context broker
  ([scripts/load-buildings.mjs](scripts/load-buildings.mjs)).
- The page shows them on a map, coloured by year built, with each building's
  data and a "For developers" panel with the NGSI-LD requests.

Next steps:

1. A request form, step by step (the building, what happened, photos,
   check, send). Requests are entities in the broker too.
2. The bridge and Pointsman's profiles: priority, team, the reason, and a
   person for unclear requests. Facts from the address: shaking and ground
   ([J-SHIS](https://github.com/geolonia/pointsman/blob/main/docs/modules.md)),
   flood and landslide zones, nearest shelter.
3. Results as `Decision`, `Task` and `Alert` entities, which other systems
   (a city dashboard, a ticket system) can subscribe to.

## The `Building` entity

There is no `Building` model on [datamodels.jp](https://datamodels.jp) yet;
one is planned once the demo runs with real data. Until then the attribute
names are PLATEAU's, in the NGSI-LD core context (they expand to the default
vocabulary). Unknown values are left out.

```json
{
  "id": "urn:ngsi-ld:Building:plateau:01100-bldg-596589",
  "type": "Building",
  "location": { "type": "GeoProperty", "value": { "type": "Polygon", "coordinates": [[[141.45, 42.98], "…"]] } },
  "buildingID": { "type": "Property", "value": "01100-bldg-596589" },
  "yearOfConstruction": { "type": "Property", "value": 1981 },
  "buildingStructureType": { "type": "Property", "value": "601" },
  "usage": { "type": "Property", "value": "411" },
  "storeysAboveGround": { "type": "Property", "value": 2 },
  "measuredHeight": { "type": "Property", "value": 8.3, "unitCode": "MTR" },
  "riverFloodRisk": { "type": "Property", "value": { "rank": 2, "depth": 1.9, "river": "石狩川水系厚別川", "scale": "L2" } },
  "source": { "type": "Property", "value": "「3D都市モデル（Project PLATEAU）札幌市（2020年度）」（国土交通省）を加工して作成" }
}
```

Codes are PLATEAU's code lists (`buildingStructureType` 601 = wood,
`usage` 411 = house); their names are in [src/buildings.ts](src/buildings.ts).

## API for the page

| Endpoint | |
|---|---|
| `GET /api/config` | The demo area (bounding box) and the data credit |
| `GET /api/buildings` | The area's buildings as GeoJSON, read from the broker (geo-query, paged); `query` is the NGSI-LD request. Cached 10 minutes, but only when the list is not empty and complete: as many as the broker counted (`NGSILD-Results-Count`), or, when the broker gives no count, the last page had fewer than 1,000 |
| `GET /api/buildings/{id}` | One `Building` entity as stored, the request, and the same as a GeoJSON feature. Cached 1 minute |
| `POST /api/requests` | `{"building": "<id>", "answers": {"yearOfConstruction", "wood", "storeysAboveGround"}, "lang"}`: a check request for one building. From the page itself (same origin), 5 a minute per visitor and `DAILY_LIMIT` (300) for the whole demo, closed (503) until the bridge is configured. Answers `{"id"}` |
| `GET /api/requests/{id}` | The request entity with Pointsman's result (`check`) and its `Decision` entity |
| `POST /notify` | The broker's subscription (secret in `x-bridge-secret`): the bridge asks Pointsman and writes the result back |

## Check requests and the bridge

A check request is a `BuildingCheckRequest` entity in the broker: a link to
the building (`refBuilding`), its centre point (`location`, for point facts
such as J-SHIS), and the building's year built, structure and storeys.
PLATEAU's values come first; the resident's answers fill only what PLATEAU
does not know, and each value says where it came from (`origin`: `plateau`
or `resident`).

A broker subscription sends new and changed requests to `/notify`. The
[FIWARE bridge](https://github.com/geolonia/pointsman/tree/main/packages/fiware)
(from the engine commit pinned in `engine.json`) asks Pointsman, profile
`building-check-priority` (rules only, no AI model), and writes the result to
the request as `check`, plus a `Decision` entity, and a `Task` entity for a
high priority, so any app that lists tasks shows the work. Every hour,
requests older than a day are deleted with their Decision and Task entities,
and a request that still has no result after two minutes (Pointsman or the
broker failed when it was notified) is sent to the bridge again, at most 20
a run.

A high priority waits for a person in Pointsman (the profile's
`people_check`). This demo does not answer those reviews yet: that comes with
the staff view.

## Setup

Settings are in [wrangler.jsonc](wrangler.jsonc): `BROKER_URL`,
`BROKER_TENANT` (`pointsman_buildings`), `POINTSMAN_URL`, `DAILY_LIMIT` and
`CONCERNS` (`"on"` lets people describe their concern for the AI to read;
`"off"` refuses descriptions with 503 and keeps the check from the building's
data).
Secrets (`wrangler secret put <NAME>`):

| Secret | |
|---|---|
| `BROKER_API_KEY` | An API key of the tenant |
| `NOTIFY_SECRET` | Random; the subscription sends it (`scripts/setup.mjs`) |
| `POINTSMAN_TOKEN` | A Pointsman token limited to `building-check-priority` and `building-concern` |

Without `POINTSMAN_TOKEN` and `NOTIFY_SECRET` the page still shows the
buildings, and new check requests are refused (503).

Then, once: `BROKER_API_KEY=… NOTIFY_SECRET=… node scripts/setup.mjs` creates
the two subscriptions, one for the check and one for descriptions (run it
again after the inputs change). Turn `CONCERNS` on only after it ran.

The bridge's queues must exist before the first deploy (create them once):
`wrangler queues create pointsman-demo-buildings-bridge` and
`wrangler queues create pointsman-demo-buildings-bridge-dlq`.

Load the buildings once (and again after the data changes):

```sh
node scripts/load-buildings.mjs                    # shows what it would write
BROKER_API_KEY=… node scripts/load-buildings.mjs --apply
```

Upsert replaces each building and never deletes: a building that left the
data stays until it is deleted by hand. The page may show the old list for
up to ten minutes after a load.

## Development

Node 24 and pnpm.

```sh
pnpm engine        # the bridge, from the Pointsman commit in engine.json
pnpm install
pnpm check          # typecheck, tests, dry-run deploy
```

Without a broker tenant, run the local stand-in and the Worker:

```sh
node scripts/mock-broker.mjs
printf 'BROKER_URL=http://localhost:8790\nBROKER_API_KEY=local\n' > .dev.vars
pnpm dev
```

No build step for the page: plain HTML, CSS and JavaScript in `site/`,
MapLibre GL JS from unpkg with integrity hashes, GSI's vector tiles. The page
is served with a Content-Security-Policy ([site/_headers](site/_headers));
`pnpm test` checks the page against it.

## Licence

Code: MIT ([LICENSE](LICENSE)). Building data: PLATEAU, see
[data/plateau](data/plateau/README.md).
