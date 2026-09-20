const errEl = document.getElementById('err')
function fail(e) {
	errEl.textContent = 'Не удалось собрать модель: ' + ((e && e.message) ? e.message : e)
	errEl.style.display = 'flex'
}

try {
	window.__ok = 1
	const RAD = Math.PI / 180

	const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
	renderer.setSize(window.innerWidth, window.innerHeight)
	renderer.shadowMap.enabled = true
	renderer.shadowMap.type = THREE.PCFSoftShadowMap
	renderer.toneMapping = THREE.ACESFilmicToneMapping
	renderer.toneMappingExposure = 1.05
	document.body.appendChild(renderer.domElement)

	const scene = new THREE.Scene()

	// фон — мягкий радиальный градиент
	{
		const c = document.createElement('canvas')
		c.width = c.height = 512
		const x = c.getContext('2d')
		const g = x.createRadialGradient(256, 236, 10, 256, 236, 350)
		g.addColorStop(0, '#24282d')
		g.addColorStop(0.55, '#171a1e')
		g.addColorStop(1, '#0c0e10')
		x.fillStyle = g
		x.fillRect(0, 0, 512, 512)
		const tex = new THREE.CanvasTexture(c)
		tex.colorSpace = THREE.SRGBColorSpace
		scene.background = tex
	}

	// отражения: без них воронёная сталь выглядит серой пластмассой
	{
		const pmrem = new THREE.PMREMGenerator(renderer)
		scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
		pmrem.dispose()
	}

	const key = new THREE.DirectionalLight(0xfff4e6, 2.6)
	key.position.set(1.6, 2.2, -1.8)
	key.castShadow = true
	key.shadow.mapSize.set(2048, 2048)
	key.shadow.camera.near = 0.1
	key.shadow.camera.far = 8
	key.shadow.camera.left = -0.8
	key.shadow.camera.right = 0.8
	key.shadow.camera.top = 0.8
	key.shadow.camera.bottom = -0.8
	key.shadow.bias = -0.0004
	key.shadow.normalBias = 0.0018
	key.shadow.radius = 3
	scene.add(key)
	const fillL = new THREE.DirectionalLight(0xa8c4e0, 0.5)
	fillL.position.set(-2.2, 0.7, 0.4)
	scene.add(fillL)
	const rimL = new THREE.DirectionalLight(0xdfe8ff, 1.6)
	rimL.position.set(-0.4, 1.7, 2.4)
	scene.add(rimL)
	scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2622, 0.3))

	const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 50)
	scene.add(camera)

	const rig = new THREE.Group()
	scene.add(rig)
	const akm = buildAKM(THREE, {})
	rig.add(akm)

/* ATTACH: подключение (akm) */
const ATTACH_HOST = akm;
window.__MEASURE_HOST = ATTACH_HOST; window.__MEASURE_THREE = THREE;
if (akm.parts && akm.parts.magazine) akm.parts.magazine.userData.__occGroup = 'magazine';
const ATTACH_MAGHOST = () => (akm.parts && akm.parts.magazine) || null;
let ATTACH_ASM = attachRebuildWeapon();

function attachRebuildWeapon() {
  if (ATTACH_STATE.view) {
    const r = ATTACH_STATE.view.root;
    if (r.parent) r.parent.remove(r);
    ATTACH_STATE.view.dispose();
  }
  const weapon = {
    caliber: ATTACH_DEF.caliber, weight: ATTACH_DEF.weight,
    ballistics: ATTACH_DEF.ballistics, stats: {}, base: [], nodes: {}, slots: attachSlots()
  };
  const asm = __ATTACH.SYS.assemble(weapon, __ATTACH.REG, ATTACH_STATE.config);
  const view = __ATTACH.ADAPTER.build(THREE, asm, {
    scale: 0.001,
    parentFor: (slotKey) => (slotKey === 'mag' ? ATTACH_MAGHOST() : null),
    hostRoot: ATTACH_HOST
  });
  view.root.userData.attachModule = true;
  view.root.traverse((o) => { o.userData.attachModule = true; });
  ATTACH_HOST.add(view.root);
  ATTACH_STATE.asm = asm;
  attachOcclude(THREE, ATTACH_HOST);
  ATTACH_STATE.view = view;
  attachSyncBeams();
  attachSyncDeploy();
  return asm;
}

const attachApply = ATTACH_STATE.apply = (slotKey, moduleKey) => {
  ATTACH_STATE.ui && ATTACH_STATE.ui.markStats();
  ATTACH_STATE.config[slotKey] = moduleKey;
  ATTACH_ASM = attachRebuildWeapon();
  /* вьюер подписывается на пересборку: точка глаза, вспышка, ёмкость */
  for (const fn of ATTACH_REBUILD_HOOKS) fn(ATTACH_ASM);
  ATTACH_STATE.ui && ATTACH_STATE.ui.render();
};

