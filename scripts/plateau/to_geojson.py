"""PLATEAU building CityGML (spec 4.x, EPSG:6697 lat/lon/height) to GeoJSON:
one footprint (LOD0) per building, with the attributes the demo uses.

Python standard library only. Run it with -I, on files you downloaded:

    python3 -I scripts/plateau/to_geojson.py data/plateau/satozuka.geojson 64413375_bldg_6697_op.gml 64413376_bldg_6697_op.gml

PLATEAU writes "unknown" as placeholder values (year 0001, storeys 9999,
height -9999, usage 461, structure 611); they become null here. Codes stay
codes; src/buildings.ts has their names. See data/plateau/README.md.
"""
import json
import sys
import xml.etree.ElementTree as ET

BLDG = '{http://www.opengis.net/citygml/building/2.0}'
GML = '{http://www.opengis.net/gml}'
UNKNOWN = {'', '0001', '9999', '-9999'}
UNKNOWN_CODES = {'usage': '461', 'buildingStructureType': '611', 'class': '9999'}
DETAIL = ('buildingID', 'buildingStructureType', 'totalFloorArea', 'surveyYear')


def text(el):
    v = (el.text or '').strip() if el is not None else ''
    return None if v in UNKNOWN else v


def number(v):
    return None if v is None else float(v) if '.' in v else int(v)


def ring(poslist):
    p = [float(n) for n in poslist.split()]
    return [[round(p[i + 1], 7), round(p[i], 7)] for i in range(0, len(p), 3)]  # lon, lat


def footprint(el):
    for tag in ('lod0RoofEdge', 'lod0FootPrint'):
        g = el.find(f'{BLDG}{tag}')
        pl = g.find(f'.//{GML}exterior//{GML}posList') if g is not None else None
        if pl is not None:
            return {'type': 'Polygon', 'coordinates': [ring(pl.text)]}
    return None


def risks(el):
    """The worst river flood (by depth, maximum assumed rainfall L2 first) and the landslide zones."""
    floods, landslides = [], []
    for r in el.iter():
        name = r.tag.split('}')[-1]
        values = {c.tag.split('}')[-1]: (c.text or '').strip() for c in r}
        if name == 'RiverFloodingRiskAttribute' and values.get('depth') not in (None, '', '-9999'):
            floods.append({'rank': int(values['rank']), 'depth': float(values['depth']), 'river': values.get('description'), 'scale': values.get('scale')})
        elif name == 'LandSlideRiskAttribute' and values.get('description'):
            landslides.append(values['description'])
    floods.sort(key=lambda f: (f['scale'] == '2', f['depth']), reverse=True)
    return (floods[0] if floods else None), sorted(set(landslides))


def main(out, paths):
    features, without = [], 0
    for path in paths:
        for _, el in ET.iterparse(path):
            if el.tag != BLDG + 'Building':
                continue
            geometry = footprint(el)
            if geometry is None:
                without += 1
                el.clear()
                continue
            p = {k: text(el.find(BLDG + k)) for k in ('class', 'usage', 'yearOfConstruction', 'measuredHeight', 'storeysAboveGround', 'storeysBelowGround')}
            for e in el.iter():
                n = e.tag.split('}')[-1]
                if n in DETAIL and n not in p:
                    p[n] = text(e)
            for k, code in UNKNOWN_CODES.items():
                if p.get(k) == code:
                    p[k] = None
            for k in ('yearOfConstruction', 'storeysAboveGround', 'storeysBelowGround', 'surveyYear'):
                p[k] = number(p.get(k))
            for k in ('measuredHeight', 'totalFloorArea'):
                p[k] = None if p.get(k) is None else float(p[k])
            p['flood'], p['landslide'] = risks(el)
            features.append({'type': 'Feature', 'geometry': geometry, 'properties': p})
            el.clear()
    features.sort(key=lambda f: f['properties']['buildingID'] or '')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': features}, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    print(len(features), 'buildings;', without, 'without a footprint (left out)')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
