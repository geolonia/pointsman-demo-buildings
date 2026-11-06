#!/usr/bin/env node
// A stand-in for the broker, for local development without a GeonicDB
// tenant: answers the two NGSI-LD requests the Worker makes (list of
// Buildings, one Building) from data/plateau/satozuka.geojson. It ignores the
// geo-query and returns every building.
//
//   node scripts/mock-broker.mjs            (port 8790, or PORT)
//   echo 'BROKER_URL=http://localhost:8790' > .dev.vars; echo 'BROKER_API_KEY=local' >> .dev.vars; pnpm dev

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { toEntity } from '../src/buildings.ts';

const PORT = Number(process.env.PORT ?? 8790);
const entities = JSON.parse(readFileSync('data/plateau/satozuka.geojson', 'utf8')).features.map(toEntity);
const byId = new Map(entities.map((e) => [e.id, e]));

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  if (req.method !== 'GET') return send(405);
  if (url.pathname === '/ngsi-ld/v1/entities') {
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 1000);
    return send(200, entities.slice(offset, offset + limit));
  }
  const m = url.pathname.match(/^\/ngsi-ld\/v1\/entities\/(.+)$/);
  const one = m ? byId.get(decodeURIComponent(m[1])) : undefined;
  return one ? send(200, one) : send(404, { title: 'not found' });
}).listen(PORT, () => console.log(`mock broker: http://localhost:${PORT} (${entities.length} buildings)`));
