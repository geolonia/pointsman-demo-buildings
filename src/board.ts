// The staff view (plan section 10): the open requests of the last day as city
// staff would see them, most serious first, and a person's answer on the ones
// Pointsman queued for a person. Everyone in the demo sees the same requests
// (they are deleted after a day); photos are shown as a count only.

import type { Entity } from './buildings';
import { isRequestId, REQUEST_TYPE } from './requests';

/** Most serious first. `person`: the AI could not tell, a person decides. */
export const PRIORITY_ORDER = ['now', 'high', 'person', 'more-evidence', 'medium', 'low'];

/**
 * The actions a person may choose, per result (the profiles' people_answers):
 * building-check-priority for `check`, building-concern for `concern`.
 */
export const PEOPLE_ANSWERS: Record<'check' | 'concern', string[]> = {
  check: ['high', 'medium', 'low'],
  concern: ['now', 'high', 'medium', 'low', 'more-evidence'],
};

/** Who resolved it, on the Decision entity and in Pointsman's log. */
export const DEMO_REVIEWER = 'demo visitor';

export interface ResultSummary {
  action: string;
  /** The rule that matched, as the profile numbers it; absent for the default. */
  rule?: string;
  /** pending: a person decides; resolved: a person did (finalAction). */
  reviewStatus?: string;
  finalAction?: string;
  /** The Decision entity's id. */
  decision?: string;
}

export interface BoardRow {
  id: string;
  createdAt: string;
  building: string;
  /** [lon, lat] */
  point?: [number, number];
  year?: number;
  /** PLATEAU's structure code (601 wood, 610 not wood, …). */
  structure?: string;
  storeys?: number;
  description?: string;
  afterDisaster?: string;
  photos: number;
  language?: string;
  check?: ResultSummary;
  concern?: ResultSummary;
  /** The action that counts now: a person's, else the description's, else the check's. */
  priority?: string;
  /** Which result waits for a person; none when nothing does. */
  waiting?: 'check' | 'concern';
}

const valueOf = (e: Entity, name: string): unknown => {
  const a = e[name];
  return a && typeof a === 'object' && 'value' in a ? (a as { value: unknown }).value : undefined;
};
const sub = (attr: Record<string, unknown>, name: string): unknown => {
  const a = attr[name];
  return a && typeof a === 'object' && 'value' in a ? (a as { value: unknown }).value : undefined;
};

/** A result attribute (check or concern) in short; undefined when there is none yet. */
export function summaryOf(e: Entity, attribute: 'check' | 'concern'): ResultSummary | undefined {
  const attr = e[attribute] as Record<string, unknown> | undefined;
  if (!attr || typeof attr !== 'object' || typeof attr.value !== 'string') return undefined;
  const out: ResultSummary = { action: attr.value };
  const rule = sub(attr, 'policyRule');
  if (rule !== undefined && rule !== null) out.rule = String(rule);
  const status = sub(attr, 'reviewStatus');
  if (typeof status === 'string') out.reviewStatus = status;
  const final = sub(attr, 'finalAction');
  if (typeof final === 'string') out.finalAction = final;
  const ref = (attr.decision as { object?: unknown } | undefined)?.object;
  if (typeof ref === 'string' && ref.startsWith('urn:ngsi-ld:Decision:')) out.decision = ref;
  return out;
}

/** Waits for a person: pending, with no person's answer yet, and a Decision entity to answer on. */
export const isWaiting = (r: ResultSummary | undefined): boolean =>
  r?.reviewStatus === 'pending' && r.finalAction === undefined && r.decision !== undefined;

/** One request for the board; null for anything that is not one of the demo's requests. */
export function toBoardRow(e: Entity): BoardRow | null {
  if (e.type !== REQUEST_TYPE || !isRequestId(e.id)) return null;
  const point = valueOf(e, 'location') as { type?: string; coordinates?: unknown } | undefined;
  const photos = valueOf(e, 'photos');
  const row: BoardRow = {
    id: e.id,
    createdAt: String(e.createdAt ?? ''),
    building: String((e.refBuilding as { object?: unknown } | undefined)?.object ?? ''),
    photos: Array.isArray(photos) ? photos.length : 0,
  };
  const c = point?.type === 'Point' && Array.isArray(point.coordinates) ? point.coordinates : [];
  // Numbers only: anything else would break the page's map layer.
  if (c.length === 2 && c.every((n) => typeof n === 'number' && Number.isFinite(n))) row.point = [c[0] as number, c[1] as number];
  const year = valueOf(e, 'yearOfConstruction');
  if (typeof year === 'number') row.year = year;
  const structure = valueOf(e, 'buildingStructureType');
  if (typeof structure === 'string') row.structure = structure;
  const storeys = valueOf(e, 'storeysAboveGround');
  if (typeof storeys === 'number') row.storeys = storeys;
  const description = valueOf(e, 'description');
  if (typeof description === 'string') row.description = description;
  const after = valueOf(e, 'afterDisaster');
  if (typeof after === 'string') row.afterDisaster = after;
  const language = valueOf(e, 'language');
  if (typeof language === 'string') row.language = language;
  const check = summaryOf(e, 'check');
  if (check) row.check = check;
  const concern = summaryOf(e, 'concern');
  if (concern) row.concern = concern;
  // The description's result is the later step: it counts once it is there.
  const last = concern ?? check;
  if (last) row.priority = last.finalAction ?? last.action;
  // The later step first: a person answers the description's result.
  if (isWaiting(concern)) row.waiting = 'concern';
  else if (isWaiting(check)) row.waiting = 'check';
  return row;
}

const rank = (a: string | undefined) => {
  const i = a === undefined ? -1 : PRIORITY_ORDER.indexOf(a);
  return i === -1 ? PRIORITY_ORDER.length : i;
};

/** Most serious first; within one priority, the oldest first (it has waited longest). */
export function sortBoard(rows: BoardRow[]): BoardRow[] {
  return rows.slice().sort((a, b) => rank(a.priority) - rank(b.priority) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** The action a person sent, checked against what this result allows; a message for the page otherwise. */
export function checkAnswer(row: BoardRow, body: unknown): { attribute: 'check' | 'concern'; action: string; decision: string } | string {
  if (!row.waiting) return 'this request does not wait for a person';
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'send an object with an action';
  const action = (body as { action?: unknown }).action;
  const allowed = PEOPLE_ANSWERS[row.waiting];
  if (typeof action !== 'string' || !allowed.includes(action)) return `action must be one of: ${allowed.join(', ')}`;
  return { attribute: row.waiting, action, decision: row[row.waiting]!.decision! };
}
