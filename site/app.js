// The buildings demo page: the area's buildings from the data platform on a
// map, coloured by year built, and one building's data. Plain JavaScript, no
// build step. The request flow comes in a later step.
(function () {
  'use strict';

  var T = {
    en: {
      demo: 'buildings demo', devTitle: 'For developers', title: 'Every building, the same checks',
      lead: 'These are the buildings of one neighbourhood in Kiyota-ku, Sapporo, from the national 3D city model (PLATEAU). They live in GeonicDB, a FIWARE data platform, as Building entities. Soon you can send a request about one of them, step by step, and watch Pointsman sort it: what to check first, and why.',
      care: 'Pointsman sorts and explains. It never decides that a building is safe: that is always a person’s decision.',
      legendTitle: 'Year built', eraBefore: '1981 or earlier', eraMiddle: '1982 to 2000', eraAfter: '2001 or later', eraUnknown: 'Not known',
      pick: 'Pick a building on the map.', nextKicker: 'Coming next', nextTitle: 'Send a request, step by step',
      nextText: 'Pick the building, say what happened, add photos, check and send. Pointsman then gives a priority and a team, with the reason, and the request waits for a person if anything is unclear.',
      devLead: 'What the page asks the data platform (NGSI-LD), and what it gets back.', devList: 'All buildings in the area', devEntity: 'The selected building',
      lSource: 'Source of this demo', lPointsman: 'Pointsman', gsi: 'GSI map tiles',
      loading: 'Loading the buildings…', loaded: '{n} buildings. {k} of them without a year built.', failed: 'The buildings could not be loaded. Try again later.',
      building: 'Building', year: 'Year built', structure: 'Structure', usage: 'Use', storeys: 'Storeys above ground', height: 'Height',
      flood: 'River flood (worst case)', landslide: 'Landslide zone', unknown: 'not known', none: 'none', id: 'PLATEAU id',
      unknownNote: 'Some values are not in the city model. In a request, Pointsman asks for them instead of guessing.',
      floodValue: '{depth} m ({rank})', noMap: 'The map could not be loaded.', devFailed: 'The data platform did not answer.', eraNote1981: 'Built under the building code before June 1981, or in 1981 (the permit date decides).',
    },
    ja: {
      demo: '建物デモ', devTitle: '開発者向け', title: 'すべての建物を、同じ基準で',
      lead: '札幌市清田区の一地区の建物です。国の3D都市モデル（PLATEAU）のデータを、FIWARE のデータ基盤 GeonicDB に Building エンティティとして入れています。近いうちに、建物についての依頼を一歩ずつ送り、Pointsman がそれをどう仕分けるか（何を先に確認するか、なぜか）を見られるようになります。',
      care: 'Pointsman は仕分けて理由を示します。建物が安全かどうかは判断しません。それは常に人が決めます。',
      legendTitle: '建築年', eraBefore: '1981年以前', eraMiddle: '1982〜2000年', eraAfter: '2001年以降', eraUnknown: '不明',
      pick: '地図で建物を選んでください。', nextKicker: '次の段階', nextTitle: '依頼を一歩ずつ送る',
      nextText: '建物を選び、何があったかを書き、写真を添え、確認して送ります。Pointsman は優先度と担当チームを理由とともに返し、不明な点があれば人の確認に回します。',
      devLead: 'このページがデータ基盤に何を問い合わせ（NGSI-LD）、何が返ってくるか。', devList: 'この地区のすべての建物', devEntity: '選んだ建物',
      lSource: 'このデモのソース', lPointsman: 'Pointsman', gsi: '地理院タイル',
      loading: '建物を読み込んでいます…', loaded: '{n} 棟。そのうち {k} 棟は建築年が不明です。', failed: '建物を読み込めませんでした。しばらくしてからもう一度お試しください。',
      building: '建物', year: '建築年', structure: '構造', usage: '用途', storeys: '地上階数', height: '高さ',
      flood: '洪水（想定最大規模）', landslide: '土砂災害警戒区域', unknown: '不明', none: 'なし', id: 'PLATEAU ID',
      unknownNote: '3D都市モデルにない値があります。依頼では、Pointsman は推測せずにそれを尋ねます。',
      floodValue: '{depth} m（{rank}）', noMap: '地図を読み込めませんでした。', devFailed: 'データ基盤から応答がありませんでした。', eraNote1981: '1981年6月より前の基準、または1981年の建築です（確認の日付で決まります）。',
    },
  };
  // Names of PLATEAU's codes (as in src/buildings.ts).
  var USAGE = { '401': ['業務施設', 'Offices'], '402': ['商業施設', 'Shops'], '403': ['宿泊施設', 'Hotel'], '404': ['商業系複合施設', 'Mixed commercial'],
    '411': ['住宅', 'House'], '412': ['共同住宅', 'Apartments'], '413': ['店舗等併用住宅', 'House with a shop'], '414': ['店舗等併用共同住宅', 'Apartments with shops'],
    '415': ['作業所併用住宅', 'House with a workshop'], '421': ['官公庁施設', 'Public office'], '422': ['文教厚生施設', 'School, hospital or welfare'],
    '431': ['運輸倉庫施設', 'Transport or storage'], '441': ['工場', 'Factory'], '451': ['農林漁業用施設', 'Farming, forestry or fishing'],
    '452': ['供給処理施設', 'Utilities'], '453': ['防衛施設', 'Defence'], '454': ['その他', 'Other'] };
  var STRUCTURE = { '601': ['木造・土蔵造', 'Wood'], '602': ['鉄骨鉄筋コンクリート造', 'Steel-reinforced concrete'], '603': ['鉄筋コンクリート造', 'Reinforced concrete'],
    '604': ['鉄骨造', 'Steel'], '605': ['軽量鉄骨造', 'Light steel'], '606': ['レンガ造・コンクリートブロック造・石造', 'Brick, block or stone'],
    '610': ['非木造', 'Not wood'], '612': ['簡易耐火', 'Simple fire-resistant'], '613': ['耐火', 'Fire-resistant'] };
  var FLOOD_RANK = { 1: ['0.5m未満', 'below 0.5 m'], 2: ['0.5m以上3m未満', '0.5 to 3 m'], 3: ['3m以上5m未満', '3 to 5 m'], 4: ['5m以上10m未満', '5 to 10 m'], 5: ['10m以上20m未満', '10 to 20 m'], 6: ['20m以上', '20 m or more'] };
  var ERA_COLOUR = { 'before-1981': '#C8463A', '1981-2000': '#C98A1B', 'from-2000': '#2E9E6B', unknown: '#8f8a82' };

  // The visitor's choice, else the browser's language.
  var stored = null;
  try { stored = localStorage.getItem('lang'); } catch (e) {}
  var lang = stored === 'ja' || stored === 'en' ? stored : (navigator.language || '').indexOf('ja') === 0 ? 'ja' : 'en';
  var data = null;
  var selected = null;
  var map = null;

  function t(key, vars) {
    var s = (T[lang] && T[lang][key]) || T.en[key] || key;
    Object.keys(vars || {}).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) { if (c != null) e.append(c); });
    return e;
  }
  function name(table, code) { return table[code] ? table[code][lang === 'ja' ? 0 : 1] : null; }

  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (n) { n.textContent = t(n.dataset.i18n); });
    var b = document.getElementById('lang');
    b.textContent = lang === 'ja' ? 'English' : '日本語';
    b.lang = lang === 'ja' ? 'en' : 'ja';
    showStatus();
    showBuilding();
  }

  function showStatus() {
    var s = document.getElementById('status');
    if (data === null) s.textContent = t('loading');
    else if (data === false) s.textContent = t('failed');
    else s.textContent = t('loaded', { n: data.features.length, k: data.features.filter(function (f) { return f.properties.yearOfConstruction === null; }).length }) + (map ? '' : ' ' + t('noMap'));
  }

  function value(v) { return v === null || v === undefined ? el('span', { class: 'unknown' }, [t('unknown')]) : String(v); }

  function showBuilding() {
    var box = document.getElementById('building');
    var dev = document.getElementById('dev-entity');
    if (!selected) { box.replaceChildren(el('p', { class: 'muted' }, [t('pick')])); dev.textContent = ''; return; }
    var p = selected.feature.properties;
    var flood = p.flood ? t('floodValue', { depth: p.flood.depth.toFixed(1), rank: name(FLOOD_RANK, p.flood.rank) || p.flood.rank }) + (p.flood.river ? ' · ' + p.flood.river : '') : t('none');
    var rows = [
      [t('year'), value(p.yearOfConstruction)],
      [t('structure'), value(name(STRUCTURE, p.structure))],
      [t('usage'), value(name(USAGE, p.usage))],
      [t('storeys'), value(p.storeys)],
      [t('height'), p.height === null ? value(null) : p.height + ' m'],
      [t('flood'), flood],
      [t('landslide'), p.landslide.length ? p.landslide.join(', ') : t('none')],
      [t('id'), p.buildingID],
    ];
    var dl = el('dl');
    rows.forEach(function (r) { dl.append(el('dt', {}, [r[0]]), el('dd', {}, [r[1]])); });
    var missing = p.yearOfConstruction === null || p.structure === null || p.usage === null;
    box.replaceChildren.apply(box, [
      el('span', { class: 'kicker' }, [t('building')]),
      el('h2', {}, [(name(USAGE, p.usage) || t('building')) + (p.yearOfConstruction ? ' · ' + p.yearOfConstruction : '')]),
      dl,
      p.yearOfConstruction === 1981 ? el('p', { class: 'note' }, [t('eraNote1981')]) : null,
      missing ? el('p', { class: 'muted' }, [t('unknownNote')]) : null,
    ].filter(Boolean));
    dev.textContent = selected.entity ? 'GET /ngsi-ld/v1' + selected.query + '\n\n' + JSON.stringify(selected.entity, null, 2) : selected.failed ? t('devFailed') : '…';
  }

  function select(id) {
    var f = data && data.features.find(function (x) { return x.id === id; });
    if (!f) return;
    selected = { feature: f, entity: null, query: '', failed: false };
    if (map) map.setFilter('selected', ['==', ['get', 'id'], id]);
    showBuilding();
    fetch('/api/buildings/' + encodeURIComponent(id)).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (j) {
      if (!selected || selected.feature.id !== id) return;
      if (!j) selected.failed = true;
      else { selected.entity = j.entity; selected.query = j.query; }
      showBuilding();
    });
  }

  // The base map: GSI's optimised vector tiles in quiet colours of the theme,
  // so the buildings stand out.
  var PALETTE = {
    light: { bg: '#F2EEE6', water: '#D9E1E6', road: '#FFFFFF', label: '#7A756D', halo: '#F2EEE6', outline: '#171717' },
    dark: { bg: '#171717', water: '#1E2830', road: '#2A2A2A', label: '#9A958C', halo: '#171717', outline: '#F5F2EC' },
  };
  function theme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
  function style() {
    var c = PALETTE[theme()];
    return {
      version: 8,
      glyphs: 'https://gsi-cyberjapan.github.io/optimal_bvmap/glyphs/{fontstack}/{range}.pbf',
      sources: {
        gsi: {
          type: 'vector',
          tiles: [window.pmtiles
            ? 'pmtiles://https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/optimal_bvmap-v1.pmtiles/{z}/{x}/{y}'
            : 'https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf'],
          minzoom: 4, maxzoom: 16,
          attribution: '<a href="https://github.com/gsi-cyberjapan/optimal_bvmap">国土地理院最適化ベクトルタイル</a>',
        },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': c.bg } },
        { id: 'water', type: 'fill', source: 'gsi', 'source-layer': 'WA', paint: { 'fill-color': c.water } },
        { id: 'roads', type: 'line', source: 'gsi', 'source-layer': 'RdCL', layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': c.road, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0.5, 18, 8] } },
        { id: 'labels', type: 'symbol', source: 'gsi', 'source-layer': 'Anno', filter: ['==', ['geometry-type'], 'Point'],
          layout: { 'text-field': ['get', 'vt_text'], 'text-font': ['NotoSansJP-Regular'], 'text-size': 11, 'text-max-width': 8 },
          paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.4 } },
      ],
    };
  }
  function addBuildings(m) {
    if (!data || !data.features || m.getSource('buildings')) return;
    m.addSource('buildings', { type: 'geojson', data: data, promoteId: 'id' });
    var colour = ['match', ['get', 'era']];
    Object.keys(ERA_COLOUR).forEach(function (k) { colour.push(k, ERA_COLOUR[k]); });
    colour.push('#8f8a82');
    m.addLayer({ id: 'buildings', type: 'fill', source: 'buildings', paint: { 'fill-color': colour, 'fill-opacity': 0.85 } }, 'labels');
    m.addLayer({ id: 'selected', type: 'line', source: 'buildings', filter: ['==', ['get', 'id'], selected ? selected.feature.id : ''],
      paint: { 'line-color': PALETTE[theme()].outline, 'line-width': 2.5 } }, 'labels');
    m.on('click', 'buildings', function (e) { if (e.features && e.features[0]) select(e.features[0].properties.id); });
    m.on('mouseenter', 'buildings', function () { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'buildings', function () { m.getCanvas().style.cursor = ''; });
  }

  function makeMap(area) {
    if (!window.maplibregl) return null;
    if (window.pmtiles) maplibregl.addProtocol('pmtiles', new pmtiles.Protocol().tile);
    var m;
    // No WebGL, or a broken style: the page goes on without a map (the status line says so).
    try {
      m = new maplibregl.Map({ container: 'map', style: style(), bounds: [[area[0], area[1]], [area[2], area[3]]], fitBoundsOptions: { padding: 20 },
        attributionControl: { compact: true, customAttribution: 'PLATEAU（国土交通省）' }, cooperativeGestures: true });
    } catch (e) {
      return null;
    }
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // Fit again once the map has its final size (the first fit can come before the layout).
    m.on('load', function () {
      m.resize();
      m.fitBounds([[area[0], area[1]], [area[2], area[3]]], { padding: 20, animate: false });
      addBuildings(m);
    });
    return m;
  }

  // Header buttons.
  document.getElementById('lang').addEventListener('click', function () {
    lang = lang === 'ja' ? 'en' : 'ja';
    try { localStorage.setItem('lang', lang); } catch (e) {}
    applyLang();
  });
  document.getElementById('theme').addEventListener('click', function () {
    var next = theme() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    if (map) map.setStyle(style(), { diff: false });
    if (map) map.once('styledata', function () { addBuildings(map); });
  });
  var devButton = document.getElementById('dev-toggle');
  function setDev(on) {
    document.getElementById('dev').hidden = !on;
    document.querySelector('.layout').classList.toggle('with-dev', on);
    devButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (map) setTimeout(function () { map.resize(); }, 0);
  }
  devButton.addEventListener('click', function () {
    var on = devButton.getAttribute('aria-pressed') !== 'true';
    try { localStorage.setItem('dev', on ? '1' : '0'); } catch (e) {}
    setDev(on);
  });
  try { setDev(localStorage.getItem('dev') === '1'); } catch (e) {}

  // The area, also when /api/config does not answer (as in src/index.ts).
  var AREA = [141.4370, 42.9745, 141.4630, 42.9840];
  applyLang();
  fetch('/api/config').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (config) {
    map = makeMap(config && Array.isArray(config.area) ? config.area : AREA);
    return fetch('/api/buildings');
  }).then(function (r) {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }).then(function (j) {
    data = j;
    document.getElementById('dev-list').textContent = 'GET /ngsi-ld/v1' + j.query + '&limit=1000&offset=0\n\n→ ' + j.features.length + ' Building entities';
    showStatus();
    // Whichever comes last adds the layer: the data here, or the map's load event.
    if (map && map.isStyleLoaded()) addBuildings(map);
    else if (map) map.once('idle', function () { addBuildings(map); });
  }).catch(function () {
    data = false;
    showStatus();
  });
})();
