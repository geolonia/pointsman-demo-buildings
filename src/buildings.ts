// Buildings: PLATEAU footprints (data/plateau/, made by
// scripts/plateau/to_geojson.py) as NGSI-LD `Building` entities in the
// broker, and back to GeoJSON for the page.
//
// There is no `Building` model on datamodels.jp yet (planned once the demo
// runs with real data), so the attribute names are PLATEAU's (i-UR / CityGML),
// in the NGSI-LD core context: they expand to the default vocabulary. Unknown
// values are left out; the page shows them as unknown.

/** PLATEAU code lists (3D都市モデル標準製品仕様書, codelists/ in the CityGML zip). */
export const USAGE: Record<string, { ja: string; en: string }> = {
  '401': { ja: '業務施設', en: 'Offices' },
  '402': { ja: '商業施設', en: 'Shops' },
  '403': { ja: '宿泊施設', en: 'Hotel' },
  '404': { ja: '商業系複合施設', en: 'Mixed commercial' },
  '411': { ja: '住宅', en: 'House' },
  '412': { ja: '共同住宅', en: 'Apartments' },
  '413': { ja: '店舗等併用住宅', en: 'House with a shop' },
  '414': { ja: '店舗等併用共同住宅', en: 'Apartments with shops' },
  '415': { ja: '作業所併用住宅', en: 'House with a workshop' },
  '421': { ja: '官公庁施設', en: 'Public office' },
  '422': { ja: '文教厚生施設', en: 'School, hospital or welfare' },
  '431': { ja: '運輸倉庫施設', en: 'Transport or storage' },
  '441': { ja: '工場', en: 'Factory' },
  '451': { ja: '農林漁業用施設', en: 'Farming, forestry or fishing' },
  '452': { ja: '供給処理施設', en: 'Utilities' },
  '453': { ja: '防衛施設', en: 'Defence' },
  '454': { ja: 'その他', en: 'Other' },
};

export const STRUCTURE: Record<string, { ja: string; en: string; wood: boolean | null }> = {
  '601': { ja: '木造・土蔵造', en: 'Wood', wood: true },
  '602': { ja: '鉄骨鉄筋コンクリート造', en: 'Steel-reinforced concrete', wood: false },
  '603': { ja: '鉄筋コンクリート造', en: 'Reinforced concrete', wood: false },
  '604': { ja: '鉄骨造', en: 'Steel', wood: false },
  '605': { ja: '軽量鉄骨造', en: 'Light steel', wood: false },
  '606': { ja: 'レンガ造・コンクリートブロック造・石造', en: 'Brick, block or stone', wood: false },
  '610': { ja: '非木造', en: 'Not wood', wood: false },
  '612': { ja: '簡易耐火', en: 'Simple fire-resistant', wood: null },
  '613': { ja: '耐火', en: 'Fire-resistant', wood: null },
};

/** River flood depth ranks (RiverFloodingRiskAttribute_rank). */
export const FLOOD_RANK: Record<number, string> = {
  1: '0.5m未満', 2: '0.5m以上3m未満', 3: '3m以上5m未満', 4: '5m以上10m未満', 5: '10m以上20m未満', 6: '20m以上',
};

/** Rivers in Sapporo's model (RiverFloodingRiskAttribute_description). */
export const RIVER: Record<string, string> = {
  '1': '石狩川水系豊平川上流部', '2': '石狩川水系厚別川', '3': '新川水系琴似発寒川', '4': '新川水系琴似川',
  '5': '石狩川水系豊平川', '6': '石狩川水系月寒川', '7': '石狩川水系望月寒川', '8': '石狩川水系石狩川下流',
  '9': '石狩川水系野津幌川', '10': '新川水系新川', '11': '新川水系中の川', '12': '石狩川水系精進川', '13': '星置川水系星置川',
};

export const LANDSLIDE: Record<string, string> = { '1': '急傾斜地の崩落', '2': '土石流', '3': '地すべり' };

/** The credit PLATEAU's licence asks for (CC BY 4.0 compatible; say the data was edited). */
export const PLATEAU_SOURCE = '「3D都市モデル（Project PLATEAU）札幌市（2020年度）」（国土交通省）を加工して作成';

export type Polygon = { type: 'Polygon'; coordinates: [number, number][][] };

/** One building as scripts/plateau/to_geojson.py writes it. */
export interface PlateauFeature {
  type: 'Feature';
  geometry: Polygon;
  properties: {
    buildingID: string;
    class: string | null;
    usage: string | null;
    yearOfConstruction: number | null;
    measuredHeight: number | null;
    storeysAboveGround: number | null;
    storeysBelowGround: number | null;
    totalFloorArea: number | null;
    buildingStructureType: string | null;
    surveyYear: number | null;
    flood: { rank: number; depth: number; river: string | null; scale: string | null } | null;
    landslide: string[];
  };
}

