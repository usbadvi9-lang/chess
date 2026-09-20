/* ---- интеграция кастомизации (шаблон, подставляется tools/build.js) ---- */
const ATTACH_DEF = __ATTACH.SLOTS[__WEAPON_KEY__];
const ATTACH_STATE = {
  config: Object.assign({}, ATTACH_DEF.defaults),
  asm: null, view: null, ui: null,
  toggles: { light: 0, laser: 0, ir: 0, deploy: {} }
};
/* деталь базовой модели -> слот, который её заменяет (для точечного скрытия) */
const ATTACH_HIDE_BY_NAME = __HIDE_BY_NAME__;

/* Список модулей, подходящих слоту (для интерфейса).
   В списке остаётся только то, что реально встаёт на это место: серые
   «ненажимаемые» карточки не показываются, иначе меню забито мусором. */
function attachOptionsFor(slotKey) {
  const slot = attachSlots().find((s) => s.key === slotKey);
  if (!slot) return [];
  const accepts = __ATTACH.SYS.slotAccepts(slot);
  const out = [{ key: null, label: '— НЕТ —', fits: true }];
  for (const key of __ATTACH.REG.keys()) {
    let meta;
    /* модули с регулируемой длиной оцениваем уже подогнанными под слот */
    const opts = (slot.length && __ATTACH.REG.fitsLength(key)) ? { len: slot.length } : {};
    try { meta = __ATTACH.REG.meta(key, opts); } catch (e) { continue; }
    const face = __ATTACH.SYS.slotFace(slot);
    const wants = meta.slot === 'optic' && face === 'side' && meta.canBeOffset
      ? 'optic_offset' : meta.slot;
    if (accepts.indexOf(wants) < 0) continue;
    const fit = __ATTACH.SYS.checkFit(slot, Object.assign({ key }, meta),
      { caliber: ATTACH_DEF.caliber }, {});
    if (!fit.ok) continue;                    // несовместимое просто не предлагаем
    out.push({ key, label: meta.name, short: meta.short, fits: true });
  }
  return out;
}

/* Слоты: статические из описания + динамические от цевья. */
function attachSlots() {
  const base = ATTACH_DEF.slots.slice();
  if (ATTACH_STATE.asm && ATTACH_STATE.asm.slotsDynamic)
    for (const d of ATTACH_STATE.asm.slotsDynamic)
      if (!base.some((b) => b.key === d.key)) base.push(d);
  return base;
}

function attachNameOf(key) {
  try { return __ATTACH.REG.meta(key).name; } catch (e) { return String(key); }
}

/* Пересборка: снять старую группу, собрать новую, вернуть узлы. */
function attachRebuild(THREE, parent, baseParts, weaponNodes) {
  if (ATTACH_STATE.view) {
    parent.remove(ATTACH_STATE.view.root);
    ATTACH_STATE.view.dispose();
  }
  const weapon = {
    caliber: ATTACH_DEF.caliber, weight: ATTACH_DEF.weight,
    ballistics: ATTACH_DEF.ballistics, stats: {},
    base: baseParts || [], nodes: weaponNodes || {}, slots: attachSlots()
  };
  const asm = __ATTACH.SYS.assemble(weapon, __ATTACH.REG, ATTACH_STATE.config);
  const view = __ATTACH.ADAPTER.build(THREE, asm, { scale: 0.001 });
  parent.add(view.root);
  ATTACH_STATE.asm = asm;
  ATTACH_STATE.view = view;
  /* вернуть прежние состояния переключателей */
  view.setBeam('light', ATTACH_STATE.toggles.light);
  view.setBeam('laser', ATTACH_STATE.toggles.laser);
  view.setBeam('ir', ATTACH_STATE.toggles.ir);
  for (const k in ATTACH_STATE.toggles.deploy) view.setDeploy(k, ATTACH_STATE.toggles.deploy[k]);
  return asm;
}

/* Скрытие заменяемых деталей базовой модели: зоны включаются по конфигурации.
   Вызывается после каждой пересборки, поэтому снятие модуля возвращает
   исходную деталь на место. */
function attachOcclude(THREE, host) {
  if (!host) return null;
  return __ATTACH.OCC.apply(THREE, host, __WEAPON_KEY__, ATTACH_STATE.config, {
    names: ATTACH_HIDE_BY_NAME, groups: {}
  });
}

/* Публичный API: смена модулей из консоли, автотестов и внешнего интерфейса.
   Реальная функция подстановки регистрируется интеграцией оружия. */
window.ATTACH = {
  set(slotKey, moduleKey) {
    if (!ATTACH_STATE.apply) throw new Error('система ещё не готова');
    ATTACH_STATE.apply(slotKey, moduleKey);
    return window.__ATTACH_DEBUG();
  },
  get: () => Object.assign({}, ATTACH_STATE.config),
  slots: () => attachSlots().map((s) => s.key),
  options: (slotKey) => attachOptionsFor(slotKey),
  preset: {
    save: () => __ATTACH.SYS.presetCodec().encode(ATTACH_STATE.config),
    load(code) {
      const cfg = __ATTACH.SYS.presetCodec().decode(code);
      /* Слоты-потомки (планки цевья и кронштейна) появляются только после
         установки носителя, поэтому список слотов перечитывается на каждом
         шаге, а проход повторяется, пока не перестанут возникать новые. */
      const done = {};
      for (let pass = 0; pass < 4; pass++) {
        const keys = attachSlots().map((s) => s.key);
        let changed = false;
        for (const k of keys) {
          if (done[k]) continue;
          done[k] = true;
          changed = true;
          window.ATTACH.set(k, cfg[k] || null);
        }
        if (!changed) break;
      }
      return window.__ATTACH_DEBUG();
    }
  },
  beam: (kind, level) => ATTACH_STATE.view.setBeam(kind, level),
  deploy: (slotKey, t) => ATTACH_STATE.view.setDeploy(slotKey, t),
  stats: () => (ATTACH_STATE.asm ? ATTACH_STATE.asm.derived : {})
};

