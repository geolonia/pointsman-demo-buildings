# PLATEAU buildings

`satozuka.geojson`: 3,866 buildings in Kiyota-ku, Sapporo, around Satozuka
(PLATEAU 1 km meshes 64413375 and 64413376), one footprint (LOD0) each,
with the attributes the demo uses.

## Source and licence

「3D都市モデル（Project PLATEAU）札幌市（2020年度）」（国土交通省）を加工して作成.

- Dataset: [geospatial.jp, plateau-01100-sapporo-shi-2020](https://www.geospatial.jp/ckan/dataset/plateau-01100-sapporo-shi-2020),
  CityGML 2.0 (spec v4.1, issued 2025-03-21). The attributes were surveyed
  in 2019.
- Licence: [PLATEAU site policy](https://www.mlit.go.jp/plateau/site-policy/),
  compatible with CC BY 4.0. Commercial use is allowed. Credit the source and
  say that the data was edited. The demo shows this credit on the page and in
  every entity (`source`).
- Edits: footprints only (no 3D; the outer ring, so an inner courtyard is
  filled), coordinates rounded to 7 decimals,
  PLATEAU's "unknown" values turned into `null`, and per building only the
  worst river flood and the landslide zones.

## What is filled

About 58% of the buildings have a year built, structure, storeys and use;
the others are mostly sheds and buildings outside the urbanisation zone.
Height is filled for 99%. 264 buildings have a river flood risk; none has a
landslide zone. The demo uses the gaps: Pointsman asks for a missing value
instead of guessing.

## Making it again

No full download is needed: the CityGML zip (2.7 GB) allows HTTP range
requests, so single mesh files can be read from it (about 45 MB for these
two). Python standard library only; run with `-I`, in an empty folder:

```sh
ZIP=https://assets.cms.plateau.reearth.io/assets/be/3b8cfb-5459-4f9d-b08c-fb4ab72fbdbd/01100_sapporo-shi_city_2020_citygml_7_op.zip
mkdir -p /tmp/plateau
python3 -I scripts/plateau/rzip.py "$ZIP" get /tmp/plateau udx/bldg/64413375_bldg_6697_op.gml udx/bldg/64413376_bldg_6697_op.gml
python3 -I scripts/plateau/to_geojson.py data/plateau/satozuka.geojson /tmp/plateau/64413375_bldg_6697_op.gml /tmp/plateau/64413376_bldg_6697_op.gml
```

`rzip.py "$ZIP" list bldg` lists the mesh files. The code lists (names of
use, structure, flood rank and rivers) are in the zip's `codelists/`; the
demo has them in `src/buildings.ts`.