export type Entity = { id: string; type: string; [attribute: string]: unknown };

const P = (value: unknown, extra: Record<string, unknown> = {}) => ({ type: 'Property', value, ...extra });

/** PLATEAU's building id, e.g. 01100-bldg-596589: municipality code, "bldg", serial number. */
const BUILDING_ID = /^\d{5}-bldg-\d+$/;

export const entityId = (buildingID: string) => `urn:ngsi-ld:Building:plateau:${buildingID}`;

/** A PLATEAU building as a normalized NGSI-LD entity; unknown values are left out. */
export function toEntity(f: PlateauFeature): Entity {
  const p = f.properties;
  if (!BUILDING_ID.test(p.buildingID)) throw new Error(`not a PLATEAU building id: ${p.buildingID}`);
  const e: Entity = {
    id: entityId(p.buildingID),
    type: 'Building',
    location: { type: 'GeoProperty', value: f.geometry },
    buildingID: P(p.buildingID),
    source: P(PLATEAU_SOURCE),
  };
  if (p.yearOfConstruction !== null) e.yearOfConstruction = P(p.yearOfConstruction);
  if (p.buildingStructureType !== null && STRUCTURE[p.buildingStructureType]) e.buildingStructureType = P(p.buildingStructureType);
  if (p.usage !== null && USAGE[p.usage]) e.usage = P(p.usage);
  if (p.storeysAboveGround !== null) e.storeysAboveGround = P(p.storeysAboveGround);
  if (p.storeysBelowGround !== null) e.storeysBelowGround = P(p.storeysBelowGround);
  if (p.measuredHeight !== null) e.measuredHeight = P(p.measuredHeight, { unitCode: 'MTR' });
  if (p.totalFloorArea !== null) e.totalFloorArea = P(p.totalFloorArea, { unitCode: 'MTK' });
  if (p.surveyYear !== null) e.surveyYear = P(p.surveyYear);
  if (p.flood) {
    e.riverFloodRisk = P({
      rank: p.flood.rank,
      depth: p.flood.depth,
      ...(p.flood.river && RIVER[p.flood.river] && { river: RIVER[p.flood.river] }),
      scale: p.flood.scale === '2' ? 'L2' : 'L1',
    });
  }
  if (p.landslide.length) e.landslideRisk = P(p.landslide.map((c) => LANDSLIDE[c] ?? c));
  return e;
}

/** What the page shows of one building. */
export interface BuildingProperties {
  id: string;
  buildingID: string;
  yearOfConstruction: number | null;
  /** Building code era for the map colour, by year built (see eraOf). */
  era: 'before-1981' | '1981-2000' | 'from-2000' | 'unknown';
  structure: string | null;
  wood: boolean | null;
  usage: string | null;
  storeys: number | null;
  height: number | null;
  flood: { rank: number; depth: number; river?: string; scale: string } | null;
  landslide: string[];
}

const value = (e: Entity, name: string): unknown => {
  const a = e[name];
  return a && typeof a === 'object' && 'value' in a ? (a as { value: unknown }).value : undefined;
};
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v : null);

/**
 * The era by year built (the building code changed in June 1981 and June
 * 2000). PLATEAU has the year only, so a building of 1981 or 2000 counts as
 * the older era: it may have been permitted before the change, and sorting
 * it too high is safer than too low. The permit date decides; Pointsman asks
 * for it.
 */
export function eraOf(year: number | null): BuildingProperties['era'] {
  if (year === null) return 'unknown';
  if (year <= 1981) return 'before-1981';
  if (year <= 2000) return '1981-2000';
  return 'from-2000';
}

/** A Building entity (normalized, core context) as a GeoJSON feature for the page. */
export function toFeature(e: Entity): { type: 'Feature'; id: string; geometry: unknown; properties: BuildingProperties } | null {
  const geometry = value(e, 'location') as Polygon | undefined;
  if (geometry?.type !== 'Polygon') return null;
  const year = num(value(e, 'yearOfConstruction'));
  const structure = str(value(e, 'buildingStructureType'));
  const flood = value(e, 'riverFloodRisk') as BuildingProperties['flood'] | undefined;
  const landslide = value(e, 'landslideRisk');
  return {
    type: 'Feature',
    id: e.id,
    geometry,
    properties: {
      id: e.id,
      buildingID: str(value(e, 'buildingID')) ?? '',
      yearOfConstruction: year,
      era: eraOf(year),
      structure,
      wood: structure ? (STRUCTURE[structure]?.wood ?? null) : null,
      usage: str(value(e, 'usage')),
      storeys: num(value(e, 'storeysAboveGround')),
      height: num(value(e, 'measuredHeight')),
      flood: flood && typeof flood === 'object' ? flood : null,
      landslide: Array.isArray(landslide) ? landslide.filter((s): s is string => typeof s === 'string') : [],
    },
  };
}
