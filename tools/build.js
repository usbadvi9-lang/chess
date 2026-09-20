#!/usr/bin/env node
/* ============================================================================
   Сборка автономных HTML-страниц из исходников.

   Каждая страница — один файл без внешних зависимостей кроме three.js с CDN:
     · бандл системы кастомизации (src/kernel.js + src/attach/* + адаптеры);
     · интерфейс кастомизации (генерируется src/attach/ui.js);
     · интеграция кастомизации для конкретного оружия;
     · процедурная геометрия модели;
     · приложение-вьюер (src/app/viewer.js).
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* модули бандла в порядке объявления */
const MODULES = [
  ['kernel', 'src/kernel.js'],
  ['common', 'src/attach/common.js'],
  ['optics', 'src/attach/optics.js'],
  ['muzzle', 'src/attach/muzzle.js'],
  ['tactical', 'src/attach/tactical.js'],
  ['mags_stocks', 'src/attach/mags_stocks.js'],
  ['system', 'src/attach/system.js'],
  ['occlude', 'src/attach/occlude.js'],
  ['ui', 'src/attach/ui.js'],
  ['three_adapter', 'src/adapters/three_adapter.js'],
  ['raw_adapter', 'src/adapters/raw_adapter.js'],
  ['slots', 'src/attach/slots.js']
];

function bundle() {
  const parts = [];
  parts.push('/* ============================================================================');
  parts.push('   СИСТЕМА КАСТОМИЗАЦИИ — единый бандл (генерируется tools/build.js).');
  parts.push('   Источники: src/kernel.js, src/attach/*.js, src/adapters/*.js');
  parts.push('   Не редактируйте этот блок вручную: правьте исходники и пересоберите.');
  parts.push('   ========================================================================== */');
  parts.push('const __ATTACH = (function () {');
  parts.push('  const __M = {};');
  parts.push('  const __C = {};');
  parts.push('  function __def(n, f) { __M[n] = f; }');
  parts.push('  function __req(n) {');
  parts.push('    if (__C[n]) return __C[n].exports;');
  parts.push('    const m = { exports: {} };');
  parts.push('    __C[n] = m;');
  parts.push('    __M[n](m, m.exports);');
  parts.push('    return m.exports;');
  parts.push('  }');
  parts.push('');
  for (const [name, file] of MODULES) {
    parts.push('__def("' + name + '", function (module, exports) {');
    parts.push(read(file).replace(/\s+$/, ''));
    parts.push('});');
    parts.push('');
  }
  parts.push("  const G = __req('kernel');");
  parts.push("  const C = __req('common')(G);");
  parts.push("  const SYS = __req('system')(G, C);");
  parts.push('  const CATALOGS = [');
  parts.push("    __req('optics')(G, C), __req('muzzle')(G, C),");
  parts.push("    __req('tactical')(G, C), __req('mags_stocks')(G, C)");
  parts.push('  ];');
  parts.push('  const REG = SYS.registry(CATALOGS);');
  parts.push("  const ADAPTER = __req('three_adapter')(G, C);");
  parts.push("  const RAW = __req('raw_adapter')(G, C);");
  parts.push("  const OCC = __req('occlude')();");
  parts.push("  const UI = __req('ui')();");
  parts.push("  const SLOTS = __req('slots');");
  parts.push('  return { G, C, SYS, REG, ADAPTER, RAW, OCC, UI, SLOTS, catalogs: CATALOGS };');
  parts.push('})();');
  return parts.join('\n');
}

/* интерфейс кастомизации — исходник генерирует сам модуль ui */
function uiSource() {
  const m = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', read('src/attach/ui.js'))(m, m.exports);
  return m.exports().source();
}

/* интеграция для конкретного оружия: подстановка ключа и карты скрытия */
function integration(weaponKey, hideByName) {
  return read('src/attach/integration.js')
    .replace(/__WEAPON_KEY__/g, JSON.stringify(weaponKey))
    .replace(/__HIDE_BY_NAME__/g, JSON.stringify(hideByName));
}

const TARGETS = require('./targets.js');

function buildTarget(t) {
  const html = read(t.shell)
    .replace('/*__ATTACH_BUNDLE__*/', () => bundle())
    .replace('/*__ATTACH_UI__*/', () => uiSource())
    .replace('/*__ATTACH_INTEGRATION__*/', () => integration(t.weapon, t.hide))
    .replace('/*__MODEL__*/', () => t.model.map(read).join('\n\n'))
    .replace('/*__APP__*/', () => read(t.app))
    .replace(/__TITLE__/g, t.title);
  const out = path.join(ROOT, t.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return { out: t.out, bytes: Buffer.byteLength(html) };
}

const only = process.argv[2];
for (const t of TARGETS) {
  if (only && t.weapon !== only) continue;
  const r = buildTarget(t);
  console.log('собрано', r.out, (r.bytes / 1024).toFixed(0) + ' КБ');
}