/* Список подписчиков заполняется ниже, когда вьюер уже построен. */
const ATTACH_REBUILD_HOOKS = [];

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
attachBindKeys(attachApply);
window.__ATTACH_DEBUG = () => ({
  weapon: "akm",
  config: ATTACH_STATE.config,
  modules: Object.keys(ATTACH_ASM.modules),
  parts: ATTACH_ASM.parts.length,
  errors: ATTACH_ASM.errors, warnings: ATTACH_ASM.warnings,
  stats: ATTACH_ASM.derived
});

	const parts = akm.parts
	const nodes = akm.nodes
	const magBase = parts.magazine.position.clone()

	// мягкая контактная тень на невидимой плоскости
	const box0 = new THREE.Box3().setFromObject(akm)
	const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.ShadowMaterial({ opacity: 0.35 }))
	floor.rotation.x = -Math.PI / 2
	floor.position.y = box0.min.y - 0.055
	floor.receiveShadow = true
	scene.add(floor)
	key.target.position.set(0, box0.min.y, (box0.min.z + box0.max.z) * 0.5)
	scene.add(key.target)

	const controls = new OrbitControls(camera, renderer.domElement)
	controls.enableDamping = true
	controls.dampingFactor = 0.06
	controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
	controls.minDistance = 0.25
	controls.maxDistance = 6
	controls.autoRotate = true
	controls.autoRotateSpeed = 0.6
	controls.addEventListener('start', () => { controls.autoRotate = false })

	// стартовый ракурс: три четверти спереди-слева-сверху, модель на 80 % кадра
	const startPos = new THREE.Vector3()
	const startTgt = new THREE.Vector3()
	function frameModel() {
		const box = new THREE.Box3().setFromObject(akm)
		const center = box.getCenter(new THREE.Vector3())
		const dir = new THREE.Vector3(-1, 0.62, -1.15).normalize()
		const fwd = dir.clone().negate()
		const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
		const cup = new THREE.Vector3().crossVectors(right, fwd).normalize()
		const tanV = Math.tan(camera.fov * Math.PI / 360)
		const tanH = tanV * camera.aspect
		const k = 0.8
		const c = new THREE.Vector3()
		let d = 0
		for (let i = 0; i < 8; i++) {
			c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center)
			const cf = c.dot(fwd)
			d = Math.max(d, Math.abs(c.dot(right)) / (tanH * k) - cf, Math.abs(c.dot(cup)) / (tanV * k) - cf)
		}
		startTgt.copy(center)
		startPos.copy(center).addScaledVector(dir, d)
		camera.position.copy(startPos)
		controls.target.copy(startTgt)
		controls.update()
	}
	frameModel()

	/* Отладочный хук: произвольный ракурс для проверки посадки модулей.
	   Используется автотестами и съёмкой сравнительных кадров. */
	window.__VIEW = (dir, dist, target) => {
		const box = new THREE.Box3().setFromObject(akm)
		const c = target ? new THREE.Vector3().fromArray(target) : box.getCenter(new THREE.Vector3())
		const d = new THREE.Vector3().fromArray(dir).normalize()
		controls.autoRotate = false
		controls.target.copy(c)
		camera.position.copy(c).addScaledVector(d, dist)
		controls.update()
		return { center: c.toArray(), min: box.min.toArray(), max: box.max.toArray() }
	}

	// двойной клик по фону — возврат в стартовый ракурс
	let tween = -1
	const tweenFromP = new THREE.Vector3(), tweenFromT = new THREE.Vector3()
	renderer.domElement.addEventListener('dblclick', () => {
		tweenFromP.copy(camera.position)
		tweenFromT.copy(controls.target)
		tween = performance.now()
	})

	/* ================= ПРИЦЕЛИВАНИЕ (ADS) =================
	   Глаз стрелка встаёт на ось активного прицела, на удалении зрачка
	   позади окуляра — эти координаты считает система модулей. Без оптики
	   работает механика: глаз позади целика, взгляд сквозь прорезь.
	   Камера летит к якорю, поворот берётся у самого оружия, поэтому
	   отдача и подброс в прицеле видны «из-за приклада», а не со стороны. */
	const adsAnchor = new THREE.Object3D()
	rig.add(adsAnchor)
	const camState = {
		ads: false, k: 0,
		fovFree: camera.fov, fovAds: 17, optic: null,
		lastInput: performance.now()
	}
	/* Механика АКМ по обмеру модели (мм): прорезь целика и вершина мушки.
	   Глаз ставится на продолжение этой линии позади целика, поэтому в
	   прицеле мушка сама оказывается в прорези. */
	const IRON_REAR = new THREE.Vector3(0, 0.0985, -0.253)
	const IRON_FRONT = new THREE.Vector3(0, 0.0965, -0.630)
	/* Глаз стрелка при щеке на прикладе стоит примерно в 200 мм позади
	   целика: камера оказывается над крышкой коробки, целик и мушка видны
	   крупно, а гребень приклада не лезет в кадр. */
	const IRON_RELIEF = 0.20
	const IRON_RISE = 0.012                        // подъём глаза над линией, м
	/* Поле зрения в прицеле. В бодикаме прицел занимает примерно треть
	   кадра и не тонул в прикладе, поэтому база — 21°: уже обзорной (35°),
	   но шире «трубы». Сужение сверх этого даёт только кратная оптика:
	   коллиматор (1x) картинку не «зумит» вовсе. */
	const ADS_FOV_BASE = 21
	const adsFov = (mag) => (mag > 1 ? ADS_FOV_BASE / mag : ADS_FOV_BASE)
	const lookAlong = (from, to) => {
		const q = new THREE.Quaternion()
		const dir = to.clone().sub(from).normalize()
		q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir)
		return q
	}
	const attachSyncSight = () => {
		const asm = ATTACH_ASM
		const a = asm && asm.activeOptic
		if (a && asm.nodes.eye) {
			const e = asm.nodes.eye
			adsAnchor.position.set(e[0] * 0.001, e[1] * 0.001, e[2] * 0.001)
			adsAnchor.rotation.set(0, 0, 0)
			camState.fovAds = adsFov(a.magnify || 1)
			camState.optic = a
		} else {
			/* глаз на линии целик→мушка, отодвинутый назад от целика */
			/* Глаз на продолжении линии целик→мушка и чуть выше неё: щека
			   лежит на гребне, поэтому крышка коробки уходит в нижнюю
			   треть кадра, а не закрывает обзор. Взгляд направлен в мушку,
			   значит она сама встаёт в прорезь целика. */
			const axis = IRON_REAR.clone().sub(IRON_FRONT).normalize()
			adsAnchor.position.copy(IRON_REAR).addScaledVector(axis, IRON_RELIEF)
			adsAnchor.position.y += IRON_RISE
			adsAnchor.quaternion.copy(lookAlong(adsAnchor.position, IRON_FRONT))
			camState.fovAds = ADS_FOV_BASE
			camState.optic = null
		}
	}
	attachSyncSight()
	/* при каждой смене модуля точка глаза пересчитывается заново */
	ATTACH_REBUILD_HOOKS.push(attachSyncSight)

	const freePos = new THREE.Vector3()
	const freeQuat = new THREE.Quaternion()
	const adsV = new THREE.Vector3(), adsQ = new THREE.Quaternion()

	function updateAds(dt) {
		const target = camState.ads ? 1 : 0
		camState.k += (target - camState.k) * Math.min(1, dt * 8.5)
		if (Math.abs(camState.k - target) < 0.0015) camState.k = target
		if (camState.k === 0) {
			controls.enabled = true
			freePos.copy(camera.position)
			freeQuat.copy(camera.quaternion)
			if (camera.fov !== camState.fovFree) { camera.fov = camState.fovFree; camera.updateProjectionMatrix() }
			return
		}
		controls.enabled = false
		controls.autoRotate = false
		adsAnchor.updateWorldMatrix(true, false)
		adsAnchor.getWorldPosition(adsV)
		adsAnchor.getWorldQuaternion(adsQ)
		const e = camState.k * camState.k * (3 - 2 * camState.k)
		camera.position.copy(freePos).lerp(adsV, e)
		camera.quaternion.copy(freeQuat).slerp(adsQ, e)
		const fov = camState.fovFree + (camState.fovAds - camState.fovFree) * e
		if (Math.abs(fov - camera.fov) > 0.002) { camera.fov = fov; camera.updateProjectionMatrix() }
	}

	const setAds = (on) => {
		if (camState.ads === on) return
		camState.ads = on
		if (on) controls.autoRotate = false
	}
	window.__ADS_DEBUG = () => ({
		ads: camState.ads, k: camState.k, fov: camera.fov, fovAds: camState.fovAds,
		optic: camState.optic ? camState.optic.meta.name : 'механика',
		camera: camera.position.toArray().map((v) => Math.round(v * 1000)),
		anchor: adsAnchor.getWorldPosition(new THREE.Vector3()).toArray().map((v) => Math.round(v * 1000))
	})

	/* ПКМ — прицеливание (как в бодикаме), поэтому панорамирование правой
	   кнопкой отключаем: иначе жесты конфликтуют. */
	controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null }
	renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())
	renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 2) setAds(true) })
	window.addEventListener('pointerup', (e) => { if (e.button === 2) setAds(false) })
	window.addEventListener('blur', () => setAds(false))

	window.addEventListener('resize', () => {
		camera.aspect = window.innerWidth / window.innerHeight
		camera.updateProjectionMatrix()
		renderer.setSize(window.innerWidth, window.innerHeight)
	})

	// ---------- дульная вспышка ----------
	function starTexture() {
		const c = document.createElement('canvas')
		c.width = c.height = 256
		const x = c.getContext('2d')
		x.globalCompositeOperation = 'lighter'
		const g = x.createRadialGradient(128, 128, 0, 128, 128, 88)
		g.addColorStop(0, 'rgba(255,252,235,1)')
		g.addColorStop(0.10, 'rgba(255,231,160,0.92)')
		g.addColorStop(0.30, 'rgba(255,158,48,0.42)')
		g.addColorStop(0.65, 'rgba(255,96,10,0.12)')
		g.addColorStop(1, 'rgba(255,80,0,0)')
		x.fillStyle = g
		x.beginPath(); x.arc(128, 128, 88, 0, Math.PI * 2); x.fill()
		x.translate(128, 128)
		for (let i = 0; i < 11; i++) {
			const a = i / 11 * Math.PI * 2 + 0.2
			const len = 124 * (i % 2 ? 0.42 : 1) * (0.72 + ((i * 37) % 13) / 13 * 0.45)
			const w = 9 * (i % 2 ? 0.6 : 1)
			const lg = x.createLinearGradient(0, 0, len, 0)
			lg.addColorStop(0, 'rgba(255,240,190,0.95)')
			lg.addColorStop(0.35, 'rgba(255,170,60,0.35)')
			lg.addColorStop(1, 'rgba(255,110,0,0)')
			x.save(); x.rotate(a); x.fillStyle = lg
			x.beginPath(); x.moveTo(0, -w); x.lineTo(len, 0); x.lineTo(0, w); x.closePath(); x.fill(); x.restore()
		}
		const t = new THREE.CanvasTexture(c)
		t.colorSpace = THREE.SRGBColorSpace
		return t
	}
	const flashMat = new THREE.MeshBasicMaterial({
		map: starTexture(), transparent: true, blending: THREE.AdditiveBlending,
		depthWrite: false, side: THREE.DoubleSide, toneMapped: false
	})
	const fgA = new THREE.PlaneGeometry(1, 0.62)
	fgA.translate(0.5, 0, 0)
	fgA.rotateY(Math.PI / 2)
	const fgB = fgA.clone()
	fgB.rotateZ(Math.PI / 2)
	const flash = new THREE.Group()
	flash.add(new THREE.Mesh(fgA, flashMat))
	flash.add(new THREE.Mesh(fgB, flashMat))
	flash.visible = false
	flash.position.copy(nodes.muzzle.position)
	akm.add(flash)
	const mLight = new THREE.PointLight(0xffb266, 0, 1.6, 2)
	mLight.position.set(nodes.muzzle.position.x, nodes.muzzle.position.y, nodes.muzzle.position.z - 0.03)
	akm.add(mLight)

	// ---------- гильзы 7,62×39 ----------
	const casePts = []
	{
		const P = [[0.0001, 0], [5.67, 0], [5.67, 2], [5.2, 3.4], [5.2, 21], [4.35, 29.5], [4.32, 39],
		[3.85, 39], [3.88, 30], [4.7, 21.5], [4.7, 4], [0.0001, 4]]
		for (const p of P) casePts.push(new THREE.Vector2(p[0] / 1000, (p[1] - 19.5) / 1000))
	}
	const caseGeo = new THREE.LatheGeometry(casePts, 32)
	const caseMat = new THREE.MeshStandardMaterial({ color: 0xb08d3f, metalness: 0.9, roughness: 0.3 })
	const cases = []
	const _wp = new THREE.Vector3(), _wq = new THREE.Quaternion()
	function spawnCase() {
		let c = null
		for (const o of cases) if (!o.alive) { c = o; break }
		if (!c) {
			if (cases.length >= 26) return
			c = { mesh: new THREE.Mesh(caseGeo, caseMat), v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0, alive: false }
			c.mesh.castShadow = true
			scene.add(c.mesh)
			cases.push(c)
		}
		nodes.eject.getWorldPosition(_wp)
		nodes.ejectDir.getWorldQuaternion(_wq)
		const d = new THREE.Vector3(0, 0, -1).applyQuaternion(_wq)
		c.mesh.position.copy(_wp)
		c.mesh.quaternion.copy(_wq)
		c.mesh.rotateX(Math.PI / 2)
		c.v.copy(d).multiplyScalar(3.1 + Math.random() * 0.7)
		c.v.x += (Math.random() - 0.5) * 0.5
		c.v.y += (Math.random() - 0.5) * 0.5
		c.w.set((Math.random() - 0.5) * 34, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 30)
		c.t = 0
		c.alive = true
		c.mesh.visible = true
		sndCasing()
	}

	// ---------- ЗВУК: Web Audio API, процедурно ----------
	let actx = null, master = null, comp = null, echoIn = null, noiseBuf = null
	let muted = false
	function audio() {
		if (actx) { if (actx.state === 'suspended') actx.resume(); return actx }
		const AC = window.AudioContext || window.webkitAudioContext
		if (!AC) return null
		actx = new AC()
		master = actx.createGain()
		master.gain.value = muted ? 0 : 0.8
		comp = actx.createDynamicsCompressor()
		comp.threshold.value = -18
		comp.ratio.value = 8
		comp.knee.value = 8
		comp.attack.value = 0.002
		comp.release.value = 0.14
		comp.connect(master)
		master.connect(actx.destination)
		const sr = actx.sampleRate
		noiseBuf = actx.createBuffer(1, Math.floor(sr * 1.6), sr)
		const nd = noiseBuf.getChannelData(0)
		for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
		// процедурный импульс 1.2 с с экспонентой и ранними отражениями
		const L = Math.floor(sr * 1.2)
		const ir = actx.createBuffer(2, L, sr)
		for (let ch = 0; ch < 2; ch++) {
			const a = ir.getChannelData(ch)
			for (let i = 0; i < L; i++) {
				const t = i / sr
				a[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3.4) * Math.pow(1 - i / L, 1.6)
			}
			const refl = [[0.029, 0.62], [0.047, 0.44], [0.083, 0.27]]
			for (const r of refl) {
				const k = Math.floor(r[0] * sr * (1 + ch * 0.06))
				if (k < L) { a[k] += r[1]; a[k + 1] -= r[1] * 0.5 }
			}
		}
		const conv = actx.createConvolver()
		conv.buffer = ir
		echoIn = actx.createGain()
		echoIn.gain.value = 0.25
		echoIn.connect(conv)
		conv.connect(comp)
		return actx
	}
	function noiseSrc(t, dur, rate) {
		const s = actx.createBufferSource()
		s.buffer = noiseBuf
		s.loop = true
		s.playbackRate.value = rate || 1
		s.start(t, Math.random() * 1.2)
		s.stop(t + dur)
		return s
	}
	function env(g, t, peak, atk, dur, curve) {
		g.gain.setValueAtTime(0.0001, t)
		g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + atk)
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
		if (curve) g.gain.setValueAtTime(0.0001, t + dur + 0.001)
	}
	function sndShot() {
		if (!audio()) return
		const t = actx.currentTime + 0.002
		const p = 1 + (Math.random() * 2 - 1) * 0.04   // питч ±4 %
		const v = 1 + (Math.random() * 2 - 1) * 0.08   // громкос��ь ±8 %
		const tl = 1 + (Math.random() * 2 - 1) * 0.10  // длина хвоста ±10 %
		// 1) крэк: белый шум 8 мс через bandpass 3–6 кГц
		const bp = actx.createBiquadFilter()
		bp.type = 'bandpass'
		bp.frequency.value = 4400 * p
		bp.Q.value = 1.45
		const g1 = actx.createGain()
		noiseSrc(t, 0.03, p).connect(bp)
		bp.connect(g1)
		g1.connect(comp)
		env(g1, t, 0.95 * v, 0.0005, 0.008)
		// 2) тело: шум 260 мс, lowpass 6000 → 300 Гц
		const lp = actx.createBiquadFilter()
		lp.type = 'lowpass'
		lp.Q.value = 1.2
		lp.frequency.setValueAtTime(6000 * p, t)
		lp.frequency.exponentialRampToValueAtTime(300 * p, t + 0.26)
		const g2 = actx.createGain()
		noiseSrc(t, 0.28, p).connect(lp)
		lp.connect(g2)
		g2.connect(comp)
		g2.connect(echoIn)
		env(g2, t, 0.8 * v, 0.003, 0.26)
		// 3) низ: синус 150 → 42 Гц за 90 мс — калибр 7,62
		const o = actx.createOscillator()
		o.type = 'sine'
		o.frequency.setValueAtTime(150 * p, t)
		o.frequency.exponentialRampToValueAtTime(42 * p, t + 0.09)
		const g3 = actx.createGain()
		o.connect(g3)
		g3.connect(comp)
		env(g3, t, 1.0 * v, 0.004, 0.2)
		o.start(t)
		o.stop(t + 0.24)
		// 4) хвост через свёртку
		const g4 = actx.createGain()
		const hp4 = actx.createBiquadFilter()
		hp4.type = 'highpass'
		hp4.frequency.value = 220
		noiseSrc(t, 0.2 * tl, p).connect(hp4)
		hp4.connect(g4)
		g4.connect(echoIn)
		env(g4, t, 0.9 * v, 0.003, 0.19 * tl)
	}
	function sndClack() {
		if (!audio()) return
		const t0 = actx.currentTime + 0.002
		const mk = (t, dur, lvl) => {
			const hp = actx.createBiquadFilter()
			hp.type = 'highpass'
			hp.frequency.value = 2000
			const g = actx.createGain()
			noiseSrc(t, dur + 0.01, 1).connect(hp)
			hp.connect(g)
			g.connect(comp)
			g.connect(echoIn)
			env(g, t, lvl, 0.0006, dur)
		}
		mk(t0, 0.012, 0.5)
		mk(t0 + 0.04, 0.018, 0.3)
	}
	/* Гильза о бетон: три коротких удара латуни. Чистые синусы давали
	   «колокольчик», поэтому тон здесь — узкополосный шум с быстрым
	   затуханием, без тянущейся ноты. */
	function sndCasing() {
		if (!audio()) return
		const t = actx.currentTime + 0.22 + Math.random() * 0.22
		for (let i = 0; i < 3; i++) {
			const tt = t + i * (0.055 + Math.random() * 0.05)
			const lvl = (0.085 - i * 0.026) * (0.8 + Math.random() * 0.4)
			if (lvl <= 0.004) continue
			const bp = actx.createBiquadFilter()
			bp.type = 'bandpass'
			bp.frequency.value = 3000 + Math.random() * 2600
			bp.Q.value = 5.5
			const hp = actx.createBiquadFilter()
			hp.type = 'highpass'
			hp.frequency.value = 1800
			const g = actx.createGain()
			noiseSrc(tt, 0.05, 1).connect(bp)
			bp.connect(hp)
			hp.connect(g)
			g.connect(comp)
			g.connect(echoIn)
			env(g, tt, lvl, 0.0005, 0.032)
		}
	}
	function sndLatch() {
		if (!audio()) return
		const t = actx.currentTime + 0.002
		const hp = actx.createBiquadFilter()
		hp.type = 'highpass'
		hp.frequency.value = 2600
		const g = actx.createGain()
		noiseSrc(t, 0.02, 1).connect(hp)
		hp.connect(g)
		g.connect(comp)
		env(g, t, 0.42, 0.0005, 0.009)
	}
	function sndMagIn() {
		if (!audio()) return
		const t = actx.currentTime + 0.002
		const lp = actx.createBiquadFilter()
		lp.type = 'lowpass'
		lp.frequency.value = 520
		const g = actx.createGain()
		noiseSrc(t, 0.14, 1).connect(lp)
		lp.connect(g)
		g.connect(comp)
		g.connect(echoIn)
		env(g, t, 0.7, 0.002, 0.12)
		const o = actx.createOscillator()
		o.type = 'sine'
		o.frequency.setValueAtTime(190, t)
		o.frequency.exponentialRampToValueAtTime(70, t + 0.08)
		const g2 = actx.createGain()
		o.connect(g2)
		g2.connect(comp)
		env(g2, t, 0.5, 0.003, 0.1)
		o.start(t)
		o.stop(t + 0.14)
	}
	function sndDry() {
		if (!audio()) return
		const t = actx.currentTime + 0.002
		const hp = actx.createBiquadFilter()
		hp.type = 'highpass'
		hp.frequency.value = 3200
		const g = actx.createGain()
		noiseSrc(t, 0.016, 1).connect(hp)
		hp.connect(g)
		g.connect(comp)
		env(g, t, 0.55, 0.0004, 0.007)
	}

	// ---------- состояние и анимация ----------
	const RELOAD_MS = 2600
	const S = { ammo: 30, held: false, lastShot: -1e9, shot: -1e9, reload: -1e9, dry: false, stage: 9,
		mode: 'auto', semiLatch: false }
	/* Переводчик огня АКМ: предохранитель — автоматический — одиночный. */
	const MODE_ORDER = ['safe', 'auto', 'semi']
	const MODE_NAME = { safe: 'ПРЕДОХР', auto: 'АВТО', semi: 'ОДИНОЧНЫЙ' }
	let shakeAmp = 0
	let trig = 0
	const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
	const ss = (v) => v * v * (3 - 2 * v)

	function doShot(now) {
		S.ammo--
		S.shot = now
		flash.visible = true
		flash.rotation.z = Math.random() * Math.PI * 2
		const sc = 0.155 * (0.8 + Math.random() * 0.5)   // масштаб 0.8–1.3
		flash.scale.set(sc, sc, sc)
		mLight.intensity = 11
		spawnCase()
		sndShot()
		shakeAmp = 0.0028                                // дрожь камеры 2–3 мм
	}
	function tryShot(now) {
		if (now - S.reload < RELOAD_MS) return
		if (S.mode === 'safe') { if (!S.dry) { sndDry(); S.dry = true } return }
		if (S.mode === 'semi' && S.semiLatch) return
		if (now - S.lastShot < 100) return               // 600 выстрелов в минуту
		if (S.ammo <= 0) {
			if (!S.dry) { sndDry(); S.dry = true }
			return
		}
		S.lastShot = (now - S.lastShot > 260) ? now : S.lastShot + 100
		doShot(now)
		if (S.mode === 'semi') S.semiLatch = true
	}
	function startReload(now) {
		if (now - S.reload < RELOAD_MS) return
		S.reload = now
		S.stage = 0
		sndLatch()
	}

	// ---------- кнопки ----------
	const btnFire = document.getElementById('fire')
	const btnReload = document.getElementById('reload')
	const btnMute = document.getElementById('mute')
	const btnMode = document.getElementById('mode')
	function syncMode() {
		if (btnMode) {
			btnMode.textContent = MODE_NAME[S.mode]
			btnMode.classList.toggle('on', S.mode !== 'safe')
		}
	}
	function cycleMode() {
		S.mode = MODE_ORDER[(MODE_ORDER.indexOf(S.mode) + 1) % MODE_ORDER.length]
		S.semiLatch = false
		sndLatch()
		syncMode()
	}
	window.__cycleFireMode = cycleMode
	if (btnMode) btnMode.addEventListener('click', () => { audio(); cycleMode() })
	syncMode()
	const holdOn = (ev) => {
		if (ev) ev.preventDefault()
		audio()
		S.held = true
		S.dry = false
		btnFire.classList.add('on')
		tryShot(performance.now())
	}
	const holdOff = () => {
		S.held = false
		S.semiLatch = false
		btnFire.classList.remove('on')
	}
	btnFire.addEventListener('pointerdown', holdOn)
	btnFire.addEventListener('pointerup', holdOff)
	btnFire.addEventListener('pointercancel', holdOff)
	btnFire.addEventListener('pointerleave', holdOff)
	btnFire.addEventListener('contextmenu', (e) => e.preventDefault())
	btnReload.addEventListener('pointerdown', (e) => {
		e.preventDefault()
		audio()
		btnReload.classList.add('on')
		startReload(performance.now())
	})
	btnReload.addEventListener('pointerup', () => btnReload.classList.remove('on'))
	btnReload.addEventListener('pointerleave', () => btnReload.classList.remove('on'))
	btnMute.addEventListener('click', () => {
		muted = !muted
		if (master) master.gain.value = muted ? 0 : 0.8
		document.getElementById('w1').style.display = muted ? 'none' : ''
		document.getElementById('w2').style.display = muted ? 'none' : ''
		document.getElementById('w3').style.display = muted ? '' : 'none'
		btnMute.style.color = muted ? '#71777e' : ''
	})
	window.addEventListener('keydown', (e) => {
		if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) holdOn(null) }
		else if (e.code === 'KeyR') { audio(); startReload(performance.now()) }
		else if (e.code === 'KeyF') { e.preventDefault(); if (!e.repeat) setAds(!camState.ads) }
	})
	window.addEventListener('keyup', (e) => {
		if (e.code === 'Space') { e.preventDefault(); holdOff() }
	})
	window.addEventListener('pointerdown', () => audio(), { passive: true })
	window.addEventListener('blur', holdOff)

	// ---------- цик�� ----------
	const shake = new THREE.Vector3()
	let prev = performance.now()
	let broken = false
	function frame(now) {
		const dt = Math.min(0.05, (now - prev) / 1000)
		prev = now

		if (S.held) tryShot(now)

		// отдача считается от ИСХОДНОЙ позы, а не от текущей
		let posZ = 0, rotX = 0, rotZ = 0, rotY = 0, boltZ = 0
		const es = now - S.shot
		if (es >= 0 && es <= 100) {
			const k = es <= 35 ? es / 35 : Math.pow(1 - (es - 35) / 65, 3)
			posZ = 0.016 * k                              // уход назад на 16 мм
			rotX = 2.2 * RAD * k                          // подброс на 2.2°
			boltZ = es <= 55 ? 0.110 * (es / 55) : 0.110 * (1 - (es - 55) / 45)
		}
		if (flash.visible && es > 35) flash.visible = false
		mLight.intensity = Math.max(0, mLight.intensity - dt * 330)

		// перезарядка 2.6 с
		const er = now - S.reload
		let magVis = true
		const mag = parts.magazine
		if (er >= 0 && er < RELOAD_MS + 40) {
			const roll = ss(clamp01(er / 260)) * (1 - ss(clamp01((er - 2400) / 200)))
			rotZ = -14 * RAD * roll
			rotY = 9 * RAD * roll
			rotX += -2.5 * RAD * roll
			let my = 0, mz = 0, mrx = 0
			if (er < 120) { /* щелчок защёлки и наклон */ }
			else if (er < 380) { const k = ss(clamp01((er - 120) / 260)); my = -0.115 * k; mz = -0.05 * k; mrx = -0.42 * k }
			else if (er < 900) { magVis = false }
			else if (er < 1450) { const k = ss(clamp01((er - 900) / 550)); my = -0.17 * (1 - k); mz = -0.075 * (1 - k); mrx = -0.5 * (1 - k) }
			else if (er < 1560) { my = -0.0035 * Math.sin((er - 1450) / 110 * Math.PI) }   // удар фиксации
			mag.position.set(magBase.x, magBase.y + my, magBase.z + mz)
			mag.rotation.x = mrx
			if (er >= 1900 && er < 2060) boltZ = 0.110 * ss(clamp01((er - 1900) / 160))   // рывок рукоятки
			else if (er >= 2060 && er < 2150) boltZ = 0.110 * (1 - ss(clamp01((er - 2060) / 90)))
			if (S.stage < 1 && er >= 380) { S.stage = 1; sndClack() }
			if (S.stage < 2 && er >= 1440) { S.stage = 2; sndMagIn() }
			if (S.stage < 3 && er >= 1900) { S.stage = 3; sndClack() }
			if (S.stage < 4 && er >= 2400) { S.stage = 4; S.ammo = 30; S.dry = false }
		} else if (S.stage < 9) {
			S.stage = 9
			mag.position.copy(magBase)
			mag.rotation.x = 0
		}
		mag.visible = magVis

		rig.position.z = posZ
		rig.rotation.set(rotX, rotY, rotZ)
		parts.bolt.position.z = boltZ
		parts.charging.position.z = boltZ
		const trigT = (S.held && S.ammo > 0 && now - S.reload > RELOAD_MS) || es < 60 ? 1 : 0
		trig += (trigT - trig) * Math.min(1, dt * 26)
		parts.trigger.rotation.x = 13 * RAD * trig

		// гильзы
		for (const c of cases) {
			if (!c.alive) continue
			c.t += dt
			c.v.y -= 9.81 * dt
			c.mesh.position.addScaledVector(c.v, dt)
			c.mesh.rotateX(c.w.x * dt)
			c.mesh.rotateY(c.w.y * dt)
			c.mesh.rotateZ(c.w.z * dt)
			if (c.t > 1.2) { c.alive = false; c.mesh.visible = false }
		}

		// возврат в стартовый ракурс
		if (tween > 0) {
			const k = ss(clamp01((now - tween) / 620))
			camera.position.lerpVectors(tweenFromP, startPos, k)
			controls.target.lerpVectors(tweenFromT, startTgt, k)
			if (k >= 1) tween = -1
		}
		if (controls.enabled) controls.update()
		updateAds(dt)

		shakeAmp *= Math.exp(-dt * 20)
		if (shakeAmp > 1e-5) {
			shake.set((Math.random() - 0.5) * 2 * shakeAmp, (Math.random() - 0.5) * 2 * shakeAmp, (Math.random() - 0.5) * 2 * shakeAmp)
			camera.position.add(shake)
			renderer.render(scene, camera)
			camera.position.sub(shake)
		} else {
			renderer.render(scene, camera)
		}
	}
	renderer.setAnimationLoop((now) => {
		if (broken) return
		try { frame(now || performance.now()) } catch (e) { broken = true; renderer.setAnimationLoop(null); fail(e) }
	})
} catch (e) {
	fail(e)
}
