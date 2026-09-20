const errEl = document.getElementById('err');
const showErr = (e) => {
  errEl.style.display = 'flex';
  errEl.textContent = 'Ошибка:\n' + ((e && e.message) || e);
  if (e && e.stack) console.error(e);
};

function main() {
  const mm = (x) => x / 1000;
  const D = (a) => a * Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  /* ================= рендерер ================= */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.008, 120);

  /* ================= окружение ================= */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  /* ================= свет ================= */
  const key = new THREE.DirectionalLight(0xfff1df, 2.45);
  key.position.set(-1.35, 2.05, 1.15);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.0035;
  key.shadow.radius = 2.4;
  const sc = key.shadow.camera;
  sc.left = -0.85; sc.right = 0.85; sc.top = 0.6; sc.bottom = -0.6; sc.near = 0.4; sc.far = 5.2;
  sc.updateProjectionMatrix();
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xb9cff0, 0.55);
  fill.position.set(1.7, 0.75, 1.5);
  const rim = new THREE.DirectionalLight(0xffffff, 1.75);
  rim.position.set(0.55, 1.1, -2.2);
  scene.add(fill, rim);
  scene.add(new THREE.HemisphereLight(0x9fb4c8, 0x14161a, 0.32));

  /* ================= подвес и модель ================= */
  const pivot = new THREE.Group();          // медленное вращение показа
  const recoilRig = new THREE.Group();      // отдача назад
  const tiltRig = new THREE.Group();        // подброс ствола
  scene.add(pivot); pivot.add(recoilRig); recoilRig.add(tiltRig);

  /* ATTACH: подключение системы модулей */
  /* Базовая модель строится целиком: съёмные узлы скрываются системой
     зон только тогда, когда в соответствующий слот поставлен модуль.
     Благодаря этому снятие модуля возвращает штатную деталь на место. */
  const gun = buildAK74(THREE, {});
  tiltRig.add(gun);
  const N = gun.nodes, P = gun.parts;

  /* Слоты магазина крутятся вместе с анимируемой группой магазина. */
  if (P.magazine) P.magazine.userData.__occGroup = 'magazine';
  const ATTACH_PARENT = (slotKey) => (slotKey === 'mag' ? P.magazine : null);
  let ATTACH_ASM = attachRebuildAK();

  function attachRebuildAK() {
    if (ATTACH_STATE.view) {
      ATTACH_STATE.view.root.parent && ATTACH_STATE.view.root.parent.remove(ATTACH_STATE.view.root);
      ATTACH_STATE.view.dispose();
    }
    const weapon = {
      caliber: ATTACH_DEF.caliber, weight: ATTACH_DEF.weight,
      ballistics: ATTACH_DEF.ballistics, stats: {}, base: [],
      nodes: {}, slots: attachSlots()
    };
    const asm = __ATTACH.SYS.assemble(weapon, __ATTACH.REG, ATTACH_STATE.config);
    const view = __ATTACH.ADAPTER.build(THREE, asm, { scale: 0.001, parentFor: ATTACH_PARENT, hostRoot: gun });
    view.root.traverse((o) => { o.userData.attachModule = true; });
    gun.add(view.root);
    ATTACH_STATE.asm = asm;
    ATTACH_STATE.view = view;
    attachOcclude(THREE, gun);
    attachSyncBeams();
    attachSyncDeploy();
    return asm;
  }

  /* центр композиции */
  const CENTER = new THREE.Vector3(0, mm(52), mm(-236));

  /* мягкая тень на полу */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.ShadowMaterial({ opacity: 0.34 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = mm(-168);
  floor.receiveShadow = true;
  scene.add(floor);

  /* ================= камера и управление ================= */
  const HOME = new THREE.Vector3(0.62, 0.40, 0.96);
  camera.position.copy(HOME);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(CENTER);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 0.85;
  controls.enablePan = false;
  controls.minDistance = 0.34;
  controls.maxDistance = 3.1;
  controls.minPolarAngle = D(14);
  controls.maxPolarAngle = D(158);
  controls.update();

  /* Отладочный хук: произвольный ракурс для проверки посадки модулей. */
  window.__VIEW = (dir, dist, target) => {
    const box = new THREE.Box3().setFromObject(gun);
    const c = target ? new THREE.Vector3().fromArray(target) : box.getCenter(new THREE.Vector3());
    const d = new THREE.Vector3().fromArray(dir).normalize();
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(d, dist);
    controls.update();
    pivot.rotation.y = 0;
    return { center: c.toArray(), min: box.min.toArray(), max: box.max.toArray() };
  };

  /* якорь прицельной камеры: глаз на линии прицеливания (чуть выше целика) */
  const adsAnchor = new THREE.Object3D();
  /* ATTACH: ось прицеливания */
  /* Глаз стрелка встаёт на ось активного прицела, на удалении зрачка за
     окуляром. Без оптики — механика: глаз за целиком, взгляд сквозь
     прорезь на мушку. Зум подбирается под кратность прицела: у механики
     и коллиматора он минимальный, у ПСО — по паспортному полю зрения. */
  /* Механика АК-74 по обмеру модели (мм): прорезь целика и вершина мушки.
     Глаз ставится на продолжение этой линии позади целика — тогда мушка
     сама оказывается в прорези, как в бодикаме. */
  const IRON_REAR = new THREE.Vector3(0, mm(116), mm(-248));
  const IRON_FRONT = new THREE.Vector3(0, mm(116), mm(-626));
  const IRON_RELIEF = 0.20;                 // вынос глаза за целик, м
  const IRON_RISE = 0.012;                  // подъём глаза над линией, м
  const lookAlong = (from, to) => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), to.clone().sub(from).normalize());
    return q;
  };

  /* Поле зрения в прицеле: см. комментарий в akm_viewer — прицел должен
     занимать часть кадра, а не весь экран. */
  const ADS_FOV_BASE = 21;
  const adsFov = (mag) => (mag > 1 ? ADS_FOV_BASE / mag : ADS_FOV_BASE);

  const attachSyncSight = () => {
    const asm = ATTACH_ASM;
    const a = asm && asm.activeOptic;
    if (a && asm.nodes.eye) {
      const e = asm.nodes.eye;
      adsAnchor.position.set(e[0] * 0.001, e[1] * 0.001, e[2] * 0.001);
      adsAnchor.rotation.set(0, 0, 0);
      camState.fovAds = adsFov(a.magnify || 1);
      camState.optic = a;
    } else {
      /* Глаз чуть выше линии прицеливания: щека на гребне приклада. */
      const axis = IRON_REAR.clone().sub(IRON_FRONT).normalize();
      adsAnchor.position.copy(IRON_REAR).addScaledVector(axis, IRON_RELIEF);
      adsAnchor.position.y += IRON_RISE;
      adsAnchor.quaternion.copy(lookAlong(adsAnchor.position, IRON_FRONT));
      camState.fovAds = ADS_FOV_BASE;
      camState.optic = null;
    }
  };

  /* состояние камеры объявлено до синхронизации: она пишет fovAds */
  const camState = {
    ads: false, k: 0,                       // k: 0 = обзор, 1 = прицел
    fovFree: 34, fovAds: 17, optic: null,
    idle: 0, lastInput: performance.now()
  };
  attachSyncSight();
  tiltRig.add(adsAnchor);

  const freePos = new THREE.Vector3();
  const freeQuat = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  const markInput = () => { camState.lastInput = performance.now(); };
  renderer.domElement.addEventListener('pointerdown', markInput);
  renderer.domElement.addEventListener('wheel', markInput, { passive: true });
  renderer.domElement.addEventListener('dblclick', () => {
    camera.position.copy(HOME);
    controls.target.copy(CENTER);
    controls.update();
    pivot.rotation.y = 0;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ================================================================
     ЭФФЕКТЫ ВЫСТРЕЛА
     Вспышка АК-74 с ДТК: яркое ядро, короткий факел вперёд
     и две боковые струи из боковых окон тормоза.
     ================================================================ */
  const cv = (s) => { const c = document.createElement('canvas'); c.width = c.height = s; return c; };
  const mkTex = (c) => { const t = new THREE.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };

  /* мягкое ядро вспышки */
  const texGlow = (() => {
    const c = cv(128), g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0.00, 'rgba(255,255,252,1)');
    r.addColorStop(0.16, 'rgba(255,246,206,0.95)');
    r.addColorStop(0.36, 'rgba(255,193,96,0.46)');
    r.addColorStop(0.66, 'rgba(255,126,38,0.13)');
    r.addColorStop(1.00, 'rgba(255,96,16,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return mkTex(c);
  })();

  /* звёздчатый факел с неровными лучами */
  const texStar = (() => {
    const c = cv(256), g = c.getContext('2d');
    g.translate(128, 128);
    const spikes = 9;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * TAU + Math.random() * 0.22;
      const len = 118 * (0.42 + Math.random() * 0.58);
      const w = 0.055 + Math.random() * 0.075;
      const grd = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      grd.addColorStop(0, 'rgba(255,250,225,0.95)');
      grd.addColorStop(0.35, 'rgba(255,203,110,0.42)');
      grd.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(Math.cos(a) * len, Math.sin(a) * len);
      g.lineTo(Math.cos(a - w) * 16, Math.sin(a - w) * 16);
      g.lineTo(Math.cos(a + w) * 16, Math.sin(a + w) * 16);
      g.closePath(); g.fill();
    }
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 44);
    r.addColorStop(0, 'rgba(255,255,248,1)');
    r.addColorStop(0.45, 'rgba(255,226,150,0.5)');
    r.addColorStop(1, 'rgba(255,150,50,0)');
    g.fillStyle = r; g.beginPath(); g.arc(0, 0, 44, 0, TAU); g.fill();
    return mkTex(c);
  })();

  /* клуб дыма */
  const texSmoke = (() => {
    const c = cv(128), g = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = 64 + (Math.random() - 0.5) * 62, y = 64 + (Math.random() - 0.5) * 62;
      const rad = 14 + Math.random() * 30;
      const r = g.createRadialGradient(x, y, 0, x, y, rad);
      r.addColorStop(0, 'rgba(255,255,255,0.16)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    const m = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    m.addColorStop(0, 'rgba(0,0,0,0)');
    m.addColorStop(0.72, 'rgba(0,0,0,0)');
    m.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = m; g.fillRect(0, 0, 128, 128);
    return mkTex(c);
  })();

  const texSpark = (() => {
    const c = cv(64), g = c.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,240,1)');
    r.addColorStop(0.3, 'rgba(255,214,130,0.85)');
    r.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return mkTex(c);
  })();

  const addMat = (tex, col) => new THREE.SpriteMaterial({
    map: tex, color: col, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false
  });

  /* узел у дульного среза — едет вместе с отдачей */
  const muzzleRig = new THREE.Object3D();
  /* ATTACH: узлы от модулей */
  /* Точка вспышки — срез установленного дульного устройства. */
  const attachSyncMuzzle = () => {
    const v = ATTACH_ASM && ATTACH_ASM.nodes.muzzle;
    if (v) muzzleRig.position.set(v[0] * 0.001, v[1] * 0.001, v[2] * 0.001);
    else muzzleRig.position.copy(N.muzzle.position);
  };
  attachSyncMuzzle();
  tiltRig.add(muzzleRig);

  const flash = { t: -1, dur: 0.055, seed: 0 };
  const sprGlow = new THREE.Sprite(addMat(texGlow, 0xffd9a0));
  const sprStar = new THREE.Sprite(addMat(texStar, 0xffc98a));
  const sprCore = new THREE.Sprite(addMat(texGlow, 0xffffff));
  sprGlow.position.z = mm(-16); sprStar.position.z = mm(-22); sprCore.position.z = mm(-6);
  muzzleRig.add(sprGlow, sprStar, sprCore);

  /* факел вперёд и две боковые струи (боковые окна ДТК) */
  const jetMat = () => new THREE.MeshBasicMaterial({
    color: 0xffb765, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide
  });
  const mkJet = (len, rad) => {
    const g = new THREE.ConeGeometry(rad, len, 14, 1, true);
    g.translate(0, -len / 2, 0);
    g.rotateX(-Math.PI / 2);          // остриё вдоль -Z
    return new THREE.Mesh(g, jetMat());
  };
  const jetMain = mkJet(mm(120), mm(30));
  muzzleRig.add(jetMain);
  const jetSide = [];
  for (let i = 0; i < 2; i++) {
    const j = mkJet(mm(58), mm(15));
    j.position.set(0, 0, mm(46));                  // у боковых окон тормоза
    j.rotation.y = (i ? -1 : 1) * D(74);
    muzzleRig.add(j);
    jetSide.push(j);
  }

  /* кольцо ударной волны */
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 1.0, 40),
    new THREE.MeshBasicMaterial({ color: 0xffd7a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  );
  ring.position.z = mm(-30);
  muzzleRig.add(ring);

  /* вспышка как источник света */
  const flashLight = new THREE.PointLight(0xffb268, 0, 4.2, 2.0);
  flashLight.position.set(0, 0, mm(-40));
  muzzleRig.add(flashLight);
  const portLight = new THREE.PointLight(0xffa050, 0, 1.4, 2.0);
  portLight.position.copy(N.eject.position);
  tiltRig.add(portLight);

  /* ---------- искры ---------- */
  const SPK = 110;
  const spkPos = new Float32Array(SPK * 3), spkCol = new Float32Array(SPK * 3);
  const spkGeo = new THREE.BufferGeometry();
  spkGeo.setAttribute('position', new THREE.BufferAttribute(spkPos, 3));
  spkGeo.setAttribute('color', new THREE.BufferAttribute(spkCol, 3));
  const sparks = new THREE.Points(spkGeo, new THREE.PointsMaterial({
    size: 0.011, map: texSpark, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  const spk = [];
  for (let i = 0; i < SPK; i++) spk.push({ t: 0, ttl: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), hot: 1 });

  /* ---------- дым ---------- */
  const SMK = 18;
  const smoke = [];
  for (let i = 0; i < SMK; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texSmoke, color: 0x8d939b, transparent: true, opacity: 0,
      depthWrite: false, toneMapped: false
    }));
    s.visible = false;
    scene.add(s);
    smoke.push({ o: s, t: 0, ttl: 0, v: new THREE.Vector3(), r0: 0, rot: 0, spin: 0 });
  }

  /* ---------- гильзы ---------- */
  const CASES = 12;
  const cases = [];
  for (let i = 0; i < CASES; i++) {
    const m = new THREE.Mesh(gun.extra.caseGeo, gun.extra.brass);
    m.castShadow = true;
    m.visible = false;
    scene.add(m);
    cases.push({ o: m, t: 0, ttl: 0, v: new THREE.Vector3(), w: new THREE.Vector3(), rest: false });
  }

  /* вспомогательные векторы */
  const wPos = new THREE.Vector3(), wQ = new THREE.Quaternion();
  const vDir = new THREE.Vector3(), vRight = new THREE.Vector3(), vUp = new THREE.Vector3();
  const FLOOR_Y = mm(-168);

  const spawnSparks = (n) => {
    muzzleRig.getWorldPosition(wPos);
    muzzleRig.getWorldQuaternion(wQ);
    vDir.set(0, 0, -1).applyQuaternion(wQ);
    vRight.set(1, 0, 0).applyQuaternion(wQ);
    vUp.set(0, 1, 0).applyQuaternion(wQ);
    let made = 0;
    for (let i = 0; i < SPK && made < n; i++) {
      const s = spk[i];
      if (s.t < s.ttl) continue;
      made++;
      s.t = 0; s.ttl = rnd(0.10, 0.42); s.hot = rnd(0.7, 1);
      s.p.copy(wPos).addScaledVector(vDir, rnd(0.005, 0.05));
      const side = Math.random() < 0.34;
      const sp = side ? rnd(1.4, 3.4) : rnd(2.6, 7.5);
      s.v.copy(vDir).multiplyScalar(side ? rnd(0.15, 0.7) : 1)
        .addScaledVector(vRight, side ? (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 1.1) : rnd(-0.3, 0.3))
        .addScaledVector(vUp, rnd(-0.25, 0.45))
        .normalize().multiplyScalar(sp);
    }
  };

  const spawnSmoke = (n, hot) => {
    muzzleRig.getWorldPosition(wPos);
    muzzleRig.getWorldQuaternion(wQ);
    vDir.set(0, 0, -1).applyQuaternion(wQ);
    vRight.set(1, 0, 0).applyQuaternion(wQ);
    let made = 0;
    for (let i = 0; i < SMK && made < n; i++) {
      const s = smoke[i];
      if (s.t < s.ttl) continue;
      made++;
      s.t = 0; s.ttl = rnd(0.75, 1.65);
      s.r0 = rnd(0.022, 0.05);
      s.rot = rnd(0, TAU); s.spin = rnd(-0.7, 0.7);
      s.o.position.copy(wPos).addScaledVector(vDir, rnd(0.01, 0.09));
      s.o.visible = true;
      s.o.material.opacity = 0;
      s.v.copy(vDir).multiplyScalar(rnd(0.35, 1.5) * (hot ? 1.4 : 1))
        .addScaledVector(vRight, rnd(-0.35, 0.35))
        .add(new THREE.Vector3(0, rnd(0.05, 0.3), 0));
    }
  };

  const ejectCase = () => {
    const src = N.caseSpawn;
    src.getWorldPosition(wPos);
    tiltRig.getWorldQuaternion(wQ);
    const d = gun.dirs.eject;
    vDir.set(d[0], d[1], d[2]).applyQuaternion(wQ).normalize();
    for (let i = 0; i < CASES; i++) {
      const c = cases[i];
      if (c.t < c.ttl) continue;
      c.t = 0; c.ttl = 3.2; c.rest = false;
      c.o.visible = true;
      c.o.position.copy(wPos);
      c.o.quaternion.copy(wQ);
      c.v.copy(vDir).multiplyScalar(rnd(2.3, 3.2));
      c.v.x += rnd(-0.35, 0.35); c.v.y += rnd(0.15, 0.7); c.v.z += rnd(-0.3, 0.3);
      c.w.set(rnd(-34, 34), rnd(-26, 26), rnd(-42, 42));
      return;
    }
  };

  /* ---------- обновление эффектов ---------- */
  const flashState = { t: 1e9, seed: 0, power: 1 };

  const triggerFlash = (power) => {
    flashState.t = 0;
    flashState.power = power === undefined ? 1 : power;
    flashState.seed = rnd(0, TAU);
    sprStar.material.rotation = flashState.seed;
    sprGlow.material.rotation = rnd(0, TAU);
    jetMain.scale.set(rnd(0.82, 1.22), rnd(0.82, 1.22), rnd(0.78, 1.3));
    jetSide[0].rotation.y = D(rnd(66, 82));
    jetSide[1].rotation.y = -D(rnd(66, 82));
    spawnSparks(Math.round(rnd(9, 17)));
    spawnSmoke(2, true);
    setTimeout(() => spawnSmoke(1, false), 70);
  };

  const updateFX = (dt) => {
    /* вспышка */
    flashState.t += dt;
    const ft = flashState.t, FD = 0.062;
    if (ft <= FD) {
      const u = ft / FD;
      const rise = Math.min(1, ft / 0.0045);
      const a = rise * Math.pow(1 - u, 2.35) * flashState.power;
      sprCore.material.opacity = a;
      sprCore.scale.setScalar(mm(52) * (0.75 + 0.5 * u));
      sprGlow.material.opacity = a * 0.8;
      sprGlow.scale.setScalar(mm(150) * (0.7 + 0.85 * u));
      sprStar.material.opacity = a * 0.92;
      sprStar.scale.setScalar(mm(250) * (0.55 + 0.95 * u));
      jetMain.material.opacity = a * 0.62;
      jetSide[0].material.opacity = jetSide[1].material.opacity = a * 0.5 * Math.max(0, 1 - u * 1.5);
      ring.material.opacity = 0.42 * Math.pow(1 - u, 1.6);
      ring.scale.setScalar(mm(28) + mm(420) * u);
      flashLight.intensity = a * 30;
      portLight.intensity = a * 4.5;
    } else if (sprCore.material.opacity !== 0) {
      sprCore.material.opacity = sprGlow.material.opacity = sprStar.material.opacity = 0;
      jetMain.material.opacity = jetSide[0].material.opacity = jetSide[1].material.opacity = 0;
      ring.material.opacity = 0;
      flashLight.intensity = portLight.intensity = 0;
    }

    /* искры */
    let any = false;
    for (let i = 0; i < SPK; i++) {
      const s = spk[i], k = i * 3;
      if (s.t >= s.ttl) { spkCol[k] = spkCol[k + 1] = spkCol[k + 2] = 0; continue; }
      any = true;
      s.t += dt;
      s.v.y -= 9.81 * dt;
      s.v.multiplyScalar(1 - Math.min(1, 3.4 * dt));
      s.p.addScaledVector(s.v, dt);
      const u = clamp(s.t / s.ttl, 0, 1), f = Math.pow(1 - u, 1.7) * s.hot;
      spkPos[k] = s.p.x; spkPos[k + 1] = s.p.y; spkPos[k + 2] = s.p.z;
      spkCol[k] = 1.6 * f; spkCol[k + 1] = 0.72 * f * f; spkCol[k + 2] = 0.22 * f * f * f;
    }
    spkGeo.attributes.position.needsUpdate = true;
    spkGeo.attributes.color.needsUpdate = true;
    sparks.visible = any;

    /* дым */
    for (let i = 0; i < SMK; i++) {
      const s = smoke[i];
      if (s.t >= s.ttl) { if (s.o.visible) s.o.visible = false; continue; }
      s.t += dt;
      const u = clamp(s.t / s.ttl, 0, 1);
      s.v.multiplyScalar(1 - Math.min(1, 1.5 * dt));
      s.v.y += 0.28 * dt;
      s.o.position.addScaledVector(s.v, dt);
      s.rot += s.spin * dt;
      s.o.material.rotation = s.rot;
      s.o.material.opacity = 0.30 * Math.sin(Math.PI * Math.pow(u, 0.55)) * (1 - u * 0.25);
      s.o.scale.setScalar(s.r0 * (1 + 3.6 * u));
    }

    /* гильзы */
    for (let i = 0; i < CASES; i++) {
      const c = cases[i];
      if (c.t >= c.ttl) { if (c.o.visible) c.o.visible = false; continue; }
      c.t += dt;
      if (!c.rest) {
        c.v.y -= 9.81 * dt;
        c.o.position.addScaledVector(c.v, dt);
        c.o.rotateX(c.w.x * dt); c.o.rotateY(c.w.y * dt); c.o.rotateZ(c.w.z * dt);
        if (c.o.position.y <= FLOOR_Y + mm(5)) {
          c.o.position.y = FLOOR_Y + mm(5);
          if (Math.abs(c.v.y) < 0.35) { c.rest = true; c.v.set(0, 0, 0); }
          else {
            c.v.y = -c.v.y * 0.34;
            c.v.x *= 0.55; c.v.z *= 0.55;
            c.w.multiplyScalar(0.45);
            if (audio.on) audio.caseHit(Math.min(1, Math.abs(c.v.y) * 1.6));
          }
        }
      }
      if (c.t > c.ttl - 0.6) {
        const k = clamp((c.ttl - c.t) / 0.6, 0, 1);
        c.o.scale.setScalar(k);
      } else c.o.scale.setScalar(1);
    }
  };

  /* ================================================================
     ЗВУК. Синтез без внешних файлов: резкий фронт +
     низкий гул + металлическая механика + хвост отражений.
     ================================================================ */
  const audio = {
    ctx: null, on: true, master: null, dry: null, conv: null, nb: null,

    init() {
      if (audio.ctx) return audio.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { audio.on = false; return null; }
      const ctx = audio.ctx = new AC();

      const master = ctx.createGain(); master.gain.value = 0.82;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -15; comp.knee.value = 24; comp.ratio.value = 8;
      comp.attack.value = 0.0016; comp.release.value = 0.24;
      master.connect(comp); comp.connect(ctx.destination);

      const dry = ctx.createGain(); dry.gain.value = 1; dry.connect(master);

      /* хвост открытого пространства */
      const conv = ctx.createConvolver();
      conv.buffer = audio.mkIR(ctx, 1.65);
      const wet = ctx.createGain(); wet.gain.value = 0.5;
      conv.connect(wet); wet.connect(master);

      /* шлепок-эхо от дальней преграды */
      const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.128;
      const dlLP = ctx.createBiquadFilter(); dlLP.type = 'lowpass'; dlLP.frequency.value = 1250;
      const fb = ctx.createGain(); fb.gain.value = 0.26;
      const dlG = ctx.createGain(); dlG.gain.value = 0.34;
      dl.connect(dlLP); dlLP.connect(fb); fb.connect(dl); dlLP.connect(dlG); dlG.connect(master);

      audio.master = master; audio.dry = dry; audio.conv = conv; audio.echo = dl;
      audio.nb = audio.mkNoise(ctx, 2.2);
      return ctx;
    },

    mkNoise(ctx, sec) {
      const n = Math.floor(ctx.sampleRate * sec);
      const b = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        let last = 0;
        for (let i = 0; i < n; i++) {
          const w = Math.random() * 2 - 1;
          last = 0.86 * last + 0.14 * w;          // лёгкая окраска
          d[i] = w * 0.72 + last * 0.55;
        }
      }
      return b;
    },

    /* импульсный отклик: ранние отражения + плотный хвост */
    mkIR(ctx, sec) {
      const n = Math.floor(ctx.sampleRate * sec);
      const b = ctx.createBuffer(2, n, ctx.sampleRate);
      const taps = [0.011, 0.019, 0.031, 0.047, 0.062, 0.081, 0.104, 0.133, 0.171, 0.216];
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / ctx.sampleRate;
          const env = Math.pow(1 - t / sec, 2.6) * Math.exp(-t * 1.55);
          const w = Math.random() * 2 - 1;
          lp = lp * 0.62 + w * 0.38;                // глушим верх
          d[i] = (w * 0.35 + lp * 0.65) * env * 0.55;
        }
        for (let k = 0; k < taps.length; k++) {
          const idx = Math.floor((taps[k] + (c ? 0.0035 : 0)) * ctx.sampleRate);
          if (idx < n) d[idx] += (Math.random() < 0.5 ? -1 : 1) * 0.5 * Math.pow(1 - k / taps.length, 1.7);
        }
      }
      return b;
    },

    /* шумовой слой */
    nz(t0, dur, o) {
      const ctx = audio.ctx; o = o || {};
      const src = ctx.createBufferSource();
      src.buffer = audio.nb; src.loop = true;
      src.playbackRate.value = o.rate || 1;
      const off = Math.random() * 1.6;
      let node = src;
      if (o.type) {
        const f = ctx.createBiquadFilter();
        f.type = o.type; f.Q.value = o.q === undefined ? 1 : o.q;
        f.frequency.setValueAtTime(o.freq || 1000, t0);
        if (o.freq2) f.frequency.exponentialRampToValueAtTime(o.freq2, t0 + dur);
        node.connect(f); node = f;
      }
      if (o.hp) {
        const h = ctx.createBiquadFilter();
        h.type = 'highpass'; h.frequency.value = o.hp; h.Q.value = 0.7;
        node.connect(h); node = h;
      }
      const g = ctx.createGain();
      const pk = Math.max(0.0006, o.gain === undefined ? 0.3 : o.gain);
      const atk = o.atk === undefined ? 0.0012 : o.atk;
      g.gain.setValueAtTime(0.0004, t0);
      g.gain.exponentialRampToValueAtTime(pk, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
      g.gain.setValueAtTime(0, t0 + dur + 0.005);
      node.connect(g);
      g.connect(audio.dry);
      if (o.wet) { const w = ctx.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(audio.conv); }
      if (o.echo) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(audio.echo); }
      src.start(t0, off); src.stop(t0 + dur + 0.03);
    },

    /* тональный слой (низ и короткие резонансы) */
    osc(t0, dur, f0, f1, gain, type, o) {
      const ctx = audio.ctx; o = o || {};
      const s = ctx.createOscillator();
      s.type = type || 'sine';
      s.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) s.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0004, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0006, gain), t0 + (o.atk || 0.0015));
      g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
      g.gain.setValueAtTime(0, t0 + dur + 0.005);
      s.connect(g); g.connect(audio.dry);
      if (o.wet) { const w = ctx.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(audio.conv); }
      if (o.echo) { const e = ctx.createGain(); e.gain.value = o.echo; g.connect(e); e.connect(audio.echo); }
      s.start(t0); s.stop(t0 + dur + 0.03);
    },

    now(d) { return audio.ctx.currentTime + (d || 0); }
  };

  /* ---------- выстрел: жёсткий фронт + низкий гул + отражения ---------- */
  audio.shot = () => {
    if (!audio.on || !audio.init()) return;
    const t = audio.now(0.0015);
    const p = 1 + rnd(-0.045, 0.045);
    const v = rnd(0.93, 1.07);

    audio.nz(t, 0.010, { type: 'highpass', freq: 2900 * p, q: 0.6, gain: 0.62 * v, atk: 0.0005, wet: 0.22, echo: 0.18 });
    audio.nz(t + 0.0007, 0.080, { type: 'bandpass', freq: 760 * p, q: 0.7, gain: 1.05 * v, atk: 0.0009, wet: 0.62, echo: 0.52 });
    audio.nz(t + 0.001, 0.030, { type: 'bandpass', freq: 1780 * p, q: 1.0, gain: 0.46 * v, atk: 0.0007, wet: 0.30, echo: 0.24 });
    audio.nz(t + 0.002, 0.270, { type: 'lowpass', freq: 205, q: 0.9, gain: 0.66 * v, atk: 0.0045, wet: 0.55, echo: 0.42 });
    audio.osc(t + 0.001, 0.170, 152 * p, 43, 0.52 * v, 'sine', { wet: 0.42, echo: 0.3 });
    audio.osc(t + 0.0015, 0.090, 94 * p, 37, 0.34 * v, 'triangle', { wet: 0.24 });
    audio.nz(t + 0.030, 0.520, { type: 'lowpass', freq: 760, q: 0.6, gain: 0.13, atk: 0.022, wet: 0.95, echo: 0.75 });
    /* механика автоматики внутри цикла */
    audio.nz(t + 0.022, 0.028, { type: 'bandpass', freq: 2400, q: 1.7, gain: 0.15 });
    audio.nz(t + 0.058, 0.042, { type: 'bandpass', freq: 1450, q: 1.2, gain: 0.20 });
    audio.osc(t + 0.059, 0.055, 235, 118, 0.10, 'triangle');
  };

  /* ---------- механика ---------- */
  audio.dryFire = () => {
    if (!audio.on || !audio.init()) return;
    const t = audio.now(0.001);
    audio.nz(t, 0.008, { type: 'highpass', freq: 2200, q: 0.7, gain: 0.28 });
    audio.nz(t + 0.001, 0.030, { type: 'bandpass', freq: 1150, q: 2.2, gain: 0.18, wet: 0.2 });
    audio.osc(t + 0.001, 0.030, 340, 180, 0.05, 'triangle');
  };

  audio.trig = () => {
    if (!audio.on || !audio.init()) return;
    const t = audio.now(0.001);
    audio.nz(t, 0.012, { type: 'bandpass', freq: 1900, q: 2.4, gain: 0.10 });
  };

  audio.selector = () => {
    if (!audio.on || !audio.init()) return;
    const t = audio.now(0.001);
    audio.nz(t, 0.010, { type: 'bandpass', freq: 2600, q: 2.6, gain: 0.24, wet: 0.18 });
    audio.osc(t, 0.020, 900, 520, 0.06, 'square');
  };

  audio.magRelease = () => {
    if (!audio.on || !audio.init()) return;
    const t = audio.now(0.001);
    audio.nz(t, 0.014, { type: 'bandpass', freq: 2350, q: 2.0, gain: 0.30, wet: 0.2 });
    audio.osc(t, 0.028, 760, 380, 0.09, 'triangle', { wet: 0.15 });
  };

  audio.magOut = () => {
    if (!audio.on || !audio.init()) return;
    const t = audio.now(0.001);
    audio.nz(t, 0.110, { type: 'bandpass', freq: 880, q: 0.9, gain: 0.20, atk: 0.012, wet: 0.22 });
    audio.nz(t + 0.055, 0.060, { type: 'lowpass', freq: 620, q: 0.8, gain: 0.24, atk: 0.002, wet: 0.25 });
    audio.osc(t + 0.056, 0.070, 210, 96, 0.13, 'triangle', { wet: 0.2 });
  };

  audio.magIn = () => {
    if (!audio.on || !audio.init()) return;
    const t = audio.now(0.001);
    /* носок зацепился за окно */
    audio.nz(t, 0.045, { type: 'lowpass', freq: 900, q: 0.8, gain: 0.30, atk: 0.0015, wet: 0.25 });
    audio.osc(t, 0.055, 260, 120, 0.16, 'triangle', { wet: 0.2 });
    /* доворот и защёлкивание защёлки */
    audio.nz(t + 0.105, 0.040, { type: 'bandpass', freq: 1750, q: 1.5, gain: 0.42, wet: 0.3, echo: 0.12 });
    audio.nz(t + 0.105, 0.075, { type: 'lowpass', freq: 380, q: 0.9, gain: 0.34, atk: 0.002, wet: 0.28 });
    audio.osc(t + 0.106, 0.090, 168, 74, 0.22, 'sine', { wet: 0.25 });
  };

  audio.chargePull = () => {
    if (!audio.on || !audio.init()) return;
    const t = audio.now(0.001);
    audio.nz(t, 0.135, { type: 'bandpass', freq: 1150, freq2: 1750, q: 1.1, gain: 0.30, atk: 0.020, wet: 0.28 });
    audio.nz(t + 0.010, 0.120, { type: 'highpass', freq: 3200, q: 0.7, gain: 0.10, atk: 0.03 });
    audio.osc(t + 0.020, 0.110, 520, 880, 0.045, 'sawtooth');   // пружина
    audio.nz(t + 0.140, 0.035, { type: 'bandpass', freq: 2050, q: 1.8, gain: 0.34, wet: 0.28 });
  };

  audio.boltRelease = () => {
    if (!audio.on || !audio.init()) return;
    const t = audio.now(0.001);
    audio.nz(t, 0.055, { type: 'bandpass', freq: 1520, q: 1.0, gain: 0.62, atk: 0.0008, wet: 0.4, echo: 0.2 });
    audio.nz(t, 0.130, { type: 'lowpass', freq: 320, q: 0.9, gain: 0.40, atk: 0.002, wet: 0.35, echo: 0.15 });
    audio.osc(t, 0.120, 175, 62, 0.28, 'sine', { wet: 0.3 });
    audio.nz(t + 0.006, 0.030, { type: 'highpass', freq: 3400, q: 0.7, gain: 0.16 });
  };

  /* Удар гильзы о пол. Тональные осцилляторы давали «колокольчик»:
     латунь звенит очень коротко, поэтому оставляем только резонансный шум. */
  audio.caseHit = (v) => {
    if (!audio.on || !audio.ctx) return;
    const t = audio.now(0.001);
    const g = 0.085 * clamp(v, 0.15, 1);
    audio.nz(t, 0.026, { type: 'bandpass', freq: rnd(3000, 5200), q: 6.5, gain: g, wet: 0.24 });
    audio.nz(t + 0.004, 0.018, { type: 'highpass', freq: 5200, q: 0.8, gain: g * 0.4, wet: 0.2 });
  };

  /* ================= состояние оружия ================= */
  const MAG = 30, RATE = 0.092, RELOAD_LEN = 2.48;
  const ammoEl = document.getElementById('ammo');
  const btnFire = document.getElementById('fire');
  const btnRel = document.getElementById('rel');
  const btnAds = document.getElementById('ads');
  const btnMode = document.getElementById('mode');
  const btnSnd = document.getElementById('snd');

  let ammo = MAG;
  let magCap = MAG;                       // ATTACH: реальная ёмкость от модуля
  const setAmmo = (v) => {
    ammo = v;
    ammoEl.textContent = String(v);
    ammoEl.classList.toggle('low', v <= 5);
  };

  const boltZ = gun.anim.boltTravel;        // ход рамы, м
  const trigA = gun.anim.triggerPull;       // угол спуска, рад
  const REC = mm(12);

  const st = { shot: 9, cool: 0, hold: false, eject: false, side: 1, reload: -1, cue: 0,
    mode: 'auto', semiLatch: false, safeCue: false };
  /* Переводчик АК-74: предохранитель — автоматический — одиночный. */
  const MODE_ORDER = ['safe', 'auto', 'semi'];
  const MODE_NAME = { safe: 'ПРЕДОХР', auto: 'АВТО', semi: 'ОДИНОЧНЫЙ' };

  /* ---------- кривые ---------- */
  const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const recoilCurve = (t) => {
    if (t < 0) return 0;
    if (t < 0.014) return t / 0.014;
    const u = (t - 0.014) / 0.175;
    if (u >= 1) return 0;
    return Math.cos(u * 6.6) * Math.exp(-u * 4.1) * (1 - u * u);
  };
  const boltCycle = (t) => {
    if (t < 0) return 0;
    if (t < 0.026) return ease(t / 0.026);
    if (t < 0.038) return 1;
    if (t < 0.080) return 1 - ease((t - 0.038) / 0.042);
    return 0;
  };
  const boltReload = (t) => {
    if (t < 1.95) return 0;
    if (t < 2.07) return ease((t - 1.95) / 0.12);
    if (t < 2.14) return 1;
    if (t < 2.20) return 1 - ease((t - 2.14) / 0.06);
    return 0;
  };

  /* ---------- ключевые кадры магазина (p — метры, r — рад) ---------- */
  const MKEY = [
    { t: 0.00, p: [0, 0, 0], r: 0, v: 1 },
    { t: 0.16, p: [0, 0, 0], r: 0, v: 1 },
    { t: 0.31, p: [0, 0.002, -0.004], r: 0.155, v: 1 },
    { t: 0.64, p: [0, -0.33, -0.05], r: 0.30, v: 1 },
    { t: 0.72, p: [0, -0.52, -0.06], r: 0.34, v: 0 },
    { t: 1.16, p: [0.02, -0.44, -0.02], r: 0.34, v: 0 },
    { t: 1.22, p: [0.015, -0.42, -0.02], r: 0.30, v: 1 },
    { t: 1.46, p: [0, -0.006, -0.007], r: 0.165, v: 1 },
    { t: 1.60, p: [0, 0, 0], r: 0, v: 1 },
    { t: 9.00, p: [0, 0, 0], r: 0, v: 1 }
  ];
  const magAt = (t, out) => {
    let i = 0;
    while (i < MKEY.length - 2 && t >= MKEY[i + 1].t) i++;
    const a = MKEY[i], b = MKEY[i + 1];
    const u = ease((t - a.t) / Math.max(1e-4, b.t - a.t));
    out.x = a.p[0] + (b.p[0] - a.p[0]) * u;
    out.y = a.p[1] + (b.p[1] - a.p[1]) * u;
    out.z = a.p[2] + (b.p[2] - a.p[2]) * u;
    out.r = a.r + (b.r - a.r) * u;
    out.v = a.v === 1;
    return out;
  };
  const magPose = { x: 0, y: 0, z: 0, r: 0, v: true };

  /* ---------- звуковые метки перезарядки ---------- */
  const CUES = [
    [0.00, () => audio.magRelease()],
    [0.17, () => audio.magOut()],
    [1.34, () => audio.magIn()],
    [1.95, () => audio.chargePull()],
    [2.15, () => { audio.boltRelease(); setAmmo(magCap); }]
  ];

  const startReload = () => {
    if (st.reload >= 0 || ammo === MAG) return;
    st.reload = 0; st.cue = 0;
    btnRel.classList.add('off');
    markInput();
  };

  const shoot = () => {
    if (st.reload >= 0 || st.cool > 0) return;
    if (st.mode === 'safe') {
      if (!st.safeCue) {
        st.safeCue = true;
        audio.dryFire();
        gun.parts.trigger.rotation.x = -trigA * 0.35;
        setTimeout(() => { if (st.reload < 0) gun.parts.trigger.rotation.x = 0; }, 90);
      }
      return;
    }
    if (st.mode === 'semi' && st.semiLatch) return;
    if (ammo <= 0) {
      st.cool = 0.28;
      st.shot = 9;
      audio.dryFire();
      gun.parts.trigger.rotation.x = -trigA;
      setTimeout(() => { if (st.reload < 0) gun.parts.trigger.rotation.x = 0; }, 90);
      return;
    }
    if (st.mode === 'semi') st.semiLatch = true;
    st.cool = RATE * rnd(0.97, 1.03);
    st.shot = 0;
    st.eject = false;
    st.side = Math.random() < 0.5 ? -1 : 1;
    setAmmo(ammo - 1);
    audio.shot();
    triggerFlash(ammo === 0 ? 1.12 : rnd(0.9, 1.08));
    markInput();
  };

  /* ---------- анимация оружия ---------- */
  const updateGun = (dt) => {
    st.cool = Math.max(0, st.cool - dt);
    st.shot += dt;

    let bolt = boltCycle(st.shot);
    let rec = recoilCurve(st.shot);
    let trig = st.shot < 0.085 ? Math.sin(clamp(st.shot / 0.085, 0, 1) * Math.PI) : 0;
    let roll = 0;

    if (!st.eject && st.shot >= 0.028 && st.shot < 0.2) { st.eject = true; ejectCase(); }

    if (st.reload >= 0) {
      st.reload += dt;
      const t = st.reload;
      while (st.cue < CUES.length && t >= CUES[st.cue][0]) { CUES[st.cue][1](); st.cue++; }
      magAt(t, magPose);
      gun.parts.magazine.position.set(magPose.x, magPose.y, magPose.z);
      gun.parts.magazine.rotation.x = magPose.r;
      gun.parts.magazine.visible = magPose.v;
      bolt = Math.max(bolt, boltReload(t));
      trig = 0;
      roll = D(-10) * (ease((t - 0.10) / 0.30) - ease((t - 1.92) / 0.36));
      if (t >= 2.20) {
        const k = 1 - ease((t - 2.20) / 0.16);
        rec = Math.max(rec, -0.22 * k);
      }
      if (t >= RELOAD_LEN) {
        st.reload = -1;
        btnRel.classList.remove('off');
        gun.parts.magazine.position.set(0, 0, 0);
        gun.parts.magazine.rotation.x = 0;
        gun.parts.magazine.visible = true;
      }
    }

    const soft = 1 - 0.3 * camState.k;
    recoilRig.position.z = REC * rec * soft;
    recoilRig.rotation.z = roll * (1 - 0.55 * camState.k);
    tiltRig.rotation.x = D(1.8) * rec * soft;
    tiltRig.rotation.z = D(0.5) * rec * st.side * soft;
    gun.parts.bolt.position.z = boltZ * bolt;
    gun.parts.trigger.rotation.x = -trigA * trig;
  };

  /* ================= камера ================= */
  audio.handle = () => {
    if (!audio.on || !audio.init()) return;
    const t = audio.now(0.001);
    audio.nz(t, 0.085, { type: 'bandpass', freq: 640, q: 0.8, gain: 0.075, atk: 0.014 });
    audio.nz(t + 0.028, 0.055, { type: 'highpass', freq: 2500, q: 0.7, gain: 0.030, atk: 0.012 });
  };

  const updateCamera = (dt, now) => {
    const target = camState.ads ? 1 : 0;
    camState.k += (target - camState.k) * Math.min(1, dt * 8.5);
    if (Math.abs(camState.k - target) < 0.0015) camState.k = target;

    if (camState.k > 0.0005) {
      pivot.rotation.y += (0 - pivot.rotation.y) * Math.min(1, dt * 5);
    } else if ((now - camState.lastInput) / 1000 > 7) {
      pivot.rotation.y += dt * 0.13;
    }

    if (camState.k === 0) {
      controls.enabled = true;
      controls.update();
      freePos.copy(camera.position);
      freeQuat.copy(camera.quaternion);
      if (camera.fov !== camState.fovFree) { camera.fov = camState.fovFree; camera.updateProjectionMatrix(); }
    } else {
      controls.enabled = false;
      adsAnchor.updateWorldMatrix(true, false);
      adsAnchor.getWorldPosition(tmpV);
      adsAnchor.getWorldQuaternion(tmpQ);
      const e = camState.k * camState.k * (3 - 2 * camState.k);
      camera.position.copy(freePos).lerp(tmpV, e);
      camera.quaternion.copy(freeQuat).slerp(tmpQ, e);
      const fov = camState.fovFree + (camState.fovAds - camState.fovFree) * e;
      if (Math.abs(fov - camera.fov) > 0.002) { camera.fov = fov; camera.updateProjectionMatrix(); }
    }
  };

  const setAds = (on) => {
    if (camState.ads === on) return;
    camState.ads = on;
    btnAds.classList.toggle('on', on);
    audio.handle();
    markInput();
  };

  /* ================= управление ================= */
  const resumeAudio = () => {
    const c = audio.init();
    if (c && c.state === 'suspended') c.resume();
  };

  const pulseRel = () => {
    btnRel.classList.add('on');
    setTimeout(() => btnRel.classList.remove('on'), 220);
  };

  const pressFire = () => {
    resumeAudio();
    const dry = ammo <= 0 && st.reload < 0;
    st.hold = true;
    shoot();
    if (dry) pulseRel();
  };
  const releaseFire = () => { st.hold = false; st.semiLatch = false; st.safeCue = false; };

  const syncMode = () => {
    if (!btnMode) return;
    btnMode.textContent = MODE_NAME[st.mode];
    btnMode.classList.toggle('on', st.mode !== 'safe');
  };
  const cycleFireMode = () => {
    st.mode = MODE_ORDER[(MODE_ORDER.indexOf(st.mode) + 1) % MODE_ORDER.length];
    st.semiLatch = false;
    st.safeCue = false;
    resumeAudio();
    audio.selector();
    syncMode();
  };
  window.__cycleFireMode = cycleFireMode;
  if (btnMode) btnMode.addEventListener('click', cycleFireMode);
  syncMode();

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) pressFire();
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyR') { e.preventDefault(); resumeAudio(); startReload(); }
    else if (e.code === 'KeyF') { e.preventDefault(); resumeAudio(); setAds(!camState.ads); }
    else if (e.code === 'Escape') setAds(false);
    markInput();
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') releaseFire(); });

  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.addEventListener('pointerdown', (e) => {
    resumeAudio();
    if (e.button === 2) setAds(true);
  });
  window.addEventListener('pointerup', (e) => {
    releaseFire();
    if (e.button === 2) setAds(false);
  });
  window.addEventListener('pointercancel', releaseFire);
  window.addEventListener('blur', releaseFire);
  document.addEventListener('visibilitychange', releaseFire);

  btnFire.addEventListener('pointerdown', (e) => { e.preventDefault(); pressFire(); });
  btnRel.addEventListener('click', () => { resumeAudio(); startReload(); });
  btnAds.addEventListener('click', () => { resumeAudio(); setAds(!camState.ads); });
  if (btnSnd) btnSnd.addEventListener('click', () => {
    audio.on = !audio.on;
    btnSnd.classList.toggle('muted', !audio.on);
    if (audio.on) { resumeAudio(); audio.handle(); }
  });

  /* ATTACH: интерфейс */
  const attachApply = ATTACH_STATE.apply = (slotKey, moduleKey) => {
    ATTACH_STATE.ui && ATTACH_STATE.ui.markStats();
    ATTACH_STATE.config[slotKey] = moduleKey;
    ATTACH_ASM = attachRebuildAK();
    attachSyncMuzzle();
    attachSyncSight();
    attachSyncAmmo();
    ATTACH_STATE.ui && ATTACH_STATE.ui.render();
  };
  const attachSyncAmmo = () => {
    const cap = (ATTACH_ASM && ATTACH_ASM.derived.magCap) || MAG;
    magCap = cap;
    if (ammo > cap) setAmmo(cap);
    const cell = document.querySelector('#hud i');
    if (cell) cell.textContent = '5,45×39 · МАГАЗИН ' + cap;
  };
  ATTACH_STATE.ui = createCustomizer({
    getConfig: () => ATTACH_STATE.config,
    getSlots: () => attachSlots(),
    getStats: () => (ATTACH_ASM ? ATTACH_ASM.derived : {}),
    getWarnings: () => (ATTACH_ASM ? ATTACH_ASM.warnings : []),
    optionsFor: attachOptionsFor,
    nameOf: attachNameOf,
    setModule: attachApply
  });
  ATTACH_STATE.ui.render();
  ATTACH_STATE.ui.toggle(false);
  window.__MEASURE_HOST = gun; window.__MEASURE_THREE = THREE;
  /* Отладка прицеливания: где стоит камера и куда смотрит. */
  window.__ADS_DEBUG = () => ({
    ads: camState.ads, k: camState.k, fov: camera.fov, fovAds: camState.fovAds,
    optic: camState.optic ? camState.optic.meta.name : 'механика',
    camera: camera.position.toArray().map((v) => Math.round(v * 1000)),
    anchor: adsAnchor.getWorldPosition(new THREE.Vector3()).toArray().map((v) => Math.round(v * 1000)),
    eye: ATTACH_ASM && ATTACH_ASM.nodes.eye
  });
  window.__ATTACH_DEBUG = () => ({
    magGroup: (function () {
      const g = ATTACH_STATE.view.slots.mag;
      if (!g) return 'нет группы mag';
      const box = new THREE.Box3().setFromObject(g);
      return { parent: g.parent && g.parent.name, children: g.children.length,
        visible: g.visible, min: box.min.toArray(), max: box.max.toArray() };
    })(),
    config: ATTACH_STATE.config,
    modules: Object.keys(ATTACH_ASM.modules),
    parts: ATTACH_ASM.parts.length,
    errors: ATTACH_ASM.errors, warnings: ATTACH_ASM.warnings,
    children: ATTACH_STATE.view.root.children.map((c) => c.name + ':' + c.children.length),
    rootParent: ATTACH_STATE.view.root.parent && ATTACH_STATE.view.root.parent.name,
    nodes: ATTACH_ASM.nodes
  });
  attachBindKeys(attachApply);
  attachSyncAmmo();

  /* ================= цикл ================= */
  setAmmo(magCap);
  let prev = performance.now();
  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - prev) / 1000;
    prev = now;
    if (dt > 0.05) dt = 0.05;
    if (st.hold) shoot();
    updateGun(dt);
    updateFX(dt);
    updateCamera(dt, now);
    renderer.render(scene, camera);
  };
  tick();
}

try { main(); } catch (e) { showErr(e); }
