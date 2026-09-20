#!/usr/bin/env node
/* ============================================================================
   Проверки системы модулей без браузера: физика посадки, каталог, прицелы.
   Запуск: node tools/test.js
   ========================================================================== */
'use strict';
const P = require('./probe.js');
const { G, SYS, REG, SLOTS, bbox } = P;

let failed = 0, passed = 0;
const ok = (cond, what, extra) => {
  if (cond) { passed++; return; }
  failed++;
  console.log('  ПРОВАЛ:', what, extra === undefined ? '' : JSON.stringify(extra));
};
const group = (name) => console.log('\n' + name);

/* собрать оружие с заданной конфигурацией */
function assemble(weaponKey, cfg) {
  const d = SLOTS[weaponKey];
  const weapon = { caliber: d.caliber, weight: d.weight, ballistics: d.ballistics,
    stats: {}, base: [], nodes: {}, slots: d.slots };
  return SYS.assemble(weapon, REG, cfg || d.defaults);
}

/* габарит деталей одного слота */
function slotBox(asm, slotKey) {
  const parts = asm.parts.filter((p) => p.src === slotKey);
  if (!parts.length) return null;
  return bbox(G.merge(parts.map((p) => p.geo)));
}

const WEAPONS = ['akm', 'ak74'];

/* --- 2. Барабан на 75 снят с вооружения ---------------------------------- */
group('Каталог');
ok(!REG.has('mag_drum_75'), 'барабан 75 удалён из каталога');

/* --- 3. Список слота: только то, что реально встаёт -----------------------
   Повторяет логику интерфейса (accepts + checkFit). Серых «ненажимаемых»
   карточек быть не должно, но и пустым список оставаться не может. */
function optionsFor(weaponKey, slot) {
  const accepts = SYS.slotAccepts(slot);
  const face = SYS.slotFace(slot);
  const out = [];
  for (const key of REG.keys()) {
    let meta;
    const opts = (slot.length && REG.fitsLength(key)) ? { len: slot.length } : {};
    try { meta = REG.meta(key, opts); } catch (e) { continue; }
    const wants = meta.slot === 'optic' && face === 'side' && meta.canBeOffset
      ? 'optic_offset' : meta.slot;
    if (accepts.indexOf(wants) < 0) continue;
    const fit = SYS.checkFit(slot, Object.assign({ key }, meta),
      { caliber: SLOTS[weaponKey].caliber }, {});
    if (fit.ok) out.push(key);
  }
  return out;
}
for (const w of WEAPONS) {
  const asm = assemble(w);
  const slots = SLOTS[w].slots.concat(asm.slotsDynamic || []);
  for (const s of slots) {
    const opts = optionsFor(w, s);
    ok(opts.length > 0, w + ': у слота ' + s.key + ' есть хотя бы один модуль');
    /* штатный модуль обязан оставаться в списке своего слота */
    const def = SLOTS[w].defaults[s.key];
    if (def) ok(opts.indexOf(def) >= 0, w + ': штатный ' + def + ' доступен в слоте ' + s.key, opts);
  }
}

/* Ключевые модули должны быть доступны на обеих моделях. */
for (const w of WEAPONS) {
  const hg = SLOTS[w].slots.find((s) => s.key === 'handguard');
  const opts = optionsFor(w, hg);
  for (const need of ['handguard_wood', 'handguard_mlok', 'handguard_quad'])
    ok(opts.indexOf(need) >= 0, w + ': цевьё ' + need + ' помещается в посадочное место', opts);
  const mount = SLOTS[w].slots.find((s) => s.key === 'mount');
  if (mount) ok(optionsFor(w, mount).indexOf('mount_topcover_rail') >= 0,
    w + ': «горка» доступна в слоте кронштейна');
}

/* --- 6. Модули не встают «не туда» -------------------------------------- */
group('Физика посадки');
for (const w of WEAPONS) {
  const asm = assemble(w, Object.assign({}, SLOTS[w].defaults,
    { handguard: 'handguard_quad' }));
  for (const d of asm.slotsDynamic || []) {
    const face = SYS.slotFace(d);
    const acc = SYS.slotAccepts(d);
    if (face === 'bottom')
      ok(acc.indexOf('optic') < 0, w + ': нижняя планка ' + d.key + ' не должна принимать прицел', acc);
    if (face === 'side')
      ok(acc.indexOf('under') < 0, w + ': боковая планка ' + d.key + ' не должна принимать сошки', acc);
    if (face === 'top')
      ok(acc.indexOf('under') < 0, w + ': верхняя планка ' + d.key + ' не должна принимать сошки', acc);
  }
}

