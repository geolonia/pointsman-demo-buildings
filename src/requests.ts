// Check requests: a resident (or staff) asks how urgently someone should look at
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

/** The answers from a request body, checked; throws a message for the page on anything else. */
export function parseAnswers(body: unknown, now = new Date()): Answers {
  // Read per request: in a Worker, the clock does not run while the module loads (it reads 1970).
  const thisYear = now.getUTCFullYear();
  if (body === undefined || body === null) return {};
  if (typeof body !== 'object' || Array.isArray(body)) throw new RequestError('answers must be an object');
  const a = body as Record<string, unknown>;
  for (const key of Object.keys(a)) if (!['yearOfConstruction', 'wood', 'storeysAboveGround'].includes(key)) throw new RequestError(`unknown answer "${key}"`);
  const out: Answers = {};
  if (a.yearOfConstruction !== undefined && a.yearOfConstruction !== null) {
    const y = a.yearOfConstruction;
    if (typeof y !== 'number' || !Number.isInteger(y) || y < 1868 || y > thisYear) throw new RequestError(`yearOfConstruction must be a year from 1868 to ${thisYear}`);
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

/** Scene B: what worries the person, in their own words. */
export interface Concern {
  description: string;
  /** Do they say it started after an earthquake or another disaster? */
  afterDisaster?: 'yes' | 'no' | 'unsure';
  /**
   * Photos of the building: as the page sends them, base64 data URLs shrunk to
   * about 1 megapixel; on the entity, their keys in R2 (src/photos.ts).
   */
  photos?: string[];
}

export const MAX_DESCRIPTION = 1000;
/** Photos per request; Clef takes up to 4 images, the profile reads 3. */
export const MAX_PHOTOS = 3;
/** One photo as a data URL (about 500 KB of JPEG): the page shrinks them well below this. */
export const MAX_PHOTO_CHARS = 700_000;

const PHOTO = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/** Whether the first bytes are the format the data URL names (the AI is sent only real images). */
function photoMatches(type: string, b64: string): boolean {
  let b: Uint8Array;
  try {
    b = Uint8Array.from(atob(b64.slice(0, 16)), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  return String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
}

function parsePhotos(value: unknown): string[] {
  if (!Array.isArray(value)) throw new RequestError('concern.photos must be a list');
  if (value.length > MAX_PHOTOS) throw new RequestError(`at most ${MAX_PHOTOS} photos`);
  value.forEach((v, i) => {
    const m = typeof v === 'string' && v.length <= MAX_PHOTO_CHARS ? PHOTO.exec(v) : null;
    if (!m || m[2]!.length % 4 !== 0 || !photoMatches(m[1]!, m[2]!)) throw new RequestError(`photo ${i + 1}: must be a JPEG, PNG or WebP image of at most 500 KB`);
  });
  return value as string[];
}

/** The concern from a request body, checked; undefined when there is none. Throws a message for the page otherwise. */
export function parseConcern(body: unknown): Concern | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== 'object' || Array.isArray(body)) throw new RequestError('concern must be an object');
  const c = body as Record<string, unknown>;
  for (const key of Object.keys(c)) if (!['description', 'afterDisaster', 'photos'].includes(key)) throw new RequestError(`unknown concern field "${key}"`);
  if (typeof c.description !== 'string') throw new RequestError('concern.description must be text');
  const description = c.description.trim();
  const photos = c.photos === undefined || c.photos === null ? [] : parsePhotos(c.photos);
  // Photos come with words: the AI reads both, and a description says what the photos are about.
  if (description === '') {
    if (photos.length > 0) throw new RequestError('describe in a few words what the photos show');
    return undefined;
  }
  if (description.length > MAX_DESCRIPTION) throw new RequestError(`concern.description must be at most ${MAX_DESCRIPTION} characters`);
  // Control characters other than line breaks and tabs: never part of a description.
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description)) throw new RequestError('concern.description must not contain control characters');
  if (c.afterDisaster !== undefined && c.afterDisaster !== null && !['yes', 'no', 'unsure'].includes(c.afterDisaster as string)) {
    throw new RequestError('concern.afterDisaster must be yes, no or unsure');
  }
  const out: Concern = { description };
  if (typeof c.afterDisaster === 'string') out.afterDisaster = c.afterDisaster as NonNullable<Concern['afterDisaster']>;
  if (photos.length > 0) out.photos = photos;
  return out;
}

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
export function toRequestEntity(building: Entity, answers: Answers, uuid: string, lang: 'en' | 'ja', concern?: Concern): Entity {
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
  if (concern) {
    e.description = P(concern.description, 'resident');
    if (concern.afterDisaster) e.afterDisaster = P(concern.afterDisaster, 'resident');
    if (concern.photos) e.photos = P(concern.photos, 'resident');
  }
  return e;
}

/** The attributes the profile reads (the bridge's loop guard hashes them). */
export const REQUEST_INPUTS = ['location', 'yearOfConstruction', 'buildingStructureType', 'storeysAboveGround'];

/** The attributes building-concern reads (scene B): the words, and the check it builds on. */
export const CONCERN_INPUTS = ['description', 'afterDisaster', 'photos', 'check'];