/* Отладочный хук: состояние сборки доступно из консоли и автотестов. */
window.__ATTACH_DEBUG = () => ({
  weapon: __WEAPON_KEY__,
  config: ATTACH_STATE.config,
  modules: ATTACH_STATE.asm ? Object.keys(ATTACH_STATE.asm.modules) : [],
  parts: ATTACH_STATE.asm ? ATTACH_STATE.asm.parts.length : 0,
  errors: ATTACH_STATE.asm ? ATTACH_STATE.asm.errors : [],
  warnings: ATTACH_STATE.asm ? ATTACH_STATE.asm.warnings : [],
  stats: ATTACH_STATE.asm ? ATTACH_STATE.asm.derived : {}
});

/* Управление с клавиатуры: TAB — панель, цифры — слот, стрелки — перебор. */

/* Есть ли на оружии прибор, который умеет светить/давать луч нужного типа.
   Физика простая: включать можно только то, что установлено. Клавиша не
   доставляет приборы «из воздуха» — она лишь щёлкает выключателем. */
function attachHasEmitter(kind) {
  const asm = ATTACH_STATE.asm;
  if (!asm) return false;
  for (const e of asm.emitters || []) {
    if (kind === 'light' && e.type === 'light') return true;
    if (kind === 'laser' && e.type === 'laser') return true;
    if (kind === 'ir' && e.type === 'ir') return true;
  }
  return false;
}

/* Короткое сообщение в панели: почему клавиша «не сработала». */
function attachNotify(text) {
  if (ATTACH_STATE.ui && ATTACH_STATE.ui.notify) ATTACH_STATE.ui.notify(text);
}

const BEAM_NAME = { light: 'фонарь', laser: 'ЛЦУ', ir: 'ИК-луч' };

function attachToggleBeam(kind) {
  if (!ATTACH_STATE.view) return;
  if (!attachHasEmitter(kind)) {
    /* прибора нет — гасим возможный остаточный флаг и сообщаем стрелку */
    ATTACH_STATE.toggles[kind] = 0;
    ATTACH_STATE.view.setBeam(kind, 0);
    attachNotify('Не установлен ' + (BEAM_NAME[kind] || kind) + ' — повесьте прибор на планку');
    return;
  }
  ATTACH_STATE.toggles[kind] = ATTACH_STATE.toggles[kind] ? 0 : 1;
  ATTACH_STATE.view.setBeam(kind, ATTACH_STATE.toggles[kind]);
}

/* После каждой пересборки: снятый прибор уносит с собой своё свечение. */
function attachSyncBeams() {
  for (const kind of ['light', 'laser', 'ir']) {
    if (!attachHasEmitter(kind)) ATTACH_STATE.toggles[kind] = 0;
    if (ATTACH_STATE.view) ATTACH_STATE.view.setBeam(kind, ATTACH_STATE.toggles[kind]);
  }
}

/* Складные узлы (сошки, приклад, магнифер) — то же правило: состояние
   живёт ровно столько, сколько стоит сам модуль. */
function attachSyncDeploy() {
  const asm = ATTACH_STATE.asm;
  const dep = ATTACH_STATE.toggles.deploy;
  for (const k in dep) if (!asm || !asm.modules[k]) delete dep[k];
  if (!ATTACH_STATE.view) return;
  for (const k in dep) ATTACH_STATE.view.setDeploy(k, dep[k]);
}

/* Модули, у которых есть подвижная часть. */
function attachFoldables() {
  const asm = ATTACH_STATE.asm;
  if (!asm) return [];
  return Object.keys(asm.modules).filter((sk) => {
    const m = asm.modules[sk].meta;
    return !!(m.deploy || m.fold || m.flipAxis || m.foldAxis);
  });
}

function attachBindKeys(onChange) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const ui = ATTACH_STATE.ui;
    if (e.code === 'Tab') { e.preventDefault(); if (ui) ui.toggle(!ui.visible()); return; }
    if (e.code === 'KeyC') { attachToggleBeam('light'); return; }
    if (e.code === 'KeyZ') { attachToggleBeam('laser'); return; }
    if (e.code === 'KeyX') { if (typeof window.__cycleFireMode === 'function') window.__cycleFireMode(); return; }
    if (e.code === 'KeyB') {
      const list = attachFoldables();
      if (!list.length) { attachNotify('Складывать нечего: сошки и складной приклад не установлены'); return; }
      for (const sk of list) {
        const cur = ATTACH_STATE.toggles.deploy[sk] || 0;
        const next = cur > 0.5 ? 0 : 1;
        ATTACH_STATE.toggles.deploy[sk] = next;
        ATTACH_STATE.view.setDeploy(sk, next);
      }
      return;
    }
    if (!ui || !ui.visible()) return;
    const slots = attachSlots();
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= slots.length) { ui.setActive(slots[n - 1].key); return; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const act = ui.getActive();
      if (!act) return;
      e.preventDefault();
      const opts = attachOptionsFor(act).filter((o) => o.fits);
      const cur = ATTACH_STATE.config[act] || null;
      let i = opts.findIndex((o) => o.key === cur);
      if (i < 0) i = 0;
      i = (i + (e.code === 'ArrowRight' ? 1 : opts.length - 1)) % opts.length;
      onChange(act, opts[i].key);
      ui.render();
    }
  });
}

