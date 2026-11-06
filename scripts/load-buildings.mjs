#!/usr/bin/env node
// Loads the PLATEAU buildings (data/plateau/*.geojson) into the broker as
// Building entities (src/buildings.ts), with NGSI-LD batch upsert. Run it
// again after the data changes. Upsert replaces each building as a whole
// (attributes another app added to it are lost) and never deletes: a
// building that left the data stays in the broker until deleted by hand.
// The page keeps its list for up to ten minutes after a load.
//
//   node scripts/load-buildings.mjs                  shows what it would write
//   BROKER_API_KEY=… node scripts/load-buildings.mjs --apply
//
// Settings (environment): BROKER_API_KEY (needed for --apply), BROKER_URL and
// BROKER_TENANT (default: as in wrangler.jsonc), FILE (default
// data/plateau/satozuka.geojson).

import { readFileSync } from 'node:fs';
import { toEntity } from '../src/buildings.ts';

const FILE = process.env.FILE ?? 'data/plateau/satozuka.geojson';
const BROKER_URL = (process.env.BROKER_URL ?? 'https://geolonia-demo.geonicdb.jp').replace(/\/+$/, '');
const TENANT = process.env.BROKER_TENANT ?? 'pointsman_buildings';
const CORE_CONTEXT = 'https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context-v1.8.jsonld';
const BATCH = 100;
const apply = process.argv.includes('--apply');

const { features } = JSON.parse(readFileSync(FILE, 'utf8'));
const entities = features.map(toEntity);
const ids = new Set(entities.map((e) => e.id));
if (ids.size !== entities.length) throw new Error(`${FILE}: ${entities.length - ids.size} duplicate building ids`);
const count = (name) => entities.filter((e) => name in e).length;
console.log(`${entities.length} buildings from ${FILE}`);
for (const name of ['yearOfConstruction', 'buildingStructureType', 'usage', 'storeysAboveGround', 'measuredHeight', 'riverFloodRisk', 'landslideRisk']) {
  console.log(`  ${name}: ${count(name)}`);
}

if (!apply) {
  console.log('\nFirst entity:\n' + JSON.stringify(entities[0], null, 2));
  console.log(`\nNothing written. Add --apply to write to ${BROKER_URL} (tenant ${TENANT}).`);
  process.exit(0);
}

const key = process.env.BROKER_API_KEY;
if (!key) throw new Error('BROKER_API_KEY is not set');
const url = new URL(BROKER_URL);
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('BROKER_URL must be https');

let written = 0;
for (let i = 0; i < entities.length; i += BATCH) {
  const batch = entities.slice(i, i + BATCH);
  let res;
  try {
    res = await fetch(`${BROKER_URL}/ngsi-ld/v1/entityOperations/upsert`, {
      signal: AbortSignal.timeout(60_000),
      method: 'POST',
      headers: {
        'x-api-key': key,
        'NGSILD-Tenant': TENANT,
        'content-type': 'application/json',
        link: `<${CORE_CONTEXT}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
        // GeonicDB's firewall refuses requests without a User-Agent.
        'user-agent': 'pointsman-demo-buildings (+https://github.com/geolonia/pointsman-demo-buildings)',
      },
      body: JSON.stringify(batch),
    });
  } catch (err) {
    throw new Error(`batch at ${i}: ${err.message} (buildings before it are written; run again to finish)`);
  }
  // 201: all created, 204: all updated, 207: some failed (the body lists them).
  if (res.status === 207) {
    const body = await res.json();
    const errors = body.errors ?? [];
    throw new Error(`batch at ${i}: ${errors.length} failed, first: ${JSON.stringify(errors[0] ?? body).slice(0, 300)}`);
  }
  if (res.status !== 201 && res.status !== 204) throw new Error(`batch at ${i}: broker answered ${res.status}`);
  written += batch.length;
  process.stdout.write(`\r${written} / ${entities.length}`);
}
console.log(`\nDone: ${written} buildings in ${BROKER_URL} (tenant ${TENANT}).`);
