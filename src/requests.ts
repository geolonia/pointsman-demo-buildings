// Check requests: a resident (or staff) asks how urgent a seismic check of
// one building is. The request is a `BuildingCheckRequest` entity in the
// broker, built from the Building entity (PLATEAU) and the answers the
// resident gives for what PLATEAU does not know. The bridge then asks
// Pointsman (profile building-check-priority) and writes the result back.
//
// PLATEAU's values win: an answer fills only a gap. Each value says where it
// came from (`origin`: plateau or resident), so staff can see what to check.

import { type Entity, type Polygon, STRUCTURE } from './buildings';

export const REQUEST_TYPE = 'BuildingCheckRequest';
const ID = /^urn:ngsi-ld:BuildingCheckRequest:demo-[0-9a-f-]{36}$/;
export const isRequestId = (id: string) => ID.test(id);

/** What the resident may answer. All optional: unknown is a fine answer. */
export interface Answers {
  yearOfConstruction?: number;
  /** wood or not wood; the profile reads PLATEAU's codes (601 wood, 610 not wood). */
  wood?: boolean;
  storeysAboveGround?: number;
}

const THIS_YEAR = new Date().getUTCFullYear();

/** The answers from a request body, checked; throws a message for the page on anything else. */
export function parseAnswers(body: unknown): Answers {
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) throw new RequestError('answers must be an object');
  const a = body as Record<string, unknown>;
  for (const key of Object.keys(a)) if (!['yearOfConstruction', 'wood', 'storeysAboveGround'].includes(key)) throw new RequestError(`unknown answer "${key}"`);
  const out: Answers = {};
  if (a.yearOfConstruction !== undefined && a.yearOfConstruction !== null) {
    const y = a.yearOfConstruction;
    if (typeof y !== 'number' || !Number.isInteger(y) || y < 1868 || y > THIS_YEAR) throw new RequestError(`yearOfConstruction must be a year from 1868 to ${THIS_YEAR}`);
    out.yearOfConstruction = y;
  }
  if (a.wood !== undefined && a.wood !== null) {
    if (typeof a.wood !== 'boolean') throw new RequestError('wood must be true or false');
    out.wood = a.wood;
  }
  if (a.storeysAboveGround !== undefined && a.storeysAboveGround !== null) {
    const s = a.storeysAboveGround;
    if (typeof s !== 'number' || !Number.isInteger(s) || s < 1 || s > 99) throw new RequestError('storeysAboveGround must be a whole number from 1 to 99');
    out.storeysAboveGround = s;
  }
  return out;
}

export class RequestError extends Error {}

const P = (value: unknown, origin: 'plateau' | 'resident') => ({ type: 'Property', value, origin: { type: 'Property', value: origin } });

const valueOf = (e: Entity, name: string): unknown => {
  const a = e[name];
  return a && typeof a === 'object' && 'value' in a ? (a as { value: unknown }).value : undefined;
};

/** The centre of a footprint (mean of its corners), for point facts such as J-SHIS. */
export function centreOf(p: Polygon): [number, number] {
  const ring = p.coordinates[0]!;
  const corners = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
  const lon = corners.reduce((s, c) => s + c[0], 0) / corners.length;
  const lat = corners.reduce((s, c) => s + c[1], 0) / corners.length;
  return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
}

/** The request entity for a building and the resident's answers (normalized NGSI-LD, core context). */
export function toRequestEntity(building: Entity, answers: Answers, uuid: string, lang: 'en' | 'ja'): Entity {
  const footprint = valueOf(building, 'location') as Polygon | undefined;
  if (footprint?.type !== 'Polygon') throw new RequestError('the building has no footprint');
  const e: Entity = {
    id: `urn:ngsi-ld:BuildingCheckRequest:demo-${uuid}`,
    type: REQUEST_TYPE,
    refBuilding: { type: 'Relationship', object: building.id },
    location: { type: 'GeoProperty', value: { type: 'Point', coordinates: centreOf(footprint) } },
    channel: { type: 'Property', value: 'web' },
    language: { type: 'Property', value: lang },
  };
  const year = valueOf(building, 'yearOfConstruction');
  if (typeof year === 'number') e.yearOfConstruction = P(year, 'plateau');
  else if (answers.yearOfConstruction !== undefined) e.yearOfConstruction = P(answers.yearOfConstruction, 'resident');
  const structure = valueOf(building, 'buildingStructureType');
  if (typeof structure === 'string' && STRUCTURE[structure]) e.buildingStructureType = P(structure, 'plateau');
  else if (answers.wood !== undefined) e.buildingStructureType = P(answers.wood ? '601' : '610', 'resident');
  const storeys = valueOf(building, 'storeysAboveGround');
  if (typeof storeys === 'number') e.storeysAboveGround = P(storeys, 'plateau');
  else if (answers.storeysAboveGround !== undefined) e.storeysAboveGround = P(answers.storeysAboveGround, 'resident');
  const usage = valueOf(building, 'usage');
  if (typeof usage === 'string') e.usage = P(usage, 'plateau');
  return e;
}

/** The attributes the profile reads (the bridge's loop guard hashes them). */
export const REQUEST_INPUTS = ['location', 'yearOfConstruction', 'buildingStructureType', 'storeysAboveGround'];
