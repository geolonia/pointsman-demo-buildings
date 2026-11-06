// PLATEAU buildings as NGSI-LD entities and back (src/buildings.ts), and the
// broker query (src/broker.ts).

import { describe, expect, it } from 'vitest';
import { entityId, eraOf, PLATEAU_SOURCE, toEntity, toFeature, type PlateauFeature } from '../src/buildings';
import { buildingsQuery } from '../src/broker';
import raw from '../data/plateau/satozuka.geojson?raw';

const sample = JSON.parse(raw) as { features: PlateauFeature[] };

const square = { type: 'Polygon' as const, coordinates: [[[141.45, 42.98], [141.4501, 42.98], [141.4501, 42.9801], [141.45, 42.9801], [141.45, 42.98]]] as [number, number][][] };

function feature(props: Partial<PlateauFeature['properties']> = {}): PlateauFeature {
  return {
    type: 'Feature',
    geometry: square,
    properties: {
      buildingID: '01100-bldg-596589', class: '3001', usage: '411', yearOfConstruction: 1981, measuredHeight: 8.3,
      storeysAboveGround: 2, storeysBelowGround: 0, totalFloorArea: 128, buildingStructureType: '601', surveyYear: 2019,
      flood: null, landslide: [], ...props,
    },
  };
}

describe('a PLATEAU building as an entity', () => {
  it('has PLATEAU\'s attribute names, units and the credit', () => {
    const e = toEntity(feature());
    expect(e.id).toBe('urn:ngsi-ld:Building:plateau:01100-bldg-596589');
    expect(e.type).toBe('Building');
    expect(e.location).toEqual({ type: 'GeoProperty', value: square });
    expect(e.yearOfConstruction).toEqual({ type: 'Property', value: 1981 });
    expect(e.buildingStructureType).toEqual({ type: 'Property', value: '601' });
    expect(e.measuredHeight).toEqual({ type: 'Property', value: 8.3, unitCode: 'MTR' });
    expect(e.totalFloorArea).toEqual({ type: 'Property', value: 128, unitCode: 'MTK' });
    expect(e.source).toEqual({ type: 'Property', value: PLATEAU_SOURCE });
  });

  it('leaves unknown values out (NGSI-LD has no null), also codes it does not know', () => {
    const e = toEntity(feature({ yearOfConstruction: null, usage: null, buildingStructureType: '999', measuredHeight: null }));
    for (const name of ['yearOfConstruction', 'usage', 'buildingStructureType', 'measuredHeight']) expect(e, name).not.toHaveProperty(name);
  });

  it('names the river and the scale of the flood risk, and the landslide zones', () => {
    const e = toEntity(feature({ flood: { rank: 2, depth: 1.914, river: '2', scale: '2' }, landslide: ['1'] }));
    expect(e.riverFloodRisk).toEqual({ type: 'Property', value: { rank: 2, depth: 1.914, river: '石狩川水系厚別川', scale: 'L2' } });
    expect(e.landslideRisk).toEqual({ type: 'Property', value: ['急傾斜地の崩落'] });
  });

  it('refuses an id that is not PLATEAU\'s (it becomes part of the entity id)', () => {
    expect(() => toEntity(feature({ buildingID: '../x' }))).toThrow(/not a PLATEAU building id/);
  });
});

describe('an entity as a feature for the page', () => {
  it('round-trips, with the era and whether it is wood', () => {
    const f = toFeature(toEntity(feature()))!;
    expect(f.id).toBe(entityId('01100-bldg-596589'));
    expect(f.properties).toMatchObject({ yearOfConstruction: 1981, era: 'before-1981', structure: '601', usage: '411', storeys: 2, height: 8.3, flood: null, landslide: [] });
  });

  it('shows unknown values as null', () => {
    const f = toFeature(toEntity(feature({ yearOfConstruction: null, buildingStructureType: null, usage: null, storeysAboveGround: null })))!;
    expect(f.properties).toMatchObject({ yearOfConstruction: null, era: 'unknown', structure: null, usage: null, storeys: null });
  });

  it('drops a flood value the page could not format, and an unknown scale', () => {
    const e = toEntity(feature({ flood: { rank: 1, depth: 0.4, river: null, scale: null } }));
    expect(e.riverFloodRisk).toEqual({ type: 'Property', value: { rank: 1, depth: 0.4 } });
    const broken = { ...e, riverFloodRisk: { type: 'Property', value: { rank: 'x', depth: 1 } } };
    expect(toFeature(broken)!.properties.flood).toBeNull();
  });

  it('skips an entity without a footprint', () => {
    expect(toFeature({ id: 'urn:x', type: 'Building' })).toBeNull();
  });
});

describe('eras', () => {
  it('count 1981 and 2000 as the older era: the permit date decides', () => {
    expect([1980, 1981, 1982, 2000, 2001, null].map(eraOf)).toEqual(['before-1981', 'before-1981', '1981-2000', '1981-2000', 'from-2000', 'unknown']);
  });
});

describe('the sample data', () => {
  it('has one entity per building, each with a footprint, and about 60% with a year', () => {
    const features = sample.features;
    const entities = features.map(toEntity);
    expect(new Set(entities.map((e) => e.id)).size).toBe(features.length);
    expect(entities.every((e) => toFeature(e) !== null)).toBe(true);
    const share = entities.filter((e) => 'yearOfConstruction' in e).length / entities.length;
    expect(share).toBeGreaterThan(0.5);
    expect(share).toBeLessThan(0.7);
  });
});

describe('the broker query', () => {
  it('asks for Buildings that touch the box', () => {
    const q = new URLSearchParams(buildingsQuery([141.4, 42.9, 141.5, 43.0]).split('?')[1]);
    expect(q.get('type')).toBe('Building');
    expect(q.get('georel')).toBe('intersects');
    expect(q.get('geoproperty')).toBe('location');
    expect(JSON.parse(q.get('coordinates')!)).toEqual([[[141.4, 42.9], [141.5, 42.9], [141.5, 43.0], [141.4, 43.0], [141.4, 42.9]]]);
  });
});
