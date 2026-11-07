// The buildings demo page: the area's buildings from the data platform on a
// map, coloured by year built, one building's data, and a check request in
// four steps: building, missing details, check and send, result. Plain
// JavaScript, no build step.
(function () {
  'use strict';

  var T = {
    en: {
      demo: 'buildings demo', devTitle: 'For developers', title: 'Every building, the same checks',
      lead: 'These are the buildings of one neighbourhood in Kiyota-ku, Sapporo, from the national 3D city model (PLATEAU). They live in GeonicDB, a FIWARE data platform, as Building entities. Pick one, ask how urgent a seismic check is, and watch Pointsman sort the request: what to check first, and why.',
      care: 'Pointsman sorts and explains. It never decides that a building is safe: that is always a person’s decision.',
      legendTitle: 'Year built', eraBefore: '1981 or earlier', eraMiddle: '1982 to 2000', eraAfter: '2001 or later', eraUnknown: 'Not known',
      pick: 'Pick a building on the map.',
      devLead: 'What the page asks the data platform (NGSI-LD), and what it gets back.', devList: 'All buildings in the area', devEntity: 'The selected building',
      lSource: 'Source of this demo', lPointsman: 'Pointsman', gsi: 'GSI map tiles',
      loading: 'Loading the buildings…', loaded: '{n} buildings. {k} of them without a year built.', failed: 'The buildings could not be loaded. Try again later.',
      building: 'Building', year: 'Year built', structure: 'Structure', usage: 'Use', storeys: 'Storeys above ground', height: 'Height',
      flood: 'River flood (worst case)', landslide: 'Landslide zone', unknown: 'not known', none: 'none', id: 'PLATEAU id',
      unknownNote: 'Some values are not in the city model. In a request, Pointsman asks for them instead of guessing.',
      checkThis: 'Check this building', checksClosed: 'Checks are not open yet.',
      s1: 'Building', s2: 'Details', s3: 'Check and send', s4: 'Result',
      t2: 'What the city model does not know', t3: 'Check and send', t4: 'How urgent is a seismic check?',
      dontKnow: 'I do not know', woodQ: 'Is it a wooden building?', yes: 'Yes', no: 'No', yearQ: 'Year built', storeysQ: 'Storeys above ground',
      allKnown: 'The city model knows everything the check needs.', next: 'Next', back: 'Back', send: 'Send', again: 'Check another building',
      fromModel: 'city model', fromYou: 'you', sendNote: 'This is a demo: nothing goes to the city, and the request is deleted after a day. Pointsman sorts and explains; whether a building is safe is always a person\u2019s decision.',
      sending: 'Sending…', waiting: 'Pointsman is sorting the request…', slow: 'This takes longer than usual. The result appears here as soon as it is there.', steps: 'Steps', emptyIsUnknown: 'leave it empty', outOfRange: 'Enter a whole number from {min} to {max}, or leave it empty.',
      e_busy: 'The demo is busy, or has had enough requests for today. Try again later.', e_closed: 'Checks are not open yet.', e_building: 'This building could not be sent.', e_other: 'The request could not be sent. Try again later.',
      e_lost: 'The request is no longer there (requests are deleted after a day).', gaveUp: 'No result yet. The demo tries again every hour; you can also look again later.', lookAgain: 'Look again',
      wood: 'Wood', notWood: 'Not wood',
      a_high: 'High: a seismic check should come first', a_medium: 'Medium', a_low: 'Low', 'a_more-evidence': 'More information needed',
      n_high: 'Staff confirm this priority. A wooden house begun on or before 31 May 1981 may get Sapporo\u2019s free seismic check.',
      n_medium: 'A check is worth planning, but other buildings come first.',
      n_low: 'No reason for an early check was found in the data.',
      'n_more-evidence': 'The year built or the structure is missing. They are on the building certificate (登記事項証明書) or the building permit (確認済証).',
      why: 'Why', r0: 'The year built or the structure is not known.', r1: 'Wooden, and built under the building code before June 1981 (or in 1981).', r2: 'Built under the building code before June 1981 (or in 1981).',
      r3: 'Wooden and built before the 2000 code, on soft ground or where strong shaking is more likely.', r4: 'In a river flood zone of 3 m or deeper.', rd: 'None of the rules for an earlier check applied.',
      devRequest: 'The check request', devDecision: 'Pointsman\u2019s decision (Decision entity)',
      floodValue: '{depth} m ({rank})', noMap: 'The map could not be loaded.', partial: 'Not all buildings could be loaded.', devFailed: 'The data platform did not answer.', eraNote1981: 'Built under the building code before June 1981, or in 1981 (the permit date decides).',
    },
    ja: {
      demo: '建物デモ', devTitle: '開発者向け', title: 'すべての建物を、同じ基準で',
      lead: '札幌市清田区の一地区の建物です。国の3D都市モデル（PLATEAU）のデータを、FIWARE のデータ基盤 GeonicDB に Building エンティティとして入れています。建物を選んで耐震の確認がどれだけ急ぎかを尋ね、Pointsman がその依頼をどう仕分けるか（何を先に確認するか、なぜか）を見てください。',
      care: 'Pointsman は仕分けて理由を示します。建物が安全かどうかは判断しません。それは常に人が決めます。',
      legendTitle: '建築年', eraBefore: '1981年以前', eraMiddle: '1982〜2000年', eraAfter: '2001年以降', eraUnknown: '不明',
      pick: '地図で建物を選んでください。',
      devLead: 'このページがデータ基盤に何を問い合わせ（NGSI-LD）、何が返ってくるか。', devList: 'この地区のすべての建物', devEntity: '選んだ建物',
      lSource: 'このデモのソース', lPointsman: 'Pointsman', gsi: '地理院タイル',
      loading: '建物を読み込んでいます…', loaded: '{n} 棟。そのうち {k} 棟は建築年が不明です。', failed: '建物を読み込めませんでした。しばらくしてからもう一度お試しください。',
      building: '建物', year: '建築年', structure: '構造', usage: '用途', storeys: '地上階数', height: '高さ',
      flood: '洪水（想定最大規模）', landslide: '土砂災害警戒区域', unknown: '不明', none: 'なし', id: 'PLATEAU ID',
      unknownNote: '3D都市モデルにない値があります。依頼では、Pointsman は推測せずにそれを尋ねます。',
      checkThis: 'この建物を確認する', checksClosed: '確認はまだ受け付けていません。',
      s1: '建物', s2: '詳細', s3: '確認して送信', s4: '結果',
      t2: '3D都市モデルにない情報', t3: '確認して送信', t4: '耐震の確認はどれだけ急ぎか',
      dontKnow: 'わからない', woodQ: '木造の建物ですか', yes: 'はい', no: 'いいえ', yearQ: '建築年', storeysQ: '地上階数',
      allKnown: '確認に必要な情報は、3D都市モデルにすべてあります。', next: '次へ', back: '戻る', send: '送信', again: 'ほかの建物を確認する',
      fromModel: '3D都市モデル', fromYou: 'あなた', sendNote: 'これはデモです。市には何も届かず、依頼は1日で削除されます。Pointsman は仕分けて理由を示します。建物が安全かどうかは常に人が決めます。',
      sending: '送信しています…', waiting: 'Pointsman が依頼を仕分けています…', slow: 'いつもより時間がかかっています。結果が出しだい、ここに表示します。', steps: '手順', emptyIsUnknown: '空欄のまま', outOfRange: '{min}から{max}までの整数を入れるか、空欄のままにしてください。',
      e_busy: 'デモが混み合っているか、今日の受付数に達しました。時間をおいてお試しください。', e_closed: '確認はまだ受け付けていません。', e_building: 'この建物は送れませんでした。', e_other: '依頼を送れませんでした。時間をおいてお試しください。',
      e_lost: '依頼はもうありません（依頼は1日で削除されます）。', gaveUp: 'まだ結果がありません。デモは1時間ごとにやり直します。あとでもう一度ご覧ください。', lookAgain: 'もう一度見る',
      wood: '木造', notWood: '非木造',
      a_high: '高：耐震の確認を先に', a_medium: '中', a_low: '低', 'a_more-evidence': '情報が足りません',
      n_high: '職員がこの優先度を確認します。1981年5月31日以前に着工した木造住宅は、札幌市の無料の耐震診断を受けられることがあります。',
      n_medium: '確認を計画する価値はありますが、ほかの建物が先です。',
      n_low: 'データからは、早めの確認が必要な理由は見つかりませんでした。',
      'n_more-evidence': '建築年か構造が足りません。登記事項証明書や確認済証に書かれています。',
      why: '理由', r0: '建築年か構造がわかりません。', r1: '木造で、1981年6月より前の基準（または1981年）で建てられています。', r2: '1981年6月より前の基準（または1981年）で建てられています。',
      r3: '2000年の基準より前の木造で、揺れやすい地盤か、強い揺れの起きやすい場所にあります。', r4: '想定最大規模で3 m以上浸水する区域にあります。', rd: '早めの確認につながる条件には当てはまりませんでした。',
      devRequest: '確認の依頼', devDecision: 'Pointsman の判断（Decision エンティティ）',
      floodValue: '{depth} m（{rank}）', noMap: '地図を読み込めませんでした。', partial: 'すべての建物は読み込めませんでした。', devFailed: 'データ基盤から応答がありませんでした。', eraNote1981: '1981年6月より前の基準、または1981年の建築です（確認の日付で決まります）。',
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
  var PLATEAU_URN = 'urn:ngsi-ld:Building:plateau:';
  var zoomTo = null;
  /** The buildings layer is on the map and drawn once. */
  var drawn = false;
  var selected = null;
  var map = null;
  /** Whether the Worker accepts check requests (/api/config `checks`). */
  var checksOpen = false;
  /** The request flow: step 1 to 4, the answers, the sent request and its result. */
  var flow = null;

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
    document.querySelectorAll('[data-i18n-label]').forEach(function (n) { n.setAttribute('aria-label', t(n.dataset.i18nLabel)); });
    var b = document.getElementById('lang');
    b.textContent = lang === 'ja' ? 'English' : '日本語';
    b.lang = lang === 'ja' ? 'en' : 'ja';
    showStatus();
    showBuilding();
    showFlow();
  }

  /** The note over the map: until the buildings are drawn, or the load failed (the status line says why). */
  function showLoading() {
    document.getElementById('map-loading').hidden = data === false || (data !== null && (drawn || !map));
  }

  function showStatus() {
    showLoading();
    var s = document.getElementById('status');
    if (data === null) s.textContent = t('loading');
    else if (data === false) s.textContent = t('failed');
    else s.textContent = t('loaded', { n: data.features.length, k: data.features.filter(function (f) { return f.properties.yearOfConstruction === null; }).length }) + (data.complete === false || data.skipped > 0 ? ' ' + t('partial') : '') + (map ? '' : ' ' + t('noMap'));
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
      checksOpen ? button(t('checkThis'), startFlow, 'btn') : el('p', { class: 'muted' }, [t('checksClosed')]),
    ].filter(Boolean));
    dev.textContent = selected.entity ? 'GET /ngsi-ld/v1' + selected.query + '\n\n' + JSON.stringify(selected.entity, null, 2) : selected.failed ? t('devFailed') : '…';
  }

  function button(label, onClick, cls) {
    var b = el('button', { type: 'button', class: cls || 'btn ghost' }, [label]);
    b.addEventListener('click', onClick);
    return b;
  }

  // --- The request flow ------------------------------------------------------

  var THIS_YEAR = new Date().getFullYear();

  function startFlow() {
    if (!selected) return;
    var p = selected.feature.properties;
    flow = { step: 2, building: selected.feature, answers: {}, known: { year: p.yearOfConstruction !== null, structure: !!(p.structure && STRUCTURE[p.structure]), storeys: p.storeys !== null } };
    showFlow();
    document.getElementById('flow').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function stepTo(n) { flow.step = n; showFlow(); }

  /** A number input with "I do not know"; the answer is a whole number in range, or unknown. */
  function numberField(key, label, min, max) {
    var input = el('input', { type: 'number', min: String(min), max: String(max), step: '1', inputmode: 'numeric', id: 'q-' + key });
    if (typeof flow.answers[key] === 'number') input.value = String(flow.answers[key]);
    var error = el('p', { class: 'field-error', id: 'q-' + key + '-error', hidden: '' }, [t('outOfRange', { min: min, max: max })]);
    var check = function () {
      var n = Number(input.value);
      var ok = input.value === '' && input.validity.valid;
      if (input.value !== '' && Number.isInteger(n) && n >= min && n <= max) { flow.answers[key] = n; ok = true; }
      else delete flow.answers[key];
      if (ok) { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); error.hidden = true; }
      else { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', error.id); error.hidden = false; }
    };
    input.addEventListener('input', check);
    input.addEventListener('change', check);
    return el('div', { class: 'field' }, [el('label', { for: 'q-' + key }, [label]), input, el('span', { class: 'muted' }, [' ' + t('dontKnow') + ': ' + t('emptyIsUnknown')]), error]);
  }

  function woodField() {
    var box = el('fieldset', { class: 'field' }, [el('legend', {}, [t('woodQ')])]);
    [['true', t('yes')], ['false', t('no')], ['', t('dontKnow')]].forEach(function (o) {
      var id = 'q-wood-' + (o[0] || 'x');
      var input = el('input', { type: 'radio', name: 'wood', id: id, value: o[0] });
      var current = flow.answers.wood === undefined ? '' : String(flow.answers.wood);
      if (current === o[0]) input.checked = true;
      input.addEventListener('change', function () { if (o[0] === '') delete flow.answers.wood; else flow.answers.wood = o[0] === 'true'; });
      box.append(el('label', { for: id, class: 'choice' }, [input, ' ' + o[1]]));
    });
    return box;
  }

  function summaryRows() {
    var p = flow.building.properties;
    var origin = function (fromModel) { return el('span', { class: 'tag' }, [fromModel ? t('fromModel') : t('fromYou')]); };
    var row = function (label, known, shown, answered) {
      return [label, known ? [shown, ' ', origin(true)] : answered === undefined ? [value(null)] : [String(answered), ' ', origin(false)]];
    };
    return [
      row(t('year'), flow.known.year, String(p.yearOfConstruction), flow.answers.yearOfConstruction),
      row(t('structure'), flow.known.structure, name(STRUCTURE, p.structure), flow.answers.wood === undefined ? undefined : flow.answers.wood ? t('wood') : t('notWood')),
      row(t('storeys'), flow.known.storeys, String(p.storeys), flow.answers.storeysAboveGround),
    ];
  }

  function showFlow() {
    var section = document.getElementById('flow');
    if (!flow) { section.hidden = true; return; }
    section.hidden = false;
    section.querySelectorAll('.steps li').forEach(function (li) {
      var n = Number(li.dataset.step);
      li.className = n < flow.step ? 'done' : n === flow.step ? 'current' : '';
      if (n === flow.step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    var title = document.getElementById('flow-title');
    var body = document.getElementById('flow-body');
    if (flow.step === 2) {
      title.textContent = t('t2');
      var fields = [];
      if (!flow.known.year) fields.push(numberField('yearOfConstruction', t('yearQ'), 1868, THIS_YEAR));
      if (!flow.known.structure) fields.push(woodField());
      if (!flow.known.storeys) fields.push(numberField('storeysAboveGround', t('storeysQ'), 1, 99));
      body.replaceChildren.apply(body, (fields.length ? fields : [el('p', {}, [t('allKnown')])]).concat([
        el('div', { class: 'actions' }, [button(t('next'), function () { var bad = body.querySelector('[aria-invalid="true"]'); if (bad) { bad.focus(); return; } stepTo(3); }, 'btn')]),
      ]));
    } else if (flow.step === 3) {
      title.textContent = t('t3');
      var dl = el('dl');
      summaryRows().forEach(function (r) { dl.append(el('dt', {}, [r[0]]), el('dd', {}, r[1])); });
      body.replaceChildren(dl, el('p', { class: 'note' }, [t('sendNote')]), el('div', { class: 'actions' }, [button(t('back'), function () { stepTo(2); }), button(t('send'), send, 'btn')]));
    } else {
      title.textContent = t('t4');
      body.replaceChildren.apply(body, resultView());
    }
  }

  /** The page's own words for a failed send (the server's are English only). */
  function sendError(status) {
    if (status === 429) return 'e_busy';
    if (status === 503) return 'e_closed';
    if (status === 400 || status === 404) return 'e_building';
    return 'e_other';
  }

  function send() {
    // This flow only: the visitor may start another one before the answer comes.
    var f = flow;
    f.step = 4;
    f.state = 'sending';
    showFlow();
    fetch('/api/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ building: f.building.id, answers: f.answers, lang: lang }) })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (j) {
          if (!r.ok || !j || typeof j.id !== 'string') throw { key: sendError(r.ok ? 0 : r.status) };
          return j;
        });
      })
      .then(function (j) {
        if (flow !== f) return;
        f.requestId = j.id; f.state = 'waiting'; f.sentAt = Date.now(); showFlow(); poll(f, j.id);
      })
      .catch(function (e) {
        if (flow !== f) return;
        f.state = 'failed'; f.error = e && e.key ? e.key : 'e_other'; showFlow();
      });
  }

  var SLOW_MS = 30000;
  var GIVE_UP_MS = 15 * 60000;
  /**
   * Every 2 s until the result is there; after 30 s the page says it takes
   * longer and asks every 10 s; after 15 min it stops and offers to look
   * again. A request that is gone (404) ends the wait.
   */
  function poll(f, id) {
    if (flow !== f || f.requestId !== id) return;
    fetch('/api/requests/' + encodeURIComponent(id))
      .then(function (r) { return r.ok ? r.json().then(function (j) { return { j: j }; }) : { status: r.status }; })
      .catch(function () { return {}; })
      .then(function (res) {
        if (flow !== f || f.requestId !== id) return;
        var j = res.j;
        if (j) { f.request = j.entity; f.decision = j.decision; f.query = j.query; showDev(); }
        if (j && j.entity && j.entity.check && typeof j.entity.check.value === 'string') { f.state = 'done'; showFlow(); return; }
        if (res.status === 404 || res.status === 400) { f.state = 'failed'; f.error = 'e_lost'; showFlow(); return; }
        var waited = Date.now() - f.sentAt;
        if (waited > GIVE_UP_MS) { f.state = 'gaveUp'; showFlow(); return; }
        if (waited > SLOW_MS && f.state !== 'slow') { f.state = 'slow'; showFlow(); }
        setTimeout(function () { poll(f, id); }, waited > SLOW_MS ? 10000 : 2000);
      });
  }

  function resultView() {
    var again = el('div', { class: 'actions' }, [button(t('again'), function () { flow = null; showFlow(); showDev(); window.scrollTo({ top: 0, behavior: 'smooth' }); })]);
    if (flow.state === 'sending') return [el('p', { class: 'muted' }, [t('sending')])];
    if (flow.state === 'failed') {
      // Back to the answers, kept, unless the request was sent and is gone.
      var back = flow.error === 'e_lost' ? [] : [button(t('back'), function () { stepTo(3); })];
      return [el('p', { class: 'note' }, [t(flow.error)]), el('div', { class: 'actions' }, back.concat(again.firstChild))];
    }
    if (flow.state === 'gaveUp') {
      var f = flow;
      return [el('p', { class: 'note' }, [t('gaveUp')]), el('div', { class: 'actions' }, [button(t('lookAgain'), function () { f.sentAt = Date.now() - SLOW_MS - 1; f.state = 'slow'; showFlow(); poll(f, f.requestId); }), again.firstChild])];
    }
    if (flow.state !== 'done') return [el('p', { class: 'muted' }, [t(flow.state === 'slow' ? 'slow' : 'waiting')])];
    var check = flow.request.check;
    var action = check.value;
    // The rule's index as the bridge writes it ("0" to "4"), or "default" (building-check-priority v1).
    var rule = check.policyRule && /^[0-4]$/.test(String(check.policyRule.value)) ? 'r' + check.policyRule.value : 'rd';
    return [
      el('p', { class: 'verdict v-' + action }, [t('a_' + action)]),
      el('p', {}, [t('n_' + action)]),
      el('p', {}, [el('strong', {}, [t('why') + ': ']), t(rule)]),
      el('p', { class: 'note' }, [t('care')]),
      again,
    ];
  }

  function showDev() {
    var req = document.getElementById('dev-request');
    var dec = document.getElementById('dev-decision');
    req.textContent = flow && flow.request ? 'GET /ngsi-ld/v1' + flow.query + '\n\n' + JSON.stringify(flow.request, null, 2) : '';
    dec.textContent = flow && flow.decision ? JSON.stringify(flow.decision, null, 2) : '';
  }

  function select(id) {
    var f = data && data.features.find(function (x) { return x.id === id; });
    if (!f) return;
    // A flow belongs to one building: another pick ends it.
    if (flow && flow.building.id !== id) { flow = null; showFlow(); showDev(); }
    selected = { feature: f, entity: null, query: '', failed: false };
    // A link to this building: the address shows it, and opens it again.
    try { history.replaceState(null, '', '#' + encodeURIComponent(id.replace(PLATEAU_URN, ''))); } catch (e) { /* not in every frame */ }
    // Before the layer exists, addBuildings applies the filter.
    if (map && map.getLayer('selected')) map.setFilter('selected', ['==', ['get', 'id'], id]);
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
    if (!drawn) m.once('idle', function () { drawn = true; showLoading(); });
    m.addLayer({ id: 'selected', type: 'line', source: 'buildings', filter: ['==', ['get', 'id'], selected ? selected.feature.id : ''],
      paint: { 'line-color': PALETTE[theme()].outline, 'line-width': 2.5 } }, 'labels');
    // A linked building: shown close up once the map has its first view.
    if (zoomTo) { m.jumpTo({ center: zoomTo, zoom: 17 }); zoomTo = null; }
    m.on('click', 'buildings', function (e) { if (e.features && e.features[0]) select(e.features[0].properties.id); });
    m.on('mouseenter', 'buildings', function () { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'buildings', function () { m.getCanvas().style.cursor = ''; });
  }

  /**
   * The legend as a MapLibre control: the element from the page (its texts
   * follow the language, its colours the theme), moved into the map's
   * bottom-left corner. Without a map it stays hidden.
   */
  function legendControl() {
    var node = document.getElementById('legend');
    return {
      onAdd: function () { node.classList.add('maplibregl-ctrl'); node.hidden = false; return node; },
      onRemove: function () { node.hidden = true; node.remove(); },
    };
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
    m.addControl(legendControl(), 'bottom-left');
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
    checksOpen = !!(config && config.checks);
    showBuilding();
    map = makeMap(config && Array.isArray(config.area) ? config.area : AREA);
    return fetch('/api/buildings');
  }).then(function (r) {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }).then(function (j) {
    data = j;
    document.getElementById('dev-list').textContent = 'GET /ngsi-ld/v1' + j.query + '&limit=1000&offset=0\n\n→ ' + j.features.length + ' Building entities';
    showStatus();
    var linked = (function () { try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ''; } })();
    if (linked) {
      select(linked.indexOf('urn:') === 0 ? linked : PLATEAU_URN + linked);
      var ring = selected && selected.feature.geometry.coordinates[0];
      if (ring) zoomTo = ring[0];
    }
    // Whichever comes last adds the layer: the data here, or the map's load event.
    if (map && map.isStyleLoaded()) addBuildings(map);
    else if (map) map.once('idle', function () { addBuildings(map); });
  }).catch(function () {
    data = false;
    showStatus();
  });
})();
