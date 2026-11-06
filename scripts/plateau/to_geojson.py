"""PLATEAU building CityGML (spec 4.x, EPSG:6697 lat/lon/height) to GeoJSON:
one footprint (LOD0) per building, with the attributes the demo uses.

Python standard library only. Run it with -I, on files you downloaded:

    python3 -I scripts/plateau/to_geojson.py data/plateau/satozuka.geojson 64413375_bldg_6697_op.gml 64413376_bldg_6697_op.gml

PLATEAU writes "unknown" as placeholder values (year 0001, storeys 9999,
height -9999, usage 461, structure 611); they become null here. Codes stay
codes; src/buildings.ts has their names. See data/plateau/README.md.
"""
import json
import math
import sys
import xml.etree.ElementTree as ET

BLDG = '{http://www.opengis.net/citygml/building/2.0}'
GML = '{http://www.opengis.net/gml}'
UNKNOWN = {'', '0001', '9999', '-9999'}
UNKNOWN_CODES = {'usage': '461', 'buildingStructureType': '611', 'class': '9999'}
DETAIL = ('buildingID', 'buildingStructureType', 'totalFloorArea', 'surveyYear')
# Buildings whose outline GeonicDB refuses as self-intersecting although it
# is not (short segments on rounded corners; checked 2026-11-06): simplified
# more, in metres. Default: 0.1.
TOLERANCE_M = {
    '01100-bldg-596900': 0.5,
    '01100-bldg-597660': 0.5,
    '01100-bldg-598149': 0.5,
    '01100-bldg-598150': 0.5,
    '01100-bldg-598316': 0.5,
    '01100-bldg-598403': 1.0,
    '01100-bldg-598451': 0.5,
    '01100-bldg-598452': 0.5,
    '01100-bldg-599246': 0.5,
    '01100-bldg-599831': 0.5,
    '01100-bldg-600005': 0.5,
    '01100-bldg-600095': 0.5,
    '01100-bldg-600150': 0.5,
    '01100-bldg-602553': 0.5,
}


def text(el):
    v = (el.text or '').strip() if el is not None else ''
    return None if v in UNKNOWN else v


def number(v):
    return None if v is None else float(v) if '.' in v else int(v)


def ring(poslist):
    p = [float(n) for n in poslist.split()]
    return [[round(p[i + 1], 7), round(p[i], 7)] for i in range(0, len(p), 3)]  # lon, lat


def simplify(ring, tol_m=0.1):
    """Drops vertices less than tol_m off the line between their neighbours
    (points along a curved wall), keeping at least a triangle. GeonicDB's
    polygon check refuses some rings with many almost collinear points as
    self-intersecting although they are not (01100-bldg-595416); without
    them it accepts them. 10 cm changes nothing on the map."""
    pts = ring[:-1]
    lat0 = math.radians(sum(p[1] for p in pts) / len(pts))
    mx, my = 111320 * math.cos(lat0), 110540  # metres per degree

    def off(a, b, c):
        ax, ay, bx, by, cx, cy = a[0] * mx, a[1] * my, b[0] * mx, b[1] * my, c[0] * mx, c[1] * my
        d = math.hypot(cx - ax, cy - ay)
        return math.hypot(bx - ax, by - ay) if d == 0 else abs((cx - ax) * (ay - by) - (ax - bx) * (cy - ay)) / d

    while len(pts) > 3:
        i = min(range(len(pts)), key=lambda k: off(pts[k - 1], pts[k], pts[(k + 1) % len(pts)]))
        if off(pts[i - 1], pts[i], pts[(i + 1) % len(pts)]) >= tol_m:
            break
        del pts[i]
    return pts + [pts[0]]


def footprint(el, tol_m):
    for tag in ('lod0RoofEdge', 'lod0FootPrint'):
        g = el.find(f'{BLDG}{tag}')
        pl = g.find(f'.//{GML}exterior//{GML}posList') if g is not None else None
        if pl is not None:
            return {'type': 'Polygon', 'coordinates': [simplify(ring(pl.text), tol_m)]}
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
            p = {k: text(el.find(BLDG + k)) for k in ('class', 'usage', 'yearOfConstruction', 'measuredHeight', 'storeysAboveGround', 'storeysBelowGround')}
            for e in el.iter():
                n = e.tag.split('}')[-1]
                if n in DETAIL and n not in p:
                    p[n] = text(e)
            geometry = footprint(el, TOLERANCE_M.get(p.get('buildingID'), 0.1))
            if geometry is None:
                without += 1
                el.clear()
                continue
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
