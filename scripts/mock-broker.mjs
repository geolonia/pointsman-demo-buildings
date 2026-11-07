#!/usr/bin/env node
// A stand-in for the broker, for local development without a GeonicDB
// tenant: answers the NGSI-LD requests the Worker makes, from
// data/plateau/satozuka.geojson. It ignores the geo-query and returns every
// building. Check requests are kept in memory; about two seconds after one is
// created, the mock writes a result as the bridge would, with the rules of
// building-check-priority v1 (without the hazard facts), so the page's whole
// flow can be tried without Pointsman.
//
//   node scripts/mock-broker.mjs            (port 8790, or PORT)
//   printf 'BROKER_URL=http://localhost:8790\nBROKER_API_KEY=local\nPOINTSMAN_TOKEN=local\nNOTIFY_SECRET=local\n' > .dev.vars; pnpm dev

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { toEntity } from '../src/buildings.ts';

const PORT = Number(process.env.PORT ?? 8790);
const entities = new Map(JSON.parse(readFileSync('data/plateau/satozuka.geojson', 'utf8')).features.map(toEntity).map((e) => [e.id, e]));

const P = (value) => ({ type: 'Property', value });

/** The rules of building-check-priority v1, without the hazard facts: [rule index or "default", action]. */
function decide(e) {
  const year = e.yearOfConstruction?.value;
  const structure = e.buildingStructureType?.value;
  if (typeof year !== 'number' || typeof structure !== 'string') return ['0', 'more-evidence'];
  if (year <= 1981 && structure === '601') return ['1', 'high'];
  if (year <= 1981) return ['2', 'medium'];
  return ['default', 'low'];
}

let generation = 0;
const generations = new Map();

/**
 * Scene B without a model: keywords stand in for the AI (EN and JA), so the
 * page's flow can be tried locally. Marked as mock in the Decision entity.
 * The real answers come from Clef through Pointsman (profile building-concern).
 */
function mockConcern(e, check) {
  const text = String(e.description?.value ?? '').toLowerCase();
  const has = (...words) => words.some((w) => text.includes(w));
  let damage = 'nothing_clear';
  if (has('collapse', '崩れ', '倒壊')) damage = 'partial_collapse';
  else if (has('lean', 'tilt', 'sink', '傾', '沈')) damage = 'tilt_or_sinking';
  else if (has('tile', 'fall', '落ち', '瓦')) damage = 'falling_parts';
  else if (has('diagonal', 'x-shaped', 'column', '斜め', '柱')) damage = 'structural_cracks';
  else if (has('foundation', 'sand', '基礎', '液状化', '砂')) damage = 'foundation_or_ground';
  else if (has('water', 'leak', 'fire', '水', '雨漏り', '火')) damage = 'water_or_fire';
  else if (has('crack', 'paint', 'ひび', '塗装')) damage = 'cosmetic';
  const danger = damage === 'partial_collapse' || has('gas', 'trapped', 'ガス', '閉じ込め');
  const severity = { partial_collapse: 4, tilt_or_sinking: 3, falling_parts: 2, structural_cracks: 2, foundation_or_ground: 2, water_or_fire: 2, cosmetic: 1, nothing_clear: 0 }[damage];
  let rule = 'default', action = 'low';
  if (danger) [rule, action] = ['1', 'now'];
  else if (['tilt_or_sinking', 'falling_parts', 'foundation_or_ground'].includes(damage)) [rule, action] = ['2', 'high'];
  else if (damage === 'structural_cracks' && check === 'high') [rule, action] = ['3', 'high'];
  else if (damage === 'structural_cracks' || damage === 'water_or_fire') [rule, action] = ['4', 'medium'];
  else if (damage === 'nothing_clear') [rule, action] = ['6', 'more-evidence'];
  else if (check === 'high') [rule, action] = ['7', 'medium'];
  const answers = [
    { name: 'about_building', type: 'noul', value: true, probability: 0.9 },
    { name: 'damage', type: 'choice', value: damage, probability: 0.8 },
    { name: 'danger_now', type: 'noul', value: danger, probability: 0.8 },
    { name: 'severity', type: 'score', value: severity, probability: 0.7 },
  ];
  return { rule, action, answers };
}

/** Writes a result about 2 s later, only to the request as created now (not one deleted and created again). */
function decideLater(id, gen) {
  setTimeout(() => {
    const e = entities.get(id);
    if (!e || generations.get(id) !== gen) return;
    const [rule, action] = decide(e);
    const decisionId = crypto.randomUUID();
    const decision = `urn:ngsi-ld:Decision:${decisionId}`;
    entities.set(decision, { id: decision, type: 'Decision', note: P('made by scripts/mock-broker.mjs, not by Pointsman') });
    entities.set(id, { ...e, check: { type: 'Property', value: action, decisionId: P(decisionId), decision: { type: 'Relationship', object: decision }, profile: P('building-check-priority'), policyRule: P(rule), model: P('none') } });
    // Scene B: a second decision on the description, a moment later (as the chained route would).
    if (e.description) {
      setTimeout(() => {
        const now = entities.get(id);
        if (!now || generations.get(id) !== gen) return;
        const c = mockConcern(now, action);
        const cid = crypto.randomUUID();
        const cdecision = `urn:ngsi-ld:Decision:${cid}`;
        entities.set(cdecision, { id: cdecision, type: 'Decision', note: P('made by scripts/mock-broker.mjs with keywords, not by an AI'), 'https://datamodels.jp/ns/decision/answers': { type: 'JsonProperty', json: c.answers } });
        entities.set(id, { ...now, concern: { type: 'Property', value: c.action, decisionId: P(cid), decision: { type: 'Relationship', object: cdecision }, profile: P('building-concern'), policyRule: P(c.rule), model: P('mock') } });
      }, 2000);
    }
  }, 2000);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  let text = '';
  req.on('data', (c) => { text += c; });
  req.on('end', () => {
    if (url.pathname === '/ngsi-ld/v1/entities' && req.method === 'POST') {
      let e;
      try { e = JSON.parse(text); } catch { return send(400, { title: 'not JSON' }); }
      if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.id !== 'string' || typeof e.type !== 'string') return send(400, { title: 'not an entity' });
      if (entities.has(e.id)) return send(409, { title: 'exists' });
      const gen = ++generation;
      entities.set(e.id, { ...e, createdAt: new Date().toISOString() });
      generations.set(e.id, gen);
      if (e.type === 'BuildingCheckRequest') decideLater(e.id, gen);
      return send(201);
    }
    if (url.pathname === '/ngsi-ld/v1/entities' && req.method === 'GET') {
      const type = url.searchParams.get('type');
      const all = [...entities.values()].filter((e) => !type || e.type === type);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 1000);
      return send(200, all.slice(offset, offset + limit), url.searchParams.get('count') === 'true' ? { 'NGSILD-Results-Count': String(all.length) } : {});
    }
    const m = url.pathname.match(/^\/ngsi-ld\/v1\/entities\/([^/]+)$/);
    let id;
    try { id = m ? decodeURIComponent(m[1]) : undefined; } catch { return send(400, { title: 'bad id' }); }
    if (id && req.method === 'GET') {
      const one = entities.get(id);
      return one ? send(200, one) : send(404, { title: 'not found' });
    }
    if (id && req.method === 'DELETE') return send(entities.delete(id) ? 204 : 404);
    return send(405);
  });
}).listen(PORT, () => console.log(`mock broker: http://localhost:${PORT} (${entities.size} buildings)`));
