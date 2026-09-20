/* Обмер деталей АК-74 по исходной геометрии (в мм). */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../src/models/ak74_geometry.js'), 'utf8');
const sandbox = { module: { exports: {} }, console };
const run = new Function('window', src + '\nreturn __AKM;');
const AKM = run({});
const G = AKM.geom;
const H = AKM.helpers(G);
const M = AKM.model(G, H, [AKM.p_receiver, AKM.p_barrel, AKM.p_furn, AKM.p_mag, AKM.p_intern], {});
const box = (g) => {
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < g.p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], g.p[i + k]);
      mx[k] = Math.max(mx[k], g.p[i + k]);
    }
  return mn.concat(mx).map((v) => Math.round(v));
};
const out = {};
for (const p of M.parts) out[p.name] = box(p.geo);
console.log(JSON.stringify(out, null, 0));
console.log('NODES', JSON.stringify(M.nodes));