/* --- 4. Модули не висят в воздухе: габариты пересекаются с оружием ------- */
/* Габарит оружия по слотам-носителям: приклад и цевьё должны стыковаться
   с коробкой, прицел — стоять на кронштейне, а не парить над ним. */
for (const w of WEAPONS) {
  const cfg = Object.assign({}, SLOTS[w].defaults,
    { mount: 'mount_dustcover', 'mount.top': 'reddot_t2' });
  const asm = assemble(w, cfg);
  const mount = slotBox(asm, 'mount');
  const optic = slotBox(asm, 'mount.top');
  ok(mount && optic, w + ': кронштейн и прицел собраны');
  if (mount && optic) {
    const gap = optic[1] - mount[4];             // низ прицела минус верх крышки
    ok(gap < 2, w + ': прицел не висит над кронштейном', { gap });
  }
  const stock = slotBox(asm, 'stock');
  if (stock) ok(stock[2] < 20, w + ': приклад начинается у торца коробки', { z0: stock[2] });
}

/* --- 5. Прицеливание: глаз всегда позади окуляра ------------------------- */
group('Прицеливание');
const OPTICS = ['reddot_t2', 'holo_exps3', 'reddot_rmr', 'scope_1_6x', 'scope_pso1'];
for (const key of OPTICS) {
  const meta = REG.meta(key);
  ok(meta.eyeRelief > 0, key + ': задано удаление зрачка', meta.eyeRelief);
  ok(meta.ocularZ !== undefined, key + ': задан срез окуляра');
  const built = REG.build(key, {});
  const bb = bbox(G.merge(built.parts.map((p) => p.geo)));
  const eye = meta.ocularZ + meta.eyeRelief;
  ok(eye > bb[5], key + ': глаз стоит позади всей геометрии прицела', { eye, back: bb[5] });
}
for (const w of WEAPONS) {
  for (const key of OPTICS) {
    if (key === 'scope_pso1') continue;         // проверяется отдельно ниже
    const asm = assemble(w, Object.assign({}, SLOTS[w].defaults,
      { mount: 'mount_dustcover', 'mount.top': key }));
    ok(!!asm.nodes.eye, w + '/' + key + ': есть точка глаза');
    if (!asm.nodes.eye) continue;
    const optic = slotBox(asm, 'mount.top');
    ok(asm.nodes.eye[2] > optic[5], w + '/' + key + ': глаз позади прицела',
      { eyeZ: asm.nodes.eye[2], back: optic[5] });
  }
}

/* ПСО-1 идёт со своим кронштейном и садится на «ласточкин хвост». */
for (const w of WEAPONS) {
  const asm = assemble(w, Object.assign({}, SLOTS[w].defaults, { sideoptic: 'scope_pso1' }));
  ok(!!asm.activeOptic, w + ': ПСО-1 становится активным прицелом');
  const box = slotBox(asm, 'sideoptic');
  ok(box && asm.nodes.eye[2] > box[5], w + ': глаз позади ПСО-1',
    { eyeZ: asm.nodes.eye && asm.nodes.eye[2], back: box && box[5] });
  /* прицел висит слева от коробки, а не парит над ней */
  ok(box && box[0] < -20 && box[3] < 30, w + ': ПСО-1 стоит слева от коробки', box);
}

/* --- 7. Приборы не берутся из воздуха ------------------------------------ */
group('Свет и лазер');
for (const w of WEAPONS) {
  const bare = assemble(w, SLOTS[w].defaults);
  ok((bare.emitters || []).length === 0,
    w + ': на штатной сборке нет ни фонаря, ни ЛЦУ', bare.emitters.map((e) => e.type));
  const withLight = assemble(w, Object.assign({}, SLOTS[w].defaults,
    { handguard: 'handguard_quad', 'handguard.left': 'light_tac' }));
  ok((withLight.emitters || []).some((e) => e.type === 'light'),
    w + ': установленный фонарь даёт источник света');
}

/* --- сборка всех сочетаний не падает ------------------------------------- */
group('Устойчивость сборки');
for (const w of WEAPONS) {
  for (const key of REG.keys()) {
    let meta;
    try { meta = REG.meta(key); } catch (e) { continue; }
    const slot = SLOTS[w].slots.find((s) => SYS.slotAccepts(s).indexOf(meta.slot) >= 0);
    if (!slot) continue;
    try {
      const asm = assemble(w, Object.assign({}, SLOTS[w].defaults, { [slot.key]: key }));
      ok(asm.errors.length === 0, w + '/' + key + ': сборка без ошибок', asm.errors);
    } catch (e) {
      ok(false, w + '/' + key + ': исключение при сборке', e.message);
    }
  }
}

console.log('\nПройдено ' + passed + ', провалено ' + failed);
process.exit(failed ? 1 : 0);
