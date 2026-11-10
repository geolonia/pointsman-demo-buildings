// The buildings demo page: the area's buildings from the data platform on a
// map, coloured by year built, one building's data, and a check request in
// four steps: building, missing details, check and send, result. Plain
// JavaScript, no build step.
(function () {
  'use strict';

  var T = {
    en: {
      demo: 'buildings demo', devTitle: 'Developer view', devShort: 'Dev', close: 'Close', aTheme: 'Switch theme',
      resize: 'Drag to make the panel wider or narrower (arrow keys work too)',
      howTitle: 'How it works', forDevs: 'For developers', lBridge: 'The connector (FIWARE bridge)',
      howLead: 'What happens to a request, step by step. GeonicDB, a FIWARE data platform, keeps the data and starts each step. A small connector passes the step to Pointsman, and Pointsman answers. The AI only answers fixed questions about your words and photos; the building\u2019s data and the city\u2019s rules do the rest.',
      h1k: '1 · Saved', h1t: 'The page saves the request in GeonicDB', h1d: 'A BuildingCheckRequest entity, linked to the Building entity. Your answers fill only what the city model does not know.',
      h2k: '2 · Notified', h2t: 'GeonicDB tells the connector', h2d: 'A subscription on new requests sends it a notification.',
      h3k: '3 · First check', h3t: 'Pointsman sorts the building', h3d: 'Rules only, no AI: year built, structure, and the ground and earthquake data for the place give a priority for a seismic check.',
      h4k: '4 · Your description', h4t: 'Pointsman reads your words', h4d: 'With a description, a second check starts. The AI answers fixed questions: what kind of damage, how serious, is anyone in danger now. The city\u2019s rules turn the answers and the first result into one urgency.',
      h5k: '5 · Written back', h5t: 'The results go back into GeonicDB', h5d: 'The connector writes each result onto the request, with a Decision entity. A result that a person must check also gets a Task entity.',
      h6k: '6 · Used', h6t: 'Any app can read the results', h6d: 'A city dashboard or a ticket system can subscribe to them. This page reads them and shows you the result.',
      exTitle: 'Pick an example', exNote: 'Each one is sent live to Pointsman. They show four different outcomes.',
      exFoot: 'Made-up descriptions of real buildings from the city model. Requests are deleted after a day.',
      exAfter: 'After a disaster: {v}', exAdds: 'You add: {v}', exBuilt: 'built {y}', exStoreys: '{n} storeys', exYearUnknown: 'year not known',
      mapTitle: 'Or pick any building on the map', sentTitle: 'What was sent',
      title: 'Every building, the same checks',
      lead: 'These are the buildings of one neighbourhood in Kiyota-ku, Sapporo, from the national 3D city model (PLATEAU). They live in GeonicDB, a FIWARE data platform, as Building entities. Pick one, ask how urgent a seismic check is, and watch Pointsman sort the request: what to check first, and why.',
      care: 'Pointsman sorts and explains. It never decides that a building is safe: that is always a person’s decision.',
      legendTitle: 'Year built', eraBefore: '1981 or earlier', eraMiddle: '1982 to 2000', eraAfter: '2001 or later', eraUnknown: 'Not known',
      pick: 'Pick a building on the map.',
      devLead: 'What the page asks the data platform (NGSI-LD), and what it gets back.', devList: 'All buildings in the area', devEntity: 'The selected building',
      lSource: 'Source of this demo', lPointsman: 'Pointsman', gsi: 'GSI map tiles',
      loading: 'Loading the buildings…', drawing: 'Drawing the buildings on the map…', mapSlow: 'The map is slow to draw the buildings. Reload the page if they do not appear.', loaded: '{n} buildings. {k} of them without a year built.', failed: 'The buildings could not be loaded. Try again later.',
      building: 'Building', year: 'Year built', structure: 'Structure', usage: 'Use', storeys: 'Storeys above ground', height: 'Height',
      flood: 'River flood (worst case)', landslide: 'Landslide zone', unknown: 'not known', none: 'none', id: 'PLATEAU id',
      unknownNote: 'Some values are not in the city model. In a request, Pointsman asks for them instead of guessing.',
      checkThis: 'Check this building', checksClosed: 'Checks are not open yet.',
      s1: 'Pick a building', s2: 'Details', s3: 'Check and send', s4: 'Result',
      t2: 'What the city model does not know', t3: 'Check and send', t4: 'How urgent is a seismic check?',
      dontKnow: 'I do not know', woodQ: 'Is it a wooden building?', yes: 'Yes', no: 'No', yearQ: 'Year built', storeysQ: 'Storeys above ground',
      allKnown: 'The city model knows everything the check needs.', next: 'Next', back: 'Back', send: 'Send', again: 'Check another building',
      fromModel: 'city model', fromYou: 'you', sendNote: 'This is a demo: nothing goes to the city, and the request is deleted after a day. Pointsman sorts and explains; whether a building is safe is always a person\u2019s decision.',
      sending: 'Sending…', waiting: 'Pointsman is sorting the request…', slow: 'This takes longer than usual. The result appears here as soon as it is there.', steps: 'Steps', emptyIsUnknown: 'leave it empty', outOfRange: 'Enter a whole number from {min} to {max}, or leave it empty.',
      e_busy: 'The demo is busy, or has had enough requests for today. Try again later.', e_closed: 'Checks are not open yet.', e_building: 'This building could not be sent.', e_other: 'The request could not be sent. Try again later.',
      e_lost: 'The request is no longer there (requests are deleted after a day).', gaveUp: 'No result yet. The demo tries again every hour; you can also look again later.', lookAgain: 'Look again',
      wood: 'Wood', notWood: 'Not wood',
      a_high: 'High: a seismic check should come first', a_medium: 'Medium', a_low: 'Low', 'a_more-evidence': 'More information needed',
      n_high: 'In a real service, staff would confirm this priority; this demo sends it to no one. A wooden house begun on or before 31 May 1981 may get Sapporo\u2019s free seismic check.',
      n_medium: 'A check is worth planning, but other buildings come first.',
      n_low: 'No reason for an early check was found in the data.',
      'n_more-evidence': 'The year built or the structure is missing. They are on the building certificate (登記事項証明書) or the building permit (確認済証).',
      why: 'Why', r0: 'The year built or the structure is not known.', r1: 'Wooden, and built under the building code before June 1981 (or in 1981).', r2: 'Built under the building code before June 1981 (or in 1981).',
      r3: 'Wooden and built before the 2000 code, on soft ground or where strong shaking is more likely.', r4: 'In a river flood zone of 3 m or deeper.', r5: 'Wooden and built before the 2000 code, but the ground or the chance of strong shaking here could not be read.',
      n_hazard: 'The earthquake data for this place could not be read just now. Try again later.', rd: 'None of the rules for an earlier check applied.',
      devRequest: 'The check request', devDecision: 'Pointsman\u2019s decision (Decision entity)', devConcern: 'Pointsman\u2019s decision on the description (Decision entity)',
      worryQ: 'What worries you about this building?', worryHint: 'In your own words: what you see, since when, where on the building. The AI reads it; leave it empty for the check from the building\u2019s data only. Do not write names or phone numbers. This demo deletes your description after about a day; the AI service may keep it in its logs for longer.',
      samplesQ: 'Not sure what to write? Start from an example and change it as you like:', photoSamplesQ: 'No photo at hand? Add an example photo:', photoBy: 'Photo: {a}, ', photoSource: 'source', photoAdded: 'added', photoResized: ', resized', exampleFailed: 'The example photo could not be loaded. Try again.', replaceText: 'Replace what you wrote with this example?',
      photosQ: 'Photos (up to 3, optional)', photosHint: 'Only of the building: no people, number plates or name plates. The AI looks at them; they are deleted with the request after about a day.', addPhotos: 'Add photos', removePhoto: 'Remove photo {n}', photoFailed: 'This photo could not be read. Try a JPEG or PNG.', photoCount: '{n} photo(s)', photos: 'Photos', photosNeedWords: 'Photos are sent only with a description: say in a few words what they show.', photosBusy: 'The photos are still being prepared. Try again in a moment.',
      afterQ: 'Did it start after an earthquake or another disaster?', unsure: 'Not sure', chars: '{n} of {max} characters', yourWords: 'Your description',
      resultLabel: 'Pointsman\u2019s answer', dangerChance: 'chance of danger: {n} %',
      pathFacts: 'Facts, from data', pathInput: 'Your input', pathAi: 'The AI answers fixed questions, each with a probability', pathRule: 'A fixed rule decides', pathNoAi: 'No AI here: fixed rules decide from the facts alone', pathDecision: 'Decision', pathAiMissing: 'The AI answered fixed questions, but its answers cannot be shown just now', qAbout: 'About a building?', qDamage: 'What kind of damage?', qDanger: 'Danger to people now?', qSeverity: 'How serious?', usedTag: 'the rule used this', fGround: 'Ground amplification (J-SHIS)', fShaking: 'Strong shaking in 30 years (J-SHIS)', fPriority: 'The building\u2019s check priority', rank: 'rank {n}', nOf4: '{n} of 4', chance: 'chance of yes',
      graphKicker: 'How Pointsman decides', graphText: 'A request goes from left to right. Each box is a profile with its own questions and rules; the second one also reads the first one\u2019s decision.', graphDmn: 'Download for DMN tools (.dmn)',
      tc: 'How urgent is your concern?',
      notRead: 'Your description could not be read this time, so this is the check from the building\u2019s data only.',
      ca_now: 'Now: act today', ca_high: 'High: check soon', ca_medium: 'Medium', ca_low: 'Low', ca_person: 'A person reads it first', 'ca_more-evidence': 'Please describe it more clearly',
      cn_now: 'In a real service, staff would be asked to act today; this demo sends it to no one. If anyone is in danger, call 119 or leave the building now.', cn_high: 'In a real service, staff would check this soon and confirm the priority; this demo sends it to no one.', cn_medium: 'A check is worth planning.', cn_low: 'Nothing in the description points to an early check.', cn_person: 'The AI was not sure. In a real service, a person would read the description before anything else; this demo sends it to no one.', 'cn_more-evidence': 'Say what you see, where on the building and since when, and send it again.',
      c0: 'The description does not seem to be about a building.', c1: 'The words point to danger to people now, or to a part that has collapsed.', c2: 'The words point to serious damage, to parts that lean, sink or may fall, or to the foundation or ground.', c3: 'Cracks in load-bearing parts, in a building whose check is already high.', c4: 'The AI sees some danger to people, but not enough to act today.', c5: 'Cracks in load-bearing parts, or water or fire damage.', c6: 'The AI is not sure what the damage is, or sees some sign of danger.', c7: 'The description does not say clearly what is damaged.', c8: 'Only surface damage, but the building\u2019s check is high anyway.', cd: 'Only small surface damage is described.',
      d_partial_collapse: 'a part has collapsed', d_tilt_or_sinking: 'leaning or sinking', d_falling_parts: 'parts may fall', d_structural_cracks: 'cracks in load-bearing parts', d_foundation_or_ground: 'foundation or ground', d_water_or_fire: 'water or fire', d_cosmetic: 'surface damage only', d_nothing_clear: 'nothing clear',
      sev0: 'none', sev1: 'minor', sev2: 'moderate', sev3: 'severe', sev4: 'collapse',
      floodValue: '{depth} m ({rank})', noMap: 'The map could not be loaded.', partial: 'Not all buildings could be loaded.', devFailed: 'The data platform did not answer.', eraNote1981: 'Built under the building code before June 1981, or in 1981 (the permit date decides).',
    },
    ja: {
      demo: '建物デモ', devTitle: '開発者向け表示', devShort: '開発', close: '閉じる', aTheme: '表示テーマを切り替える',
      resize: 'ドラッグでパネルの幅を変えられます（矢印キーでも変えられます）',
      howTitle: '仕組み', forDevs: '開発者向け', lBridge: 'つなぎ役（FIWARE ブリッジ）',
      howLead: '依頼に何が起きるかを、順に説明します。FIWARE のデータ基盤 GeonicDB がデータを持ち、各手順を始めます。小さなつなぎ役が手順を Pointsman に渡し、Pointsman が答えます。AI はあなたの説明と写真について決まった質問に答えるだけで、残りは建物のデータと市の規則が決めます。',
      h1k: '1・保存', h1t: 'ページが依頼を GeonicDB に保存する', h1d: '建物（Building エンティティ）にひもづいた BuildingCheckRequest エンティティです。あなたの回答は、3D都市モデルにない値だけを補います。',
      h2k: '2・通知', h2t: 'GeonicDB がつなぎ役に知らせる', h2d: '新しい依頼へのサブスクリプションが、通知を送ります。',
      h3k: '3・最初の確認', h3t: 'Pointsman が建物を仕分ける', h3d: '規則だけで、AI は使いません。建築年、構造、その場所の地盤と地震のデータから、耐震の確認の優先度を決めます。',
      h4k: '4・あなたの説明', h4t: 'Pointsman があなたの言葉を読む', h4d: '説明があると、2つ目の確認が始まります。AI は決まった質問にだけ答えます（被害の種類、深刻さ、今、人に危険があるか）。市の規則が、その答えと最初の結果から急ぎの度合いを1つ決めます。',
      h5k: '5・書き戻し', h5t: '結果が GeonicDB に戻る', h5d: 'つなぎ役が、それぞれの結果を Decision エンティティと一緒に依頼に書き込みます。人が確認すべき結果には Task エンティティもできます。',
      h6k: '6・利用', h6t: 'どのアプリも結果を読める', h6d: '市のダッシュボードやチケットシステムは、結果をサブスクライブできます。このページも結果を読んで表示します。',
      exTitle: '例を選ぶ', exNote: 'どれもその場で Pointsman に送られます。4 つとも結果が違います。',
      exFoot: '説明は作り話で、建物は3D都市モデルにある実在のものです。依頼は1日で削除されます。',
      exAfter: '災害のあと：{v}', exAdds: 'あなたが補う：{v}', exBuilt: '{y}年築', exStoreys: '{n}階建て', exYearUnknown: '建築年不明',
      mapTitle: 'または、地図で好きな建物を選ぶ', sentTitle: '送った内容',
      title: 'すべての建物を、同じ基準で',
      lead: '札幌市清田区の一地区の建物です。国の3D都市モデル（PLATEAU）のデータを、FIWARE のデータ基盤 GeonicDB に Building エンティティとして入れています。建物を選んで耐震の確認がどれだけ急ぎかを尋ね、Pointsman がその依頼をどう仕分けるか（何を先に確認するか、なぜか）を見てください。',
      care: 'Pointsman は仕分けて理由を示します。建物が安全かどうかは判断しません。それは常に人が決めます。',
      legendTitle: '建築年', eraBefore: '1981年以前', eraMiddle: '1982〜2000年', eraAfter: '2001年以降', eraUnknown: '不明',
      pick: '地図で建物を選んでください。',
      devLead: 'このページがデータ基盤に何を問い合わせ（NGSI-LD）、何が返ってくるか。', devList: 'この地区のすべての建物', devEntity: '選んだ建物',
      lSource: 'このデモのソース', lPointsman: 'Pointsman', gsi: '地理院タイル',
      loading: '建物を読み込んでいます…', drawing: '地図に建物を描いています…', mapSlow: '地図に建物を描くのに時間がかかっています。表示されないときは、ページを再読み込みしてください。', loaded: '{n} 棟。そのうち {k} 棟は建築年が不明です。', failed: '建物を読み込めませんでした。しばらくしてからもう一度お試しください。',
      building: '建物', year: '建築年', structure: '構造', usage: '用途', storeys: '地上階数', height: '高さ',
      flood: '洪水（想定最大規模）', landslide: '土砂災害警戒区域', unknown: '不明', none: 'なし', id: 'PLATEAU ID',
      unknownNote: '3D都市モデルにない値があります。依頼では、Pointsman は推測せずにそれを尋ねます。',
      checkThis: 'この建物を確認する', checksClosed: '確認はまだ受け付けていません。',
      s1: '建物を選ぶ', s2: '詳細', s3: '確認して送信', s4: '結果',
      t2: '3D都市モデルにない情報', t3: '確認して送信', t4: '耐震の確認はどれだけ急ぎか',
      dontKnow: 'わからない', woodQ: '木造の建物ですか', yes: 'はい', no: 'いいえ', yearQ: '建築年', storeysQ: '地上階数',
      allKnown: '確認に必要な情報は、3D都市モデルにすべてあります。', next: '次へ', back: '戻る', send: '送信', again: 'ほかの建物を確認する',
      fromModel: '3D都市モデル', fromYou: 'あなた', sendNote: 'これはデモです。市には何も届かず、依頼は1日で削除されます。Pointsman は仕分けて理由を示します。建物が安全かどうかは常に人が決めます。',
      sending: '送信しています…', waiting: 'Pointsman が依頼を仕分けています…', slow: 'いつもより時間がかかっています。結果が出しだい、ここに表示します。', steps: '手順', emptyIsUnknown: '空欄のまま', outOfRange: '{min}から{max}までの整数を入れるか、空欄のままにしてください。',
      e_busy: 'デモが混み合っているか、今日の受付数に達しました。時間をおいてお試しください。', e_closed: '確認はまだ受け付けていません。', e_building: 'この建物は送れませんでした。', e_other: '依頼を送れませんでした。時間をおいてお試しください。',
      e_lost: '依頼はもうありません（依頼は1日で削除されます）。', gaveUp: 'まだ結果がありません。デモは1時間ごとにやり直します。あとでもう一度ご覧ください。', lookAgain: 'もう一度見る',
      wood: '木造', notWood: '非木造',
      a_high: '高：耐震の確認を先に', a_medium: '中', a_low: '低', 'a_more-evidence': '情報が足りません',
      n_high: '実際のサービスでは、職員がこの優先度を確認します（このデモではどこにも届きません）。1981年5月31日以前に着工した木造住宅は、札幌市の無料の耐震診断を受けられることがあります。',
      n_medium: '確認を計画する価値はありますが、ほかの建物が先です。',
      n_low: 'データからは、早めの確認が必要な理由は見つかりませんでした。',
      'n_more-evidence': '建築年か構造が足りません。登記事項証明書や確認済証に書かれています。',
      why: '理由', r0: '建築年か構造がわかりません。', r1: '木造で、1981年6月より前の基準（または1981年）で建てられています。', r2: '1981年6月より前の基準（または1981年）で建てられています。',
      r3: '2000年の基準より前の木造で、揺れやすい地盤か、強い揺れの起きやすい場所にあります。', r4: '想定最大規模で3 m以上浸水する区域にあります。', r5: '2000年の基準より前の木造ですが、この場所の地盤か強い揺れの起きやすさを読み取れませんでした。',
      n_hazard: 'この場所の地震のデータを今は読み取れませんでした。時間をおいてもう一度お試しください。', rd: '早めの確認につながる条件には当てはまりませんでした。',
      devRequest: '確認の依頼', devDecision: 'Pointsman の判断（Decision エンティティ）', devConcern: '説明についての Pointsman の判断（Decision エンティティ）',
      worryQ: 'この建物の何が心配ですか', worryHint: 'ご自身の言葉で：何が見えるか、いつからか、建物のどこか。AI が読みます。建物のデータだけで確認するときは空欄のままにしてください。名前や電話番号は書かないでください。このデモは説明を約1日で削除します（AI サービスの記録には、より長く残ることがあります）。',
      samplesQ: '書き方に迷ったら、例から始めて自由に書き直せます：', photoSamplesQ: '手元に写真がなければ、例の写真を追加できます：', photoBy: '写真：{a}、', photoSource: '出典', photoAdded: '追加済み', photoResized: '、縮小して使用', exampleFailed: '例の写真を読み込めませんでした。もう一度お試しください。', replaceText: '書いた内容をこの例で置き換えますか？',
      photosQ: '写真(3 枚まで、任意)', photosHint: '建物だけを写してください。人、ナンバープレート、表札は写さないでください。AI が見ます。写真は約 1 日後に依頼と一緒に削除します。', addPhotos: '写真を追加', removePhoto: '写真 {n} を外す', photoFailed: 'この写真を読み込めませんでした。JPEG か PNG でお試しください。', photoCount: '写真 {n} 枚', photos: '写真', photosNeedWords: '写真は説明と一緒にだけ送ります。写真に何が写っているかを短く書いてください。', photosBusy: '写真を準備しています。少し待ってからもう一度お試しください。',
      afterQ: '地震などの災害のあとに起きましたか', unsure: 'わからない', chars: '{n} / {max} 文字', yourWords: 'あなたの説明',
      resultLabel: 'Pointsman の判定', dangerChance: '危険の可能性：{n} %',
      pathFacts: 'データからの事実', pathInput: 'あなたの入力', pathAi: 'AI が決まった質問に、確率つきで答えます', pathRule: '決まったルールで判定します', pathNoAi: 'ここでは AI を使いません。事実だけから決まったルールで判定します', pathDecision: '判定', pathAiMissing: 'AI は決まった質問に答えましたが、今はその答えを表示できません', qAbout: '建物についての話か', qDamage: '被害の種類は', qDanger: '今、人に危険があるか', qSeverity: 'どれだけ深刻か', usedTag: 'ルールが使った', fGround: '地盤の揺れやすさ（J-SHIS）', fShaking: '30年以内の強い揺れ（J-SHIS）', fPriority: '建物の確認の優先度', rank: 'ランク {n}', nOf4: '4段階の{n}', chance: '「はい」の確率',
      graphKicker: 'Pointsman の判定の流れ', graphText: '依頼は左から右へ進みます。箱 1 つが、それぞれの質問と規則をもつ 1 つのプロファイルです。2 つ目は 1 つ目の判定も読みます。', graphDmn: 'DMN ツール用にダウンロード（.dmn）',
      tc: 'この心配はどれだけ急ぎか',
      notRead: '今回は説明を読み取れなかったため、建物のデータだけによる確認の結果です。',
      ca_now: '今すぐ：今日のうちに対応', ca_high: '高：早めに確認', ca_medium: '中', ca_low: '低', ca_person: 'まず人が読みます', 'ca_more-evidence': 'もう少し詳しく説明してください',
      cn_now: '実際のサービスでは、職員に今日中の対応を求めます（このデモではどこにも届きません）。危険な人がいるときは、119 番に電話するか、すぐに建物から離れてください。', cn_high: '実際のサービスでは、職員が早めに確認し、優先度を確定します（このデモではどこにも届きません）。', cn_medium: '確認を計画する価値があります。', cn_low: '説明からは、早めの確認が必要な理由は見つかりませんでした。', cn_person: 'AI が判断しきれませんでした。実際のサービスでは、まず人が説明を読みます（このデモではどこにも届きません）。', 'cn_more-evidence': '何が見えるか、建物のどこか、いつからかを書いて、もう一度送ってください。',
      c0: '説明が建物についてのものではないようです。', c1: '今、人に危険がある、または一部が崩れたことを示す言葉があります。', c2: '深刻な被害、傾き・沈み・落下のおそれ、または基礎や地盤の被害を示す言葉があります。', c3: '構造部分のひびで、建物の確認の優先度もすでに高です。', c4: 'AI が人への危険を読み取りましたが、今日中の対応が必要なほどではありません。', c5: '構造部分のひび、または水や火による被害です。', c6: 'AI が被害の種類を判断しきれないか、危険のきざしを読み取りました。', c7: '何が壊れているかが説明からはっきりしません。', c8: '表面の被害だけですが、建物の確認の優先度がもともと高です。', cd: '表面の小さな被害だけが説明されています。',
      d_partial_collapse: '一部の崩壊', d_tilt_or_sinking: '傾き・沈下', d_falling_parts: '落下のおそれ', d_structural_cracks: '構造部分のひび', d_foundation_or_ground: '基礎・地盤', d_water_or_fire: '水・火', d_cosmetic: '表面だけ', d_nothing_clear: 'はっきりしない',
      sev0: 'なし', sev1: '軽い', sev2: '中程度', sev3: '深刻', sev4: '崩壊',
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

  /**
   * Prepared examples: a real building (by its PLATEAU id) and every field
   * filled. The descriptions are from the plan's checked samples (8.6), whose
   * outcomes with building-concern v3 (act today at danger 0.75, a person
   * at 0.40) were: tilt high, balcony now, paint cracks low (on a building
   * whose check is low), vague more-evidence. `answers` fill only what the
   * city model does not know (the Worker ignores the rest).
   */
  var EXAMPLES = [
    { id: '01100-bldg-596155', label: { en: 'The house leans', ja: '家が傾いた' }, after: 'yes',
      answers: { yearOfConstruction: 1976, wood: true, storeysAboveGround: 2 },
      description: { en: 'Since this morning\u2019s earthquake the house leans towards the street and the front door no longer closes.', ja: '地震のあと、家が道路側に傾いて、玄関のドアが閉まらなくなりました。' } },
    { id: '01100-bldg-595855', label: { en: 'Part of it came down', ja: '一部が落ちた' }, after: 'unsure', answers: {},
      description: { en: 'Part of the balcony on the second floor came down an hour ago. Nobody was hurt, but more pieces are hanging.', ja: '2階のベランダの一部が1時間前に落ちました。けが人はいませんが、まだ破片がぶら下がっています。' } },
    { id: '01100-bldg-597856', label: { en: 'Old, thin cracks', ja: '前からある細いひび' }, after: 'no', answers: {},
      description: { en: 'Thin cracks in the paint of the hallway ceiling. They have been there for years.', ja: '廊下の天井の塗装に細いひびがあります。何年も前からです。' } },
    { id: '01100-bldg-595870', label: { en: 'A vague worry', ja: 'はっきりしない心配' }, after: 'unsure', answers: {},
      description: { en: 'Something is wrong with my house.', ja: '家がなんとなくおかしいです。' } },
  ];

  // ?lang= (the demos page links with it, as for the roads demo), else the
  // visitor's choice, else the browser's language.
  function pickLang() {
    var q = null;
    try { q = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (q === 'ja' || q === 'en') return q;
    var stored = null;
    try { stored = localStorage.getItem('lang'); } catch (e) {}
    if (stored === 'ja' || stored === 'en') return stored;
    return (navigator.language || '').indexOf('ja') === 0 ? 'ja' : 'en';
  }
  var lang = pickLang();
  var data = null;
  var PLATEAU_URN = 'urn:ngsi-ld:Building:plateau:';
  var zoomTo = null;
  /** The buildings layer is on the map and drawn once. */
  var drawn = false;
  /** The map did not draw them within 15 s (lost WebGL, a broken style): said so, not taken as drawn. */
  var mapSlow = false;
  var selected = null;
  var map = null;
  /** Whether the Worker accepts check requests (/api/config `checks`). */
  var checksOpen = false;
  /** Scene B: the person's own words, read by AI (/api/config concerns). */
  var concernsOpen = false;
  /** Photos with the description (/api/config photos). */
  var photosOpen = false;
  var MAX_PHOTOS = 3;
  /** Descriptions to start from (checked against the model, plan 8.6): people find it hard to write their own. */
  var SAMPLES = [
    { en: 'Since this morning\u2019s earthquake the house leans towards the street and the front door no longer closes.', ja: '地震のあと、家が道路側に傾いて、玄関のドアが閉まらなくなりました。' },
    { en: 'Part of the balcony on the second floor came down an hour ago. Nobody was hurt, but more pieces are hanging.', ja: '2階のベランダの一部が1時間前に落ちました。けが人はいませんが、まだ破片がぶら下がっています。' },
    { en: 'There are diagonal cracks running from the corners of the living room windows. They were not there before the quake.', ja: '居間の窓の角から斜めのひびが入っています。地震の前にはありませんでした。' },
    { en: 'Some roof tiles slipped and hang over the entrance where children walk to school.', ja: '瓦が何枚かずれて、通学路の入口の上にぶら下がっています。' },
    { en: 'Thin cracks in the paint of the hallway ceiling. They have been there for years.', ja: '廊下の天井の塗装に細いひびがあります。何年も前からです。' },
    { en: 'Something is wrong with my house.', ja: '家がなんとなくおかしいです。' },
  ];
  /** Example photos with their credits (site/photos/photos.json), loaded when the photo field first shows. */
  var examplePhotos = null;
  var examplePhotosLoading = null;
  /** Loads the list once; a failed load is not kept, so the next time the field shows it tries again. */
  function loadExamplePhotos() {
    if (!examplePhotosLoading) {
      examplePhotosLoading = fetch('photos/photos.json').then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      }).then(function (list) {
        if (!Array.isArray(list)) throw new Error('not a list');
        examplePhotos = list;
      }).catch(function () { examplePhotosLoading = null; });
    }
    return examplePhotosLoading;
  }
  var MAX_WORDS = 1000;
  /** The request flow: step 1 to 4, the answers, the sent request and its result. */
  var flow = null;

  function t(key, vars) {
    var s = (T[lang] && T[lang][key]) || T.en[key] || key;
    // A value the page has no words for (a changed profile): the value itself, without the key's prefix.
    if (s === key && /^(ca_|cn_|d_|sev)/.test(key)) s = key.replace(/^(ca_|cn_|d_|sev)/, '');
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
    // Back to the demos page in the same language.
    document.getElementById('brand').pathname = lang === 'ja' ? '/ja/demos/' : '/demos/';
    var b = document.getElementById('lang');
    b.textContent = lang === 'ja' ? 'English' : '日本語';
    b.lang = lang === 'ja' ? 'en' : 'ja';
    showStatus();
    showBuilding();
    showFlow();
    if (document.getElementById('how').open) renderHowGraph();
  }

  /** The stepper in the intro: step 1 until a request is started, then the flow's step. */
  function showStepper() {
    var step = flow ? flow.step : 1;
    document.querySelectorAll('#stepper li').forEach(function (li) {
      var n = Number(li.dataset.step);
      li.className = n < step ? 'done' : n === step ? 'active' : '';
      if (n === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }

  function featureOf(plateauId) {
    return data && data.features ? data.features.find(function (x) { return x.id === PLATEAU_URN + plateauId; }) : null;
  }

  /**
   * The example cards: only with the buildings loaded and descriptions open,
   * and only in step 1 (as the roads demo hides "Pick a report" once one is
   * sent); an example whose building is missing is left out.
   */
  function showExamples() {
    var section = document.getElementById('examples');
    var list = document.getElementById('cards');
    var shown = checksOpen && concernsOpen ? EXAMPLES.filter(function (x) { return featureOf(x.id); }) : [];
    section.hidden = shown.length === 0 || !!(flow && flow.step >= 2);
    var busy = !!(flow && flow.state === 'sending');
    list.replaceChildren.apply(list, shown.map(function (x) {
      var p = featureOf(x.id).properties;
      var what = [name(USAGE, p.usage) || t('building'), p.yearOfConstruction ? String(p.yearOfConstruction) : t('exYearUnknown'), name(STRUCTURE, p.structure)].filter(Boolean).join(' · ');
      var adds = [];
      if (p.yearOfConstruction === null && x.answers.yearOfConstruction !== undefined) adds.push(t('exBuilt', { y: x.answers.yearOfConstruction }));
      if (!(p.structure && STRUCTURE[p.structure]) && x.answers.wood !== undefined) adds.push(t(x.answers.wood ? 'wood' : 'notWood'));
      if (p.storeys === null && x.answers.storeysAboveGround !== undefined) adds.push(t('exStoreys', { n: x.answers.storeysAboveGround }));
      var b = el('button', { type: 'button', class: 'ex-card' }, [
        el('span', { class: 'label' }, [x.label[lang]]),
        el('strong', { class: 'what' }, [what]),
        el('span', { class: 'text' }, [lang === 'ja' ? '「' + x.description.ja + '」' : '\u201c' + x.description.en + '\u201d']),
        el('span', { class: 'hint' }, [el('span', {}, [t('exAfter', { v: t(x.after) })])].concat(adds.length ? [el('span', {}, [t('exAdds', { v: adds.join(lang === 'ja' ? '、' : ', ') })])] : [])),
      ]);
      b.disabled = busy;
      b.addEventListener('click', function () { sendExample(x); });
      return el('li', {}, [b]);
    }));
  }

  /** An example as roads does it: the building picked, every field filled, sent at once. */
  function sendExample(x) {
    var f = featureOf(x.id);
    if (!f || (flow && flow.state === 'sending')) return;
    select(f.id);
    var ring = f.geometry.coordinates[0];
    if (map && ring) map.flyTo({ center: ring[0], zoom: 17 });
    startFlow(false);
    var answers = {};
    Object.keys(x.answers).forEach(function (k) { answers[k] = x.answers[k]; });
    flow.answers = answers;
    flow.concern.description = x.description[lang];
    flow.concern.afterDisaster = x.after;
    send();
    document.getElementById('flow').scrollIntoView({ behavior: 'smooth', block: 'start' });
    // The clicked card is hidden now: keep keyboard focus on the request.
    focusHeading('flow-title');
  }

  /** Moves focus to a heading (made focusable for this), without a second scroll. */
  function focusHeading(id) {
    var h = document.getElementById(id);
    if (!h || h.closest('[hidden]')) return;
    h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }

  /** The note over the map: until the buildings are drawn, or the load failed (the status line says why). */
  function showLoading() {
    document.getElementById('map-loading').hidden = data === false || (data !== null && (drawn || mapSlow || !map));
  }

  function showStatus() {
    showLoading();
    var s = document.getElementById('status');
    if (data === null) s.textContent = t('loading');
    else if (data === false) s.textContent = t('failed');
    else s.textContent = t('loaded', { n: data.features.length, k: data.features.filter(function (f) { return f.properties.yearOfConstruction === null; }).length }) + (data.complete === false || data.skipped > 0 ? ' ' + t('partial') : '') + (map ? '' : ' ' + t('noMap'))
      // While the map draws them, and when it is slow: screen readers hear this line, not the note over the map.
      + (map && !drawn ? ' ' + t(mapSlow ? 'mapSlow' : 'drawing') : '');
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

  function startFlow(scroll) {
    if (!selected) return;
    var p = selected.feature.properties;
    flow = { step: 2, building: selected.feature, answers: {}, concern: { description: '', photos: [] }, known: { year: p.yearOfConstruction !== null, structure: !!(p.structure && STRUCTURE[p.structure]), storeys: p.storeys !== null } };
    showFlow();
    if (scroll !== false) document.getElementById('flow').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  /** Scene B: what worries the person, in their own words, and whether it started after a disaster. */
  function concernFields() {
    var area = el('textarea', { id: 'q-worry', rows: '5', maxlength: String(MAX_WORDS), 'aria-describedby': 'q-worry-hint q-worry-count' });
    area.value = flow.concern.description;
    var count = el('p', { class: 'muted', id: 'q-worry-count' }, [t('chars', { n: area.value.length, max: MAX_WORDS })]);
    area.addEventListener('input', function () { flow.concern.description = area.value; count.textContent = t('chars', { n: area.value.length, max: MAX_WORDS }); });
    var samples = el('ul', { class: 'samples', 'aria-labelledby': 'q-worry-samples' }, SAMPLES.map(function (x) {
      return el('li', {}, [button(x[lang], function () {
        if (area.value.trim() && area.value !== x[lang] && !window.confirm(t('replaceText'))) return;
        area.value = x[lang];
        flow.concern.description = area.value;
        count.textContent = t('chars', { n: area.value.length, max: MAX_WORDS });
        area.focus();
      }, 'sample')]);
    }));
    var words = el('div', { class: 'field' }, [el('label', { for: 'q-worry' }, [t('worryQ')]), el('p', { class: 'muted', id: 'q-worry-hint' }, [t('worryHint')]), area, count,
      el('p', { class: 'muted', id: 'q-worry-samples' }, [t('samplesQ')]), samples]);
    var after = el('fieldset', { class: 'field' }, [el('legend', {}, [t('afterQ')])]);
    [['yes', t('yes')], ['no', t('no')], ['unsure', t('unsure')]].forEach(function (o) {
      var id = 'q-after-' + o[0];
      var input = el('input', { type: 'radio', name: 'after', id: id, value: o[0] });
      if (flow.concern.afterDisaster === o[0]) input.checked = true;
      input.addEventListener('change', function () { flow.concern.afterDisaster = o[0]; });
      after.append(el('label', { for: id, class: 'choice' }, [input, ' ' + o[1]]));
    });
    return [words, after];
  }

  /**
   * A photo as the AI should get it: about 1 megapixel (Clef scales larger
   * ones down anyway), JPEG. Drawn on a canvas, so it also drops the photo's
   * metadata (place, camera, time).
   */
  function shrink(file) {
    return createImageBitmap(file).then(function (img) {
      var scale = Math.min(1, Math.sqrt(1000000 / (img.width * img.height)), 1600 / Math.max(img.width, img.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      if (img.close) img.close();
      // The server takes at most 700,000 characters per photo: lower the quality until it fits.
      var url = canvas.toDataURL('image/jpeg', 0.8);
      for (var q = 0.65; url.length > 680000 && q > 0.3; q -= 0.15) url = canvas.toDataURL('image/jpeg', q);
      return url;
    });
  }

  function photosField() {
    var box = el('div', { class: 'field' }, [el('label', { for: 'q-photos' }, [t('photosQ')]), el('p', { class: 'muted', id: 'q-photos-hint' }, [t('photosHint')])]);
    var input = el('input', { type: 'file', id: 'q-photos', accept: 'image/jpeg,image/png,image/webp,image/heic', multiple: '', 'aria-describedby': 'q-photos-hint' });
    var list = el('div', { class: 'photos' });
    var error = el('p', { class: 'field-error', hidden: '' }, [t('photoFailed')]);
    var f = flow;
    function render() {
      f.concern.from = f.concern.from || [];
      list.replaceChildren.apply(list, f.concern.photos.map(function (src, i) {
        var remove = button('×', function () { f.concern.photos.splice(i, 1); f.concern.from.splice(i, 1); render(); }, 'btn ghost small');
        remove.setAttribute('aria-label', t('removePhoto', { n: i + 1 }));
        return el('figure', {}, [el('img', { src: src, alt: '' }), remove]);
      }));
      input.disabled = f.concern.photos.length >= MAX_PHOTOS;
      drawExamples();
    }
    // Example photos: picked like an upload (shrunk the same way), with the credit under each.
    var examples = el('ul', { class: 'photo-examples', 'aria-labelledby': 'q-photos-examples' });
    var examplesNote = el('p', { class: 'muted', id: 'q-photos-examples', hidden: '' }, [t('photoSamplesQ')]);
    function drawExamples() {
      if (!examplePhotos) return;
      examplesNote.hidden = examplePhotos.length === 0;
      f.concern.adding = f.concern.adding || {};
      examples.replaceChildren.apply(examples, examplePhotos.map(function (x) {
        var added = (f.concern.from || []).indexOf(x.id) >= 0;
        var b = el('button', { type: 'button', class: 'photo-example' }, [el('img', { src: x.file, alt: '', loading: 'lazy' }), el('span', {}, [x.label[lang] + (added ? ' (' + t('photoAdded') + ')' : '')])]);
        b.disabled = added || f.concern.photos.length >= MAX_PHOTOS;
        b.addEventListener('click', function () {
          // A second click while it loads adds nothing.
          if (f.concern.adding[x.id]) return;
          f.concern.adding[x.id] = true;
          addPhoto(fetch(x.file).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.blob(); }), x.id)
            .then(function () { delete f.concern.adding[x.id]; });
        });
        var licence = x.licenceUrl ? el('a', { href: x.licenceUrl, target: '_blank', rel: 'noopener' }, [x.licence]) : x.licence;
        var credit = el('small', {}, [t('photoBy', { a: x.author }), licence, t('photoResized') + ' · ', el('a', { href: x.source, target: '_blank', rel: 'noopener' }, [t('photoSource')])]);
        return el('li', {}, [b, credit]);
      }));
    }
    /** Shrinks a photo (an upload or an example) and adds it; counted while pending, so Next waits for it. */
    function addPhoto(blob, from) {
      f.concern.pending = (f.concern.pending || 0) + 1;
      error.hidden = true;
      return Promise.resolve(blob).then(shrink).then(function (url) {
        if (flow === f && f.concern.photos.length < MAX_PHOTOS) {
          f.concern.from = f.concern.from || [];
          f.concern.photos.push(url);
          f.concern.from.push(from);
          // After a language switch this field is no longer shown: draw the step again.
          if (box.isConnected) {
            render();
            // The clicked example is disabled now: keep keyboard focus on the photo just added.
            if (from !== null) { var last = list.lastElementChild; if (last) last.querySelector('button').focus(); }
          } else if (f.step === 2) showFlow();
        }
      }).catch(function () {
        error.textContent = t(from === null ? 'photoFailed' : 'exampleFailed');
        error.hidden = false;
      }).then(function () { f.concern.pending -= 1; });
    }
    if (!examplePhotos) loadExamplePhotos().then(function () { if (box.isConnected) drawExamples(); });
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || [], 0, MAX_PHOTOS - f.concern.photos.length);
      input.value = '';
      error.hidden = true;
      // All counted at once (Next waits for them), shrunk one after another so they keep their order.
      var prev = Promise.resolve();
      files.forEach(function (file) { var turn = prev.then(function () { return file; }); prev = addPhoto(turn, null); });
    });
    render();
    box.append(input, list, error, examplesNote, examples);
    return box;
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
    ].concat(concernsOpen && flow.concern.description.trim() ? [
      [t('yourWords'), [flow.concern.description.trim(), ' ', origin(false)]],
    ].concat(photosOpen && flow.concern.photos.length ? [[t('photos'), [t('photoCount', { n: flow.concern.photos.length }), ' ', origin(false)]]] : []).concat(flow.concern.afterDisaster ? [[t('afterQ'), [t(flow.concern.afterDisaster === 'unsure' ? 'unsure' : flow.concern.afterDisaster), ' ', origin(false)]]] : []) : []);
  }

  function showFlow() {
    var section = document.getElementById('flow');
    showStepper();
    showExamples();
    if (!flow) { section.hidden = true; return; }
    section.hidden = false;
    var title = document.getElementById('flow-title');
    var body = document.getElementById('flow-body');
    if (flow.step === 2) {
      title.textContent = t('t2');
      // Scene B first: the story is the person's worry; the building's data fills in.
      var fields = concernsOpen ? concernFields().concat(photosOpen ? [photosField()] : []) : [];
      if (!flow.known.year) fields.push(numberField('yearOfConstruction', t('yearQ'), 1868, THIS_YEAR));
      if (!flow.known.structure) fields.push(woodField());
      if (!flow.known.storeys) fields.push(numberField('storeysAboveGround', t('storeysQ'), 1, 99));
      if (!concernsOpen && fields.length === 0) fields.push(el('p', {}, [t('allKnown')]));
      var photoMsg = el('p', { class: 'field-error', role: 'alert', hidden: '' });
      body.replaceChildren.apply(body, fields.concat([
        photoMsg,
        el('div', { class: 'actions' }, [button(t('next'), function () {
          var bad = body.querySelector('[aria-invalid="true"]'); if (bad) { bad.focus(); return; }
          // Photos go only with a description, and only once they are ready.
          var c = flow.concern;
          var problem = photosOpen && (c.pending ? 'photosBusy' : c.photos.length && !c.description.trim() ? 'photosNeedWords' : '');
          if (problem) { photoMsg.textContent = t(problem); photoMsg.hidden = false; return; }
          stepTo(3);
        }, 'btn')]),
      ]));
    } else if (flow.step === 3) {
      title.textContent = t('t3');
      var dl = el('dl');
      summaryRows().forEach(function (r) { dl.append(el('dt', {}, [r[0]]), el('dd', {}, r[1])); });
      body.replaceChildren(dl, el('p', { class: 'note' }, [t('sendNote')]), el('div', { class: 'actions' }, [button(t('back'), function () { stepTo(2); }), button(t('send'), send, 'btn')]));
    } else {
      title.textContent = t(flow.withConcern ? 'tc' : 't4');
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
    var words = concernsOpen ? f.concern.description.trim() : '';
    f.withConcern = words !== '';
    var payload = { building: f.building.id, answers: f.answers, lang: lang };
    if (f.withConcern) {
      payload.concern = { description: words };
      if (f.concern.afterDisaster) payload.concern.afterDisaster = f.concern.afterDisaster;
      if (photosOpen && f.concern.photos.length) payload.concern.photos = f.concern.photos;
    }
    fetch('/api/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
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
        if (j) { f.request = j.entity; f.decision = j.decision; f.concernDecision = j.concernDecision; f.query = j.query; showDev(); }
        // With a description, the result is the concern (it comes after the check).
        var result = j && j.entity && (f.withConcern ? j.entity.concern : j.entity.check);
        if (result && typeof result.value === 'string') { f.state = 'done'; showFlow(); return; }
        // The check is there but the concern will not come (scene B was switched
        // off) or is late (2 minutes): show the check, and say so.
        var checked = j && j.entity && j.entity.check && typeof j.entity.check.value === 'string';
        if (f.withConcern && checked && (j.concerns === false || Date.now() - f.sentAt > 2 * 60000)) {
          f.withConcern = false; f.notRead = true; f.state = 'done'; showFlow(); return;
        }
        if (res.status === 404 || res.status === 400) { f.state = 'failed'; f.error = 'e_lost'; showFlow(); return; }
        var waited = Date.now() - f.sentAt;
        if (waited > GIVE_UP_MS) { f.state = 'gaveUp'; showFlow(); return; }
        if (waited > SLOW_MS && f.state !== 'slow') { f.state = 'slow'; showFlow(); }
        setTimeout(function () { poll(f, id); }, waited > SLOW_MS ? 10000 : 2000);
      });
  }

  function resultView() {
    var again = el('div', { class: 'actions' }, [button(t('again'), function () { flow = null; showFlow(); showDev(); window.scrollTo({ top: 0, behavior: 'smooth' }); focusHeading(document.getElementById('examples').hidden ? 'map-title' : 'examples-title'); })]);
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
    // While waiting, the visitor may leave: the request is decided anyway.
    if (flow.state !== 'done') return [el('p', { class: 'muted' }, [t(flow.state === 'slow' ? 'slow' : 'waiting')]), again];
    if (flow.withConcern) return concernView(again).concat([sentView()]);
    var check = flow.request.check;
    var action = check.value;
    // The rule's index as the bridge writes it ("0" to "5"), or "default" (building-check-priority v1).
    var rule = check.policyRule && /^[0-5]$/.test(String(check.policyRule.value)) ? 'r' + check.policyRule.value : 'rd';
    return (flow.notRead ? [el('p', { class: 'note' }, [t('notRead')])] : []).concat([
      pathView({ facts: checkFacts(), uses: CHECK_USES[rule] || [], rule: t(rule), action: action, short: t('a_' + action),
        // Rule 5 asks again for the hazard data, not for papers.
        next: t(rule === 'r5' ? 'n_hazard' : 'n_' + action) }),
      el('p', { class: 'note' }, [t('care')]),
      again,
      sentView(),
    ]);
  }

  /** The answer first, large, with why in plain words and what would happen next; its edge shows the urgency. */
  function answerCard(action, answer, why, next) {
    return el('div', { class: 'answer v-' + action }, [
      el('p', { class: 'answer-label' }, [t('resultLabel')]),
      el('h3', { class: 'answer-title' }, [answer]),
      why ? el('p', { class: 'answer-why' }, [el('strong', {}, [t('why') + ': ']), why]) : null,
      el('p', { class: 'answer-next' }, [next]),
    ]);
  }

  // What each rule reads (pointsman-config profiles/building-check-priority.yaml and
  // building-concern.yaml), to mark those facts and answers in the decision path.
  var CHECK_USES = { r0: ['year', 'structure'], r1: ['year', 'structure'], r2: ['year'], r3: ['year', 'structure', 'ground', 'shaking'], r4: ['flood'], r5: ['year', 'structure', 'ground', 'shaking'], rd: [] };
  var CONCERN_USES = { c0: ['about_building', 'danger_now'], c1: ['danger_now', 'damage'], c2: ['severity', 'damage'], c3: ['damage', 'priority'], c4: ['danger_now'], c5: ['damage'], c6: ['damage', 'danger_now'], c7: ['damage'], c8: ['priority'], cd: [] };

  /** The facts of a Decision entity as stored (a JSON property, a list): by fact name. */
  function factsOf(decision) {
    if (!decision) return {};
    var key = Object.keys(decision).find(function (k) { return /facts$/.test(k); });
    var a = key && decision[key];
    var v = a && (a.json !== undefined ? a.json : a.value !== undefined ? a.value : a['@value']);
    var o = {};
    if (Array.isArray(v)) v.forEach(function (x) { if (x && x.name) o[x.name] = x; });
    return o;
  }

  /** The facts Pointsman had for the building: its data (or the visitor's answers) and the hazard layers. */
  function checkFacts() {
    var p = flow.building.properties;
    var f = factsOf(flow.decision);
    var rankOf = function (name) {
      var x = f[name];
      if (!x) return null;
      // Rank 0 (or none): the place is outside the layer's areas.
      return x.missing ? t('unknown') : x.values && x.values.rank ? t('rank', { n: x.values.rank }) : t('none');
    };
    var year = flow.known.year ? p.yearOfConstruction : flow.answers.yearOfConstruction;
    var structure = flow.known.structure ? name(STRUCTURE, p.structure) : flow.answers.wood === undefined ? null : t(flow.answers.wood ? 'wood' : 'notWood');
    var flood = rankOf('flood') || (p.flood ? t('floodValue', { depth: p.flood.depth.toFixed(1), rank: name(FLOOD_RANK, p.flood.rank) || p.flood.rank }) : t('none'));
    return [
      ['year', t('year'), year === undefined || year === null ? t('unknown') : String(year)],
      ['structure', t('structure'), structure || t('unknown')],
      ['ground', t('fGround'), rankOf('ground')],
      ['shaking', t('fShaking'), rankOf('shaking')],
      ['flood', t('flood'), flood],
    ].filter(function (r) { return r[2] !== null; });
  }

  function bar(share, kind) {
    var n = Math.max(0, Math.min(100, Math.round(share * 100)));
    return el('span', { class: 'pbar' + (kind ? ' ' + kind : ''), 'aria-hidden': 'true' }, [el('i', { style: 'width:' + n + '%' })]);
  }

  /** The AI's answers as rows: the question, the answer, and its probability as a bar; a choice shows its top three. */
  function questionRows(a, uses) {
    var rows = [];
    var row = function (name, q, answer, share, label, kind) {
      var used = uses.indexOf(name) >= 0;
      return el('li', { class: 'q-row' + (used ? ' used' : '') }, [
        el('span', { class: 'q-q' }, [q].concat(used ? [el('span', { class: 'use-tag' }, [t('usedTag')])] : [])),
        el('strong', { class: 'q-a' }, [answer]),
        el('span', { class: 'q-p' }, [bar(share, kind), el('span', {}, [label])]),
      ]);
    };
    var yesOf = function (x) { return typeof x.probability === 'number' ? (x.value ? x.probability : 1 - x.probability) : null; };
    if (a.about_building && typeof a.about_building.value === 'boolean') {
      var y0 = yesOf(a.about_building);
      if (y0 !== null) rows.push(row('about_building', t('qAbout'), a.about_building.value ? t('yes') : t('no'), y0, t('chance') + ' ' + Math.round(y0 * 100) + ' %'));
    }
    if (a.damage && typeof a.damage.value === 'string') {
      var probs = a.damage.probabilities && typeof a.damage.probabilities === 'object' ? a.damage.probabilities : null;
      var top = probs ? Object.keys(probs).filter(function (k) { return typeof probs[k] === 'number'; }).sort(function (x, y) { return probs[y] - probs[x]; }).slice(0, 3) : [];
      var used = uses.indexOf('damage') >= 0;
      if (top.length) {
        rows.push(el('li', { class: 'q-row choice' + (used ? ' used' : '') }, [
          el('span', { class: 'q-q' }, [t('qDamage')].concat(used ? [el('span', { class: 'use-tag' }, [t('usedTag')])] : [])),
          el('ul', { class: 'q-choices' }, top.map(function (k) {
            return el('li', { class: k === a.damage.value ? 'top' : '' }, [el('span', { class: 'q-a' }, [t('d_' + k)]), el('span', { class: 'q-p' }, [bar(probs[k]), el('span', {}, [Math.round(probs[k] * 100) + ' %'])])]);
          })),
        ]));
      } else if (typeof a.damage.probability === 'number') {
        rows.push(row('damage', t('qDamage'), t('d_' + a.damage.value), a.damage.probability, Math.round(a.damage.probability * 100) + ' %'));
      }
    }
    if (a.danger_now && typeof a.danger_now.value === 'boolean') {
      var y1 = yesOf(a.danger_now);
      if (y1 !== null) rows.push(row('danger_now', t('qDanger'), a.danger_now.value ? t('yes') : t('no'), y1, t('dangerChance', { n: Math.round(y1 * 100) }), 'danger'));
    }
    if (a.severity && typeof a.severity.value === 'number') {
      // The rules read the expected score (sum of level x probability), not the most likely level.
      var lv = a.severity.probabilities && typeof a.severity.probabilities === 'object' ? a.severity.probabilities : null;
      var score = a.severity.value;
      if (lv) {
        var sum = 0, tot = 0;
        Object.keys(lv).forEach(function (k) { if (/^[0-4]$/.test(k) && typeof lv[k] === 'number') { sum += Number(k) * lv[k]; tot += lv[k]; } });
        if (tot > 0) score = sum / tot;
      }
      score = Math.max(0, Math.min(4, score));
      rows.push(row('severity', t('qSeverity'), t('sev' + Math.round(score)), score / 4, t('nOf4', { n: (Math.round(score * 10) / 10).toString() }), 'scale'));
    }
    return rows;
  }

  /**
   * The decision as a path, the same in both scenes: what Pointsman got (facts
   * and the visitor's input), the AI's answers with their probabilities, the
   * rule that decided (with what it read marked), and the decision.
   */
  function pathView(o) {
    var mark = function (rows) {
      return el('ul', { class: 'path-facts' }, rows.map(function (r) {
        var used = o.uses.indexOf(r[0]) >= 0;
        return el('li', { class: used ? 'used' : '' }, [el('span', { class: 'fact-label' }, [r[1]].concat(used ? [el('span', { class: 'use-tag' }, [t('usedTag')])] : [])), el('strong', {}, [r[2]])]);
      }));
    };
    var inputs = [el('div', { class: 'path-box' }, [el('p', { class: 'path-label' }, [t('pathFacts')]), mark(o.facts)])];
    if (o.input) inputs.push(el('div', { class: 'path-box' }, [el('p', { class: 'path-label' }, [t('pathInput')]), o.input]));
    var parts = [el('div', { class: 'path-inputs' }, inputs)];
    var arrow = function (text) { return el('p', { class: 'path-arrow' }, [el('span', { 'aria-hidden': 'true' }, ['\u2193']), ' ', text]); };
    if (o.questions && o.questions.length) {
      parts.push(arrow(t('pathAi')), el('ul', { class: 'path-box q-rows' }, o.questions));
      parts.push(arrow(t('pathRule')));
    } else {
      // The description was read by the AI, but its answers are not in hand: say so, not "no AI".
      parts.push(arrow(t(o.ai ? 'pathAiMissing' : 'pathNoAi')));
    }
    parts.push(el('p', { class: 'path-box path-rule' }, [o.rule, ' ', el('span', { class: 'path-then' }, ['\u2192 ' + o.short])]));
    parts.push(arrow(t('pathDecision')), answerCard(o.action, o.short, null, o.next));
    return el('div', { class: 'path' }, parts);
  }

  /** What was sent, folded: the building's values and the answers, each with where it came from. */
  function sentView() {
    var dl = el('dl');
    summaryRows().forEach(function (r) { dl.append(el('dt', {}, [r[0]]), el('dd', {}, r[1])); });
    return el('details', { class: 'sent' }, [el('summary', {}, [t('sentTitle')]), dl]);
  }

  /** The answers of a Decision entity as stored (full IRIs, a JSON property): by question name. */
  function answersOf(decision) {
    if (!decision) return {};
    var key = Object.keys(decision).find(function (k) { return /answers$/.test(k); });
    var a = key && decision[key];
    var v = a && (a.json !== undefined ? a.json : a.value !== undefined ? a.value : a['@value']);
    if (Array.isArray(v)) { var o = {}; v.forEach(function (x) { if (x && x.name) o[x.name] = x; }); return o; }
    return v && typeof v === 'object' ? v : {};
  }

  /** Scene B: the concern's decision as a path, with the building's check priority as one of the facts. */
  function concernView(again) {
    var c = flow.request.concern;
    var action = c.value;
    // The rule's index as the bridge writes it ("0" to "8", building-concern v1), or "default".
    var rule = c.policyRule && /^[0-8]$/.test(String(c.policyRule.value)) ? 'c' + c.policyRule.value : 'cd';
    var uses = CONCERN_USES[rule] || [];
    var check = flow.request.check;
    var facts = checkFacts();
    if (check && typeof check.value === 'string') facts.push(['priority', t('fPriority'), t('a_' + check.value)]);
    var input = [el('blockquote', { class: 'quote' }, [flow.concern.description.trim()])];
    if (flow.concern.photos && flow.concern.photos.length) input.push(el('div', { class: 'photos' }, flow.concern.photos.map(function (src) { return el('img', { src: src, alt: '' }); })));
    return [
      pathView({ facts: facts, input: el('div', {}, input), questions: questionRows(answersOf(flow.concernDecision), uses), ai: true, uses: uses, rule: t(rule), action: action, short: t('ca_' + action), next: t('cn_' + action) }),
      el('p', { class: 'note' }, [t('care')]),
      again,
    ];
  }

  function showDev() {
    var req = document.getElementById('dev-request');
    var dec = document.getElementById('dev-decision');
    req.textContent = flow && flow.request ? 'GET /ngsi-ld/v1' + flow.query + '\n\n' + JSON.stringify(flow.request, null, 2) : '';
    dec.textContent = flow && flow.decision ? JSON.stringify(flow.decision, null, 2) : '';
    var con = document.getElementById('dev-concern');
    con.textContent = flow && flow.concernDecision ? JSON.stringify(flow.concernDecision, null, 2) : '';
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
    if (!drawn) m.once('idle', function () { drawn = true; mapSlow = false; showStatus(); });
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
  // --- How it works: the chain of profiles as a diagram (as in the roads demo) ---------
  // Pointsman's GET /v1/profiles/{id}/graph through the demo's server (/api/graph),
  // fetched once per language when the dialog first opens; left out until it works.
  var graphSvg = {};
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var SVG_ELEMENTS = ['svg', 'style', 'defs', 'marker', 'path', 'line', 'rect', 'text', 'tspan', 'title', 'g'];
  var SVG_ATTRS = ['class', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'rx', 'd', 'viewBox', 'refX', 'refY', 'markerWidth',
    'markerHeight', 'orient', 'marker-end', 'textLength', 'lengthAdjust', 'id', 'role', 'aria-label'];

  /** The diagram with only plain drawing elements and attributes kept: no scripts, links or outside resources. */
  function cleanSvg(text) {
    if (!text) return null;
    var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    var svg = doc.documentElement;
    if (!svg || svg.namespaceURI !== SVG_NS || svg.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null;
    var keep = function (n) { return n.namespaceURI === SVG_NS && SVG_ELEMENTS.indexOf(n.localName) >= 0; };
    Array.prototype.slice.call(svg.getElementsByTagName('*')).forEach(function (n) { if (!keep(n) && n.parentNode) n.parentNode.removeChild(n); });
    [svg].concat(Array.prototype.slice.call(svg.getElementsByTagName('*'))).forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var ok = SVG_ATTRS.indexOf(a.localName) >= 0 && !a.namespaceURI
          // Pointsman's own ids only (pm-…), so none can shadow an id of the page.
          && !(a.localName === 'id' && !/^pm-[A-Za-z0-9_.-]+$/.test(a.value))
          // A marker is referenced only within the diagram.
          && !(a.localName === 'marker-end' && !/^url\(#[A-Za-z0-9_.-]+\)$/.test(a.value));
        if (!ok && !(n === svg && a.name === 'xmlns')) n.removeAttribute(a.name);
      });
    });
    Array.prototype.slice.call(svg.getElementsByTagName('style')).forEach(function (st) {
      // No outside resources; a backslash could hide @import or url( behind CSS escapes.
      if (/@import|url\(|\\/i.test(st.textContent)) st.parentNode.removeChild(st);
    });
    return document.importNode(svg, true);
  }

  function renderHowGraph() {
    var spot = document.getElementById('how-graph');
    var l = lang;
    var draw = function () {
      if (!graphSvg[l] || lang !== l) return;
      spot.replaceChildren(el('div', { class: 'graph' }, [
        el('p', { class: 'kicker' }, [t('graphKicker')]),
        el('p', {}, [t('graphText')]),
        el('div', { class: 'graph-svg', tabindex: '0', role: 'region', 'aria-label': t('graphKicker') }, [graphSvg[l].cloneNode(true)]),
        el('a', { href: '/api/graph?format=dmn&lang=' + l, download: '' }, [t('graphDmn')]),
      ]));
    };
    spot.replaceChildren();
    if (graphSvg[l]) { draw(); return; }
    if (graphSvg[l] === null) return; // fetching
    graphSvg[l] = null;
    fetch('/api/graph?format=svg&lang=' + l).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; }).then(function (text) {
      var svg = cleanSvg(text);
      if (!svg) { delete graphSvg[l]; return; } // tried again the next time the dialog opens
      graphSvg[l] = svg;
      if (document.getElementById('how').open) draw();
    });
  }

  var howPressOutside = false;
  // Without <dialog>: the button that opened the panel, to give focus back on close (a dialog does that itself).
  var howOpener = null;
  function outsideDialog(e) {
    var b = document.getElementById('how').getBoundingClientRect();
    return e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom;
  }

  function setHow(open) {
    var d = document.getElementById('how');
    // Browsers without <dialog> (Safari before 15.4): shown in place, without the modal.
    // The attribute, not .open: without <dialog> support (Safari before 15.4) there is no .open.
    var shown = d.hasAttribute('open');
    if (open && !shown) { renderHowGraph(); if (d.showModal) d.showModal(); else { howOpener = document.activeElement; d.setAttribute('open', ''); d.scrollIntoView({ block: 'start' }); document.getElementById('how-close').focus(); } }
    if (!open && shown) { if (d.close) d.close(); else { d.removeAttribute('open'); if (howOpener && howOpener.focus) howOpener.focus(); } }
    document.getElementById('how-toggle').setAttribute('aria-expanded', String(open));
  }
  document.getElementById('how-toggle').addEventListener('click', function () { setHow(!document.getElementById('how').hasAttribute('open')); });
  // Escape closes the dialog by itself; so does a click on the dark area around it.
  document.getElementById('how').addEventListener('close', function () {
    document.getElementById('how-toggle').setAttribute('aria-expanded', 'false');
    // The diagram's own style element goes with it.
    document.getElementById('how-graph').replaceChildren();
  });
  document.getElementById('how').addEventListener('click', function (e) {
    // Only a click on the dark area: the dialog itself (its padding too) is the target as well,
    // and a text selection that ends outside must not close it (the press started inside).
    if (e.target !== e.currentTarget || !howPressOutside) return;
    if (outsideDialog(e)) setHow(false);
  });
  document.getElementById('how').addEventListener('pointerdown', function (e) { howPressOutside = e.target === e.currentTarget && outsideDialog(e); });
  document.getElementById('how-close').addEventListener('click', function () { setHow(false); document.getElementById('how-toggle').focus(); });

  // The developer view: a panel at the right on wide screens, a drawer at the bottom on narrow ones (as in the roads demo).
  var devButton = document.getElementById('dev-toggle');
  function setDev(on, remember) {
    if (remember !== false) try { localStorage.setItem('dev', on ? '1' : '0'); } catch (e) {}
    document.getElementById('dev').hidden = !on;
    document.body.classList.toggle('dev-open', on);
    devButton.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (map) setTimeout(function () { map.resize(); }, 0);
  }
  devButton.addEventListener('click', function () { setDev(devButton.getAttribute('aria-pressed') !== 'true'); });
  document.getElementById('dev-close').addEventListener('click', function () { setDev(false); devButton.focus(); });

  // The panel's left edge makes it wider or narrower (wide screens). Remembered.
  var SIDE_MIN = 320;
  var sideWanted = 440;
  var grip = document.querySelector('.side-grip');
  function sideWidth() { return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--side-w'), 10) || 440; }
  function setSideWidth(w) {
    // At least 480 px left for the page, after its margins (16 px on each side, style.css).
    var max = Math.max(SIDE_MIN, Math.min(900, document.documentElement.clientWidth - 480 - 32));
    w = Math.round(Math.min(max, Math.max(SIDE_MIN, w)));
    document.documentElement.style.setProperty('--side-w', w + 'px');
    grip.setAttribute('aria-valuenow', String(w));
    grip.setAttribute('aria-valuetext', w + ' px');
    grip.setAttribute('aria-valuemin', String(SIDE_MIN));
    grip.setAttribute('aria-valuemax', String(max));
    return w;
  }
  (function () {
    var saved = 0;
    try { saved = Number(localStorage.getItem('sideW')) || 0; } catch (e) {}
    sideWanted = saved || 440;
    setSideWidth(sideWanted);
    var save = function (w) { sideWanted = w; try { localStorage.setItem('sideW', String(w)); } catch (e) {} if (map) map.resize(); };
    // A smaller window narrows the panel; a larger one gives back the chosen width.
    window.addEventListener('resize', function () { setSideWidth(sideWanted); });
    grip.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
      var move = function (ev) { setSideWidth(document.documentElement.clientWidth - ev.clientX); };
      var up = function () {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        document.body.classList.remove('resizing');
        save(sideWidth());
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    grip.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      save(setSideWidth(sideWidth() + (e.key === 'ArrowLeft' ? 24 : -24)));
    });
  })();

  // The panel starts below the sticky header, whatever its height.
  function headerHeight() { document.documentElement.style.setProperty('--top-h', document.querySelector('.top').offsetHeight + 'px'); }
  window.addEventListener('resize', headerHeight);
  if (window.ResizeObserver) new ResizeObserver(headerHeight).observe(document.querySelector('.top'));
  headerHeight();
  // On narrow screens the drawer covers the page: it opens only when asked.
  (function () {
    var on = false;
    try { on = localStorage.getItem('dev') === '1'; } catch (e) {}
    setDev(on && window.matchMedia('(min-width: 1100px)').matches, false);
  })();

  // The area, also when /api/config does not answer (as in src/index.ts).
  var AREA = [141.4370, 42.9745, 141.4630, 42.9840];
  applyLang();
  fetch('/api/config').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (config) {
    checksOpen = !!(config && config.checks);
    concernsOpen = !!(config && config.concerns);
    photosOpen = !!(config && config.photos);
    showBuilding();
    map = makeMap(config && Array.isArray(config.area) ? config.area : AREA);
    return fetch('/api/buildings');
  }).then(function (r) {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }).then(function (j) {
    data = j;
    showExamples();
    document.getElementById('dev-list').textContent = 'GET /ngsi-ld/v1' + j.query + '&limit=1000&offset=0\n\n→ ' + j.features.length + ' Building entities';
    showStatus();
    // A map whose style never finishes (lost WebGL, a broken style) would keep
    // the note up: it goes once the buildings have had their chance.
    setTimeout(function () { if (!drawn) { mapSlow = true; showStatus(); } }, 15000);
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
