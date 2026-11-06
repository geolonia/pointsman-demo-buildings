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
| `GET /api/buildings` | The area's buildings as GeoJSON, read from the broker (geo-query, paged); `query` is the NGSI-LD request. Cached 10 minutes |
| `GET /api/buildings/{id}` | One `Building` entity as stored, the request, and the same as a GeoJSON feature |

## Setup

Settings are in [wrangler.jsonc](wrangler.jsonc): `BROKER_URL` and
`BROKER_TENANT` (`pointsman_buildings`). Secret: `BROKER_API_KEY`, an API key
of that tenant (`wrangler secret put BROKER_API_KEY`).

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
