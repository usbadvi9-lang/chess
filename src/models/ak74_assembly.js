/* ================== СБОРКА THREE-ОБЪЕКТА ==================================
   Вся процедурная геометрия считается в миллиметрах и переводится в метры.
   ========================================================================= */
function buildAK74(THREE, opts) {
  opts = opts || {};
  const G = __AKM.geom;
  const H = __AKM.helpers(G);
  const M = __AKM.model(G, H,
    [__AKM.p_receiver, __AKM.p_barrel, __AKM.p_furn, __AKM.p_mag, __AKM.p_intern],
    { furniture: opts.furniture || 'wood' });

  /* ATTACH: детали, заменённые модулями */
  /* Дульный тормоз, цевьё, приклад и магазин приходят из системы модулей,
     поэтому одноимённые детали базовой модели исключаются из сборки. */
  if (opts.dropParts && opts.dropParts.length) {
    const drop = new Set(opts.dropParts);
    M.parts = M.parts.filter((p) => !drop.has(p.name));
    M.meshes = (function () {
      const buckets = {}, order = [];
      const GRP = {
        magBody: 'magazine', magLugFront: 'magazine', magLugRear: 'magazine',
        magMouth: 'magazine', magTopRound: 'magazine',
        boltCarrier: 'bolt', bolt: 'bolt', charging: 'bolt',
        trigger: 'trigger', selector: 'selector'
      };
      for (const p of M.parts) {
        const grp = GRP[p.name] || 'body', key = grp + '|' + p.mat;
        if (!buckets[key]) { buckets[key] = { group: grp, mat: p.mat, list: [] }; order.push(key); }
        buckets[key].list.push(p.geo);
      }
      return order.map((k) => ({ name: k, group: buckets[k].group, mat: buckets[k].mat,
        geo: G.merge(buckets[k].list) }));
    })();
  }

  const S = 0.001;                              // мм -> м
  const geos = [], matList = [], matMap = {};
  const DOUBLE = { bore: 1 };

  const mkMat = (key) => {
    if (matMap[key]) return matMap[key];
    const d = M.mats[key] || M.mats.park;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(d.color[0], d.color[1], d.color[2]),
      metalness: d.metal,
      roughness: d.rough
    });
    if (DOUBLE[key]) m.side = THREE.DoubleSide;
    if (key === 'wood' || key === 'woodDk') m.envMapIntensity = 0.6;
    matMap[key] = m; matList.push(m);
    return m;
  };

  const toGeo = (raw, off) => {
    const n = raw.p.length;
    const pos = new Float32Array(n), nrm = new Float32Array(n);
    const ox = off ? off[0] : 0, oy = off ? off[1] : 0, oz = off ? off[2] : 0;
    for (let i = 0; i < n; i += 3) {
      pos[i] = (raw.p[i] - ox) * S;
      pos[i + 1] = (raw.p[i + 1] - oy) * S;
      pos[i + 2] = (raw.p[i + 2] - oz) * S;
      nrm[i] = raw.n[i]; nrm[i + 1] = raw.n[i + 1]; nrm[i + 2] = raw.n[i + 2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.computeBoundingSphere();
    geos.push(g);
    return g;
  };

  const group = new THREE.Group();
  group.name = 'AK-74';
  const N = M.nodes;
  const PIV = {
    body: [0, 0, 0], magazine: [0, 0, 0], bolt: [0, 0, 0],
    trigger: N.triggerPivot, selector: N.selectorPivot
  };
  const SUB = { body: group };
  ['magazine', 'bolt', 'trigger', 'selector'].forEach((k) => {
    const g = new THREE.Group();
    g.name = k;
    g.position.set(PIV[k][0] * S, PIV[k][1] * S, PIV[k][2] * S);
    group.add(g);
    SUB[k] = g;
  });

  for (let i = 0; i < M.meshes.length; i++) {
    const m = M.meshes[i];
    const mesh = new THREE.Mesh(toGeo(m.geo, PIV[m.group] || [0, 0, 0]), mkMat(m.mat));
    mesh.name = m.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (SUB[m.group] || group).add(mesh);
  }

  /* ---- узлы-ориентиры (Object3D в системе оружия) ---- */
  const nodes = {};
  const nd = (name, v) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(v[0] * S, v[1] * S, v[2] * S);
    group.add(o);
    nodes[name] = o;
    return o;
  };
  ['muzzle', 'chamber', 'eject', 'sightRear', 'sightFront', 'eye', 'gripR', 'gripL',
    'magSeat', 'magDrop', 'chargeRest', 'chargePull', 'boltRest', 'boltTravel',
    'triggerPivot', 'selectorPivot', 'caseSpawn'].forEach((k) => nd(k, N[k]));
  nodes.sight = nodes.sightRear;            // совместимость со старым API
  nodes.ironSight = nodes.sightFront;
  nodes.handguard = nodes.gripL;

  group.nodes = nodes;
  group.dirs = { muzzle: N.muzzleDir, eject: N.ejectDir, sight: N.sightAxis };
  group.anim = { triggerPull: N.triggerPull, boltTravel: N.boltTravel[2] * S };
  group.parts = {
    magazine: SUB.magazine, bolt: SUB.bolt, charging: SUB.bolt,
    trigger: SUB.trigger, selector: SUB.selector
  };
  group.extra = {
    caseGeo: toGeo(M.extra.spentCase, [0, 0, 0]),
    cartGeo: toGeo(M.extra.cartridge, [0, 0, 0]),
    brass: mkMat('brass'), copper: mkMat('copper'), lead: mkMat('lead')
  };
  group.stats = M.stats;
  group.dispose = () => {
    geos.forEach((g) => g.dispose());
    matList.forEach((m) => m.dispose());
  };
  return group;
}
// ==== МОДЕЛЬ: КОНЕЦ ====
