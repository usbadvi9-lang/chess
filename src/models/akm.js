function buildAKM(THREE, opts = {}) {
	const mm = (v) => v / 1000                  // все размеры пишем в мм
	const B = mm(75)                            // ось канала ствола: 75 мм над origin
	const RAD = Math.PI / 180
	const group = new THREE.Group()
	group.name = 'AKM'

	// ---------- материалы ----------
	const mats = {
		blued:      new THREE.MeshStandardMaterial({ color: 0x23262a, metalness: 0.85, roughness: 0.42 }),
		parkerized: new THREE.MeshStandardMaterial({ color: 0x2a2d30, metalness: 0.72, roughness: 0.60 }),
		wood:       new THREE.MeshStandardMaterial({ color: 0x6b4423, metalness: 0.00, roughness: 0.62 }),
		woodEdge:   new THREE.MeshStandardMaterial({ color: 0x7d5430, metalness: 0.00, roughness: 0.50 }),
		steelDark:  new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.55, roughness: 0.58 }),
		brass:      new THREE.MeshStandardMaterial({ color: 0xb08d3f, metalness: 0.90, roughness: 0.30 }),
		rubber:     new THREE.MeshStandardMaterial({ color: 0x121314, metalness: 0.00, roughness: 0.90 })
	}
	const WOOD = [mats.woodEdge, mats.wood]     // торцы чуть светлее — потёртый лак

	// ---------- служебные функции ----------
	const geoms = []
	const track = (g) => { geoms.push(g); return g }

	function put(parent, geo, mat, name) {
		const m = new THREE.Mesh(geo, mat)
		m.castShadow = true
		m.receiveShadow = true
		if (name) m.name = name
		parent.add(m)
		return m
	}

	// скруглённый прямоугольник как Shape
	function rrect(w, h, r, cx = 0, cy = 0) {
		const s = new THREE.Shape()
		r = Math.min(r, w / 2 - 1e-6, h / 2 - 1e-6)
		if (r < 1e-5) r = 1e-5
		const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2
		s.moveTo(x0 + r, y0)
		s.lineTo(x1 - r, y0)
		s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false)
		s.lineTo(x1, y1 - r)
		s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false)
		s.lineTo(x0 + r, y1)
		s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false)
		s.lineTo(x0, y0 + r)
		s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false)
		return s
	}
	function holeCircle(r, cx, cy) { const p = new THREE.Path(); p.absarc(cx, cy, r, 0, Math.PI * 2, false); return p }
	function holeOval(w, h, cx, cy) { const p = new THREE.Path(); p.absellipse(cx, cy, w / 2, h / 2, 0, Math.PI * 2, false, 0); return p }
	function holeRect(w, h, r, cx, cy) { return rrect(w, h, r, cx, cy) }

	// профиль в плоскости (Z,Y) -> выдавливание по X, толщина t, центр слоя xc
	function slabX(shape, t, xc, o) {
		o = o || {}
		const g = new THREE.ExtrudeGeometry(shape, {
			depth: t, steps: 1, curveSegments: o.cs || 12,
			bevelEnabled: o.bevel !== false,
			bevelThickness: o.bt !== undefined ? o.bt : mm(0.4),
			bevelSize: o.bs !== undefined ? o.bs : mm(0.4),
			bevelOffset: 0, bevelSegments: o.sg !== undefined ? o.sg : 3
		})
		g.rotateY(-Math.PI / 2)                   // локальный X -> мировой Z
		g.translate(xc + t / 2, 0, 0)
		return track(g)
	}

	// сечение в плоскости (X,Y) -> выдавливание по Z между z0 и z1
	function slabZ(shape, z0, z1, o) {
		o = o || {}
		const g = new THREE.ExtrudeGeometry(shape, {
			depth: Math.abs(z1 - z0), steps: 1, curveSegments: o.cs || 12,
			bevelEnabled: o.bevel !== false,
			bevelThickness: o.bt !== undefined ? o.bt : mm(0.4),
			bevelSize: o.bs !== undefined ? o.bs : mm(0.4),
			bevelOffset: 0, bevelSegments: o.sg !== undefined ? o.sg : 3
		})
		g.translate(0, 0, Math.min(z0, z1))
		return track(g)
	}

	// тело вращения вдоль оси Z: профиль [[радиус, отступ вперёд], ...]
	function latheZ(prof, y0, z0, seg) {
		const pts = prof.map((p) => new THREE.Vector2(Math.max(p[0], 1e-5), p[1]))
		const g = new THREE.LatheGeometry(pts, seg || 32)
		g.rotateX(-Math.PI / 2)                   // локальный +Y -> мировой −Z (направление выстрела)
		g.translate(0, y0, z0)
		return track(g)
	}

	// труба со сквозным каналом и фасками на всех кромках
	function tubeZ(ro, ri, len, y0, z0, seg, cham) {
		const c = cham !== undefined ? cham : mm(0.6)
		return latheZ([
			[ro, c], [ro, len - c], [ro - c, len], [ri + c, len],
			[ri, len - c], [ri, c], [ri + c, 0], [ro - c, 0], [ro, c]
		], y0, z0, seg || 48)
	}
	// сплошной стержень с фасками
	function rodZ(r, len, y0, z0, seg, cham) {
		const c = cham !== undefined ? cham : mm(0.5)
		return latheZ([
			[1e-5, 0], [r - c, 0], [r, c], [r, len - c], [r - c, len], [1e-5, len]
		], y0, z0, seg || 32)
	}
	// заклёпка / винт: купол вдоль +Y, потом поворачиваем как надо
	function domeY(d, h, seg) {
		const r = d / 2, pts = [new THREE.Vector2(r, -mm(0.4)), new THREE.Vector2(r, 0)]
		for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(Math.cos(a) * r, 1e-5), Math.sin(a) * h)) }
		return track(new THREE.LatheGeometry(pts, seg || 24))
	}

	// суперэллипс — сечение для лофта (дерево, магазин)
	function superRing(a, b, p, n) {
		const out = []
		for (let i = 0; i < n; i++) {
			const t = (i / n) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t)
			out.push(new THREE.Vector2(
				a * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / p),
				b * Math.sign(st) * Math.pow(Math.abs(st), 2 / p)))
		}
		return out
	}

	// лофт по кольцам произвольных точек, с торцами и а��то-проверкой нормалей
	function loft(rings) {
		const n = rings[0].length, m = rings.length
		const pos = [], idx = []
		for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const p = rings[j][i]; pos.push(p.x, p.y, p.z) }
		for (let j = 0; j < m - 1; j++) for (let i = 0; i < n; i++) {
			const i2 = (i + 1) % n, a = j * n + i, b = j * n + i2, c = (j + 1) * n + i, d = (j + 1) * n + i2
			idx.push(a, c, d, a, d, b)
		}
		const capA = pos.length / 3
		let cx = 0, cy = 0, cz = 0
		for (let i = 0; i < n; i++) { cx += rings[0][i].x; cy += rings[0][i].y; cz += rings[0][i].z }
		pos.push(cx / n, cy / n, cz / n)
		for (let i = 0; i < n; i++) idx.push(capA, (i + 1) % n, i)
		const capB = pos.length / 3
		cx = cy = cz = 0
		for (let i = 0; i < n; i++) { cx += rings[m - 1][i].x; cy += rings[m - 1][i].y; cz += rings[m - 1][i].z }
		pos.push(cx / n, cy / n, cz / n)
		const base = (m - 1) * n
		for (let i = 0; i < n; i++) idx.push(capB, base + i, base + (i + 1) % n)
		let vol = 0
		for (let k = 0; k < idx.length; k += 3) {
			const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3
			vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
				- pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
				+ pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])
		}
		if (vol < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t }
		const g = new THREE.BufferGeometry()
		g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
		g.setIndex(idx)
		g.computeVertexNormals()
		return track(g)
	}

	// плавная интерполяция ключей вида [t, value]
	function spline(keys) {
		const c = new THREE.SplineCurve(keys.map((k) => new THREE.Vector2(k[0], k[1])))
		return (u) => c.getPoint(Math.min(Math.max(u, 0), 1)).y
	}

	// цифры дальности и буквы АВ/ОД — выдавленной геометрией, без текстур
	const SEG7 = { 1: [1, 2], 2: [0, 1, 6, 4, 3], 3: [0, 1, 6, 2, 3], 4: [5, 6, 1, 2], 5: [0, 5, 6, 2, 3], 6: [0, 5, 4, 3, 2, 6], 7: [0, 1, 2], 8: [0, 1, 2, 3, 4, 5, 6], 9: [0, 5, 1, 6, 2, 3], 0: [0, 1, 2, 3, 4, 5] }
	const SEGBOX = [
		[0.50, 1.94, 0.86, 0.16], [0.94, 1.50, 0.16, 0.84], [0.94, 0.50, 0.16, 0.84],
		[0.50, 0.06, 0.86, 0.16], [0.06, 0.50, 0.16, 0.84], [0.06, 1.50, 0.16, 0.84],
		[0.50, 1.00, 0.86, 0.16]
	]
	function digitShapes(d, s, ox, oy) {
		const list = SEG7[d] || SEG7[8], out = []
		for (let i = 0; i < list.length; i++) {
			const b = SEGBOX[list[i]]
			out.push(rrect(b[2] * s, b[3] * s, Math.min(b[2], b[3]) * s * 0.3, ox + b[0] * s, oy + b[1] * s))
		}
		return out
	}
	function poly(pts) {
		const s = new THREE.Shape()
		s.moveTo(pts[0][0], pts[0][1])
		for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1])
		s.closePath()
		return s
	}
	function letterShapes(ch) {
		if (ch === 'A') {
			return [poly([[0.00, 0], [0.28, 0], [0.60, 2.0], [0.40, 2.0]]),
				poly([[0.72, 0], [1.00, 0], [0.60, 2.0], [0.40, 2.0]]),
				rrect(0.56, 0.20, 0.06, 0.50, 0.62)]
		}
		if (ch === 'V') {
			const top = rrect(0.70, 1.00, 0.24, 0.53, 1.50); top.holes.push(holeRect(0.30, 0.46, 0.10, 0.63, 1.50))
			const bot = rrect(0.80, 1.04, 0.28, 0.58, 0.52); bot.holes.push(holeRect(0.36, 0.50, 0.12, 0.68, 0.52))
			return [rrect(0.24, 2.0, 0.05, 0.14, 1.0), top, bot]
		}
		if (ch === 'O') {
			const s = new THREE.Shape(); s.absellipse(0.5, 1.0, 0.48, 1.0, 0, Math.PI * 2, false, 0)
			s.holes.push(holeOval(0.52, 1.16, 0.5, 1.0))
			return [s]
		}
		const body = poly([[0.24, 0.24], [0.86, 0.24], [0.86, 2.00], [0.34, 2.00]])
		body.holes.push(holeRect(0.32, 1.24, 0.08, 0.58, 1.06))
		return [body, rrect(1.00, 0.24, 0.05, 0.50, 0.12),
			rrect(0.14, 0.22, 0.04, 0.10, -0.11), rrect(0.14, 0.22, 0.04, 0.90, -0.11)]
	}

	// ---------- узлы и подвижные группы ----------
	const gStatic = new THREE.Group(); group.add(gStatic)
	const pMag = new THREE.Group(); const pBolt = new THREE.Group()
	const pCharge = new THREE.Group(); const pTrigger = new THREE.Group(); const pSelector = new THREE.Group()
	group.add(pMag, pBolt, pTrigger, pSelector)
	pBolt.add(pCharge)

	// =========================================================
	// 1. СТВОЛЬНАЯ КОРОБКА  Z: +40 → −225, ширина 34 мм
	// =========================================================
	const RZB = mm(40), RZF = mm(-225)            // границы коробки
	const RTOP = B + mm(18), RBOT = B - mm(45)    // верх и низ
	const RHW = mm(17)                            // полуширина 34/2
	const WALL = mm(1.2)                          // штамповка ~1 мм
	const MAGW_B = mm(-78), MAGW_F = mm(-158)     // окно под магазин в днище

	function receiverSide(port) {
		const s = new THREE.Shape()
		const hump = RBOT - mm(9)                   // характерный «горб» над магазином: 9 мм вниз
		s.moveTo(RZB, RBOT + mm(7))
		s.lineTo(RZB, RTOP - mm(9))
		s.quadraticCurveTo(RZB, RTOP, RZB - mm(9), RTOP)
		s.lineTo(RZF + mm(12), RTOP)
		s.quadraticCurveTo(RZF, RTOP, RZF, RTOP - mm(12))
		s.lineTo(RZF, RBOT + mm(7))
		s.quadraticCurveTo(RZF, RBOT, RZF + mm(7), RBOT)
		s.lineTo(MAGW_F - mm(7), RBOT)
		s.quadraticCurveTo(MAGW_F, RBOT, MAGW_F + mm(2), hump)
		s.lineTo(MAGW_B - mm(2), hump)
		s.quadraticCurveTo(MAGW_B, RBOT, MAGW_B + mm(7), RBOT)
		s.lineTo(RZB - mm(7), RBOT)
		s.quadraticCurveTo(RZB, RBOT, RZB, RBOT + mm(7))
		if (port) s.holes.push(holeRect(mm(42), mm(22), mm(4), mm(-147.5), B + mm(4))) // окно выброса 42×22
		return s
	}
	put(gStatic, slabX(receiverSide(false), WALL, -RHW + WALL / 2, { cs: 14 }), mats.blued, 'receiverL')
	put(gStatic, slabX(receiverSide(true), WALL, RHW - WALL / 2, { cs: 14 }), mats.blued, 'receiverR')

	// продольное ребро жёсткости на каждой боковине (выступ 1.2 мм)
	const ribShape = rrect(mm(196), mm(6), mm(2.4), mm(-108), B - mm(24))
	put(gStatic, slabX(ribShape, mm(1.2), -RHW - mm(0.6), { cs: 8 }), mats.blued, 'ribL')
	put(gStatic, slabX(ribShape, mm(1.2), RHW + mm(0.6), { cs: 8 }), mats.blued, 'ribR')

	// днище коробки двумя участками — посередине сквозное окно под магазин
	const floorSec = rrect(mm(33.6), mm(1.6), mm(0.6), 0, RBOT + mm(0.8))
	put(gStatic, slabZ(floorSec, RZB, MAGW_B, { cs: 6 }), mats.blued, 'floorRear')
	put(gStatic, slabZ(floorSec, MAGW_F, RZF, { cs: 6 }), mats.blued, 'floorFront')
	// стенки магазинной горловины
	const throatSec = rrect(mm(33.6), mm(11), mm(1.2), 0, RBOT - mm(4))
	put(gStatic, slabZ(throatSec, MAGW_B, MAGW_B - mm(4), { cs: 6 }), mats.steelDark, 'throatB')
	put(gStatic, slabZ(throatSec, MAGW_F, MAGW_F + mm(4), { cs: 6 }), mats.steelDark, 'throatF')

	// тёмные внутренности (видны в окне выброса)
	put(gStatic, slabZ(rrect(mm(31), mm(26), mm(3), 0, B - mm(13)), mm(-70), mm(-205), { cs: 6 }), mats.steelDark, 'innards')

	// задняя стенка + хвостовик под приклад
	put(gStatic, slabZ(rrect(mm(33.6), mm(62), mm(5), 0, B - mm(13.5)), RZB, RZB - mm(6), { cs: 10 }), mats.blued, 'backPlate')
	// передняя ствольная коробочка (труннион) со сквозным отверстием под ствол
	const trunnion = rrect(mm(33.6), mm(58), mm(6), 0, B - mm(11))
	trunnion.holes.push(holeCircle(mm(9.9), 0, B))
	put(gStatic, slabZ(trunnion, mm(-190), RZF, { cs: 20 }), mats.blued, 'trunnion')

	// отбортовка окна выброса (рамка со сквозным отверстием)
	const portRim = rrect(mm(50), mm(30), mm(7), mm(-147.5), B + mm(4))
	portRim.holes.push(holeRect(mm(42), mm(22), mm(4), mm(-147.5), B + mm(4)))
	put(gStatic, slabX(portRim, mm(1.1), RHW + mm(0.55), { cs: 14 }), mats.blued, 'portRim')

	// 8 заклёпок ш 6 мм, выступ 1 мм — по 4 с каждой стороны
	const rivetG = domeY(mm(6), mm(1), 24)
	const rivetPos = [[mm(24), B - mm(8)], [mm(10), B - mm(36)], [mm(-196), B - mm(6)], [mm(-210), B - mm(33)]]
	for (const rp of rivetPos) {
		const a = put(gStatic, rivetG, mats.blued, 'rivet')
		a.position.set(RHW, rp[1], rp[0]); a.rotation.z = -Math.PI / 2
		const b = put(gStatic, rivetG, mats.blued, 'rivet')
		b.position.set(-RHW, rp[1], rp[0]); b.rotation.z = Math.PI / 2
	}

	// =========================================================
	// 3. ПЫЛЕЗАЩИТНАЯ КРЫШКА  Z: +35 → −180, ширина 36 мм
	// =========================================================
	const CHW = mm(18), CYB = B + mm(11), CT = mm(1.3)
	function coverTop(x) {
		const u = Math.abs(x) / CHW
		let y = B + mm(21) - mm(8.5) * u * u                       // свод крышки
		const d = (Math.abs(x) - mm(9.5)) / mm(2.6)
		y += Math.exp(-d * d) * mm(1.7)                            // две продольные выштамповки
		return y
	}
	function coverSection() {
		const s = new THREE.Shape(), N = 26
		s.moveTo(-CHW, CYB)
		for (let i = 0; i <= N; i++) { const x = -CHW + (2 * CHW * i) / N; s.lineTo(x, coverTop(x)) }
		s.lineTo(CHW, CYB)
		s.lineTo(CHW - CT, CYB)
		for (let i = N; i >= 0; i--) { const x = -CHW + (2 * CHW * i) / N; s.lineTo(x * (1 - CT / CHW), coverTop(x) - CT) }
		s.lineTo(-CHW + CT, CYB)
		s.closePath()
		return s
	}
	put(gStatic, slabZ(coverSection(), mm(35), mm(-172), { cs: 8, bt: mm(1.2), bs: mm(1.1) }), mats.blued, 'dustCover')
	// боковые стенки уходят вперёд до −180: между ними полукруглый вырез
	const coverWalls = [rrect(CT, mm(9), mm(0.4), CHW - CT / 2, CYB + mm(3)), rrect(CT, mm(9), mm(0.4), -CHW + CT / 2, CYB + mm(3))]
	put(gStatic, slabZ(coverWalls, mm(-172), mm(-180), { cs: 4 }), mats.blued, 'coverNose')
	// кнопка направляющего стержня сзади — её цепляют при снятии крышки
	put(gStatic, tubeZ(mm(4.4), mm(1.6), mm(6), B + mm(8), mm(44), 24, mm(0.8)), mats.blued, 'guideButton')

	// =========================================================
	// 4. ЗАТВОРНАЯ РАМА + РУКОЯТКА ВЗВЕДЕНИЯ (ход 110 мм)
	// =========================================================
	const carrierSec = rrect(mm(26), mm(19), mm(3.5), 0, B + mm(5))
	put(pBolt, slabZ(carrierSec, mm(-100), mm(-188), { cs: 10 }), mats.blued, 'carrier')
	put(pBolt, slabZ(rrect(mm(20), mm(7), mm(2), 0, B + mm(16)), mm(-104), mm(-184), { cs: 6 }), mats.blued, 'carrierRib')
	put(pBolt, tubeZ(mm(8.5), mm(3.9), mm(18), B, mm(-188), 32, mm(0.7)), mats.steelDark, 'boltHead')
	// шток газового поршня уходит в газовую трубку
	put(pBolt, slabZ(rrect(mm(13), mm(30), mm(3), 0, B + mm(16)), mm(-184), mm(-198), { cs: 6 }), mats.blued, 'pistonNeck')
	put(pBolt, rodZ(mm(5.5), mm(120), B + mm(27), mm(-196), 32), mats.parkerized, 'pistonRod')
	for (let i = 0; i < 5; i++) {                                // канавки поршня
		put(pBolt, track(new THREE.TorusGeometry(mm(7.6), mm(0.9), 10, 32)), mats.parkerized, 'pistonRing')
			.position.set(0, B + mm(27), mm(-300) - mm(4.5) * i)
	}
	put(pBolt, tubeZ(mm(8.4), mm(2), mm(14), B + mm(27), mm(-302), 32, mm(0.8)), mats.parkerized, 'pistonHead')
	// рукоятка взведения: ш 12 мм, длина 30 мм, справа на Z=−150, bore+4
	const chGeo = latheZ([
		[mm(7.5), 0], [mm(7.5), mm(4)], [mm(6), mm(6)], [mm(6), mm(24)],
		[mm(6.8), mm(26)], [mm(6.8), mm(28.6)], [mm(5.4), mm(30)], [1e-5, mm(30)]
	], 0, 0, 32)
	chGeo.rotateY(-Math.PI / 2)
	chGeo.translate(mm(13), B + mm(4), mm(-150))
	put(pCharge, chGeo, mats.blued, 'chargingHandle')

	// =========================================================
	// 5. КОЛОДКА ПРИЦЕЛА  Z: −250 → −350
	// =========================================================
	const sbSec = rrect(mm(28), mm(34), mm(5), 0, B + mm(1))
	sbSec.holes.push(holeCircle(mm(9.95), 0, B))
	put(gStatic, slabZ(sbSec, mm(-250), mm(-350), { cs: 20 }), mats.blued, 'sightBlock')
	const cheek = rrect(mm(96), mm(22), mm(3), mm(-300), B + mm(11))
	put(gStatic, slabX(cheek, mm(4), mm(11)), mats.blued, 'cheekR')
	put(gStatic, slabX(cheek, mm(4), mm(-15)), mats.blued, 'cheekL')
	put(gStatic, rodZ(mm(2.5), mm(30), 0, 0, 20).rotateY(-Math.PI / 2).translate(mm(-15), B + mm(20), mm(-336)), mats.blued, 'leafPin')
	// секторная планка: шарнир на −350, длина 100 мм
	const leafShape = rrect(mm(100), mm(3.4), mm(1.2), mm(-300), B + mm(19))
	put(gStatic, slabX(leafShape, mm(15), 0, { cs: 6 }), mats.blued, 'sightLeaf')
	const leafRail = [rrect(mm(100), mm(6), mm(1.5), mm(-300), B + mm(16)), rrect(mm(100), mm(6), mm(1.5), mm(-300), B + mm(16))]
	put(gStatic, slabX(leafRail[0], mm(2.2), mm(7.6), { cs: 6 }), mats.blued, 'leafRailR')
	put(gStatic, slabX(leafRail[1], mm(2.2), mm(-9.8), { cs: 6 }), mats.blued, 'leafRailL')
	for (let i = 0; i < 8; i++) {                                // 8 поперечных насечек
		const z = mm(-262) - mm(11) * i
		put(gStatic, slabZ(rrect(mm(15), mm(1.6), mm(0.5), 0, B + mm(21.2)), z, z - mm(1.6), { cs: 2, sg: 1 }), mats.blued, 'notch')
		const dg = stampY(digitShapes(i + 1, mm(1.9), mm(4.4), 0), mm(0.5))   // цифры дальности
		dg.translate(0, B + mm(20.7), z - mm(4.4))
		put(gStatic, dg, mats.blued, 'range')
	}
	// хомутик-ползун с П-образной прорезью целика на Z=−252, верх прорези bore+22
	const sl = new THREE.Shape()
	sl.moveTo(mm(-10), B + mm(14)); sl.lineTo(mm(10), B + mm(14)); sl.lineTo(mm(10), B + mm(24))
	sl.lineTo(mm(1.6), B + mm(24)); sl.lineTo(mm(1.6), B + mm(19.6)); sl.lineTo(mm(-1.6), B + mm(19.6))
	sl.lineTo(mm(-1.6), B + mm(24)); sl.lineTo(mm(-10), B + mm(24)); sl.closePath()
	sl.holes.push(holeRect(mm(9), mm(5), mm(1), 0, B + mm(17.5)))
	put(gStatic, slabZ(sl, mm(-248), mm(-258), { cs: 4 }), mats.blued, 'sightSlider')
	put(gStatic, slabZ(rrect(mm(24), mm(4.5), mm(1.4), 0, B + mm(13)), mm(-247), mm(-259), { cs: 4 }), mats.blued, 'sliderClamp')

	// =========================================================
	// 6. СТВОЛ  Z: −225 → −640, канал 7.62 мм сквозной
	// =========================================================
	put(gStatic, latheZ([
		[mm(9.9), mm(1)], [mm(9.9), mm(278)], [mm(8.0), mm(283)], [mm(8.0), mm(396)],
		[mm(7.7), mm(399)], [mm(7.7), mm(414)], [mm(7.1), mm(415)], [mm(4.4), mm(415)],
		[mm(3.81), mm(414)], [mm(3.81), mm(1)], [mm(4.4), 0], [mm(9.3), 0], [mm(9.9), mm(1)]
	], B, mm(-225), 48), mats.parkerized, 'barrel')
	put(gStatic, tubeZ(mm(3.74), mm(3.6), mm(438), B, mm(-226), 32, mm(0.2)), mats.steelDark, 'bore')
	for (let i = 0; i < 6; i++) {                                // витки резьбы под компенсатор
		put(gStatic, track(new THREE.TorusGeometry(mm(7.9), mm(0.55), 6, 32)), mats.parkerized, 'thread')
			.position.set(0, B, mm(-627) - mm(2.2) * i)
	}

	// выдавливание плоских клейм вверх (цифры на планке)
	function stampY(shapes, h) {
		const g = new THREE.ExtrudeGeometry(shapes, {
			depth: h, steps: 1, curveSegments: 2, bevelEnabled: true,
			bevelThickness: h * 0.35, bevelSize: h * 0.3, bevelOffset: 0, bevelSegments: 1
		})
		g.rotateX(-Math.PI / 2)
		return track(g)
	}
	// тело вращения вдоль оси Y
	function rodY(prof, seg) {
		return track(new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(Math.max(p[0], 1e-5), p[1])), seg || 32))
	}
	// замкнутая оболочка по кольцам без торцов (последнее кольцо сшивается с первым)
	function shell(rings) {
		const n = rings[0].length, m = rings.length, pos = [], idx = []
		for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const p = rings[j][i]; pos.push(p.x, p.y, p.z) }
		for (let j = 0; j < m; j++) {
			const j2 = (j + 1) % m
			for (let i = 0; i < n; i++) {
				const i2 = (i + 1) % n
				idx.push(j * n + i, j2 * n + i, j2 * n + i2, j * n + i, j2 * n + i2, j * n + i2)
			}
		}
		let vol = 0
		for (let k = 0; k < idx.length; k += 3) {
			const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3
			vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
				- pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
				+ pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])
		}
		if (vol < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t }
		const g = new THREE.BufferGeometry()
		g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
		g.setIndex(idx)
		g.computeVertexNormals()
		return track(g)
	}

	// =========================================================
	// 7. ГАЗООТВОДНЫЙ БЛОК  Z: −470 → −505
	// =========================================================
	const gbSec = rrect(mm(26), mm(31), mm(4), 0, B + mm(2.5))
	gbSec.holes.push(holeCircle(mm(9.95), 0, B))
	put(gStatic, slabZ(gbSec, mm(-470), mm(-505), { cs: 20 }), mats.parkerized, 'gasBlock')
	// патрубок ш 18 мм уходит вверх-назад под 45° в газовую трубку
	const gp = tubeZ(mm(9), mm(4.6), mm(32), 0, 0, 32, mm(0.8))
	gp.rotateX(Math.PI * 0.75)
	gp.translate(0, B + mm(6), mm(-495))
	put(gStatic, gp, mats.parkerized, 'gasPort')
	// прилив под шомпол спереди снизу
	put(gStatic, tubeZ(mm(5.4), mm(2.75), mm(37), B - mm(13), mm(-469), 24, mm(0.6)), mats.parkerized, 'rodLug')
	// передняя антабка на газблоке снизу (проволочная скоба ш 4 мм)
	const swivel = track(new THREE.TorusGeometry(mm(8), mm(2), 12, 32, Math.PI * 1.35))
	const sw1 = put(gStatic, swivel, mats.parkerized, 'swivelFront')
	sw1.position.set(0, B - mm(26), mm(-487)); sw1.rotation.set(0, Math.PI / 2, -Math.PI * 0.32)
	put(gStatic, slabZ(rrect(mm(10), mm(8), mm(2), 0, B - mm(19)), mm(-482), mm(-492), { cs: 6 }), mats.parkerized, 'swivelBase')

	// =========================================================
	// 8. ГАЗОВАЯ ТРУБКА + ВЕРХНЯЯ ДЕРЕВЯННАЯ НАКЛАДКА
	// =========================================================
	put(gStatic, tubeZ(mm(10), mm(8.7), mm(170), B + mm(27), mm(-310), 48, mm(0.8)), mats.parkerized, 'gasTube')
	put(gStatic, tubeZ(mm(12), mm(10.1), mm(16), B + mm(27), mm(-312), 32, mm(0.8)), mats.parkerized, 'gasTubeCollar')
	// накладка: верхний полуобод + две щёки с овальными окнами 30×9 мм
	const uhgArc = new THREE.Shape()
	uhgArc.absarc(0, B + mm(27), mm(16.5), 0, Math.PI, false)
	uhgArc.absarc(0, B + mm(27), mm(11), Math.PI, 0, true)
	uhgArc.closePath()
	put(gStatic, slabZ(uhgArc, mm(-332), mm(-462), { cs: 22, bt: mm(1.6), bs: mm(1.4) }), WOOD, 'upperHandguardTop')
	const uhgSide = rrect(mm(130), mm(14.6), mm(3), mm(-397), B + mm(19.6))
	uhgSide.holes.push(holeOval(mm(30), mm(9), mm(-370), B + mm(19.6)))
	uhgSide.holes.push(holeOval(mm(30), mm(9), mm(-424), B + mm(19.6)))
	put(gStatic, slabX(uhgSide, mm(5.5), mm(13.75), { cs: 16, bt: mm(1.2), bs: mm(1.0) }), WOOD, 'upperHandguardR')
	put(gStatic, slabX(uhgSide, mm(5.5), -mm(13.75), { cs: 16, bt: mm(1.2), bs: mm(1.0) }), WOOD, 'upperHandguardL')
	// стальная обойма спереди
	const uBand = new THREE.Shape()
	uBand.absarc(0, B + mm(27), mm(17.6), -0.35, Math.PI + 0.35, false)
	uBand.absarc(0, B + mm(27), mm(16.2), Math.PI + 0.35, -0.35, true)
	uBand.closePath()
	put(gStatic, slabZ(uBand, mm(-462), mm(-474), { cs: 20 }), mats.parkerized, 'upperBand')

	// =========================================================
	// 9. ЦЕВЬЁ  Z: −290 → −455, желоб 44×42 мм
	// =========================================================
	function lowerSec(p, hw, bot, ch, r, gr) {
		p.moveTo(-hw + ch, B)
		p.lineTo(-gr, B)
		p.absarc(0, B, gr, Math.PI, Math.PI * 2, false)      // желоб под ствол
		p.lineTo(hw - ch, B)
		p.lineTo(hw, B - ch)
		p.lineTo(hw, bot + r)
		p.quadraticCurveTo(hw, bot, hw - r, bot)
		p.lineTo(-hw + r, bot)
		p.quadraticCurveTo(-hw, bot, -hw, bot + r)
		p.lineTo(-hw, B - ch)
		p.closePath()
		return p
	}
	put(gStatic, slabZ(lowerSec(new THREE.Shape(), mm(22), B - mm(42), mm(3), mm(9), mm(11.5)), mm(-290), mm(-455), { cs: 18, bt: mm(2.2), bs: mm(2.0) }), WOOD, 'lowerHandguard')
	// стальная обойма шириной 20 мм спереди (П-образный хомут)
	const strap = new THREE.Shape()
	strap.moveTo(-mm(23.4), B - mm(2))
	strap.lineTo(-mm(23.4), B - mm(34))
	strap.quadraticCurveTo(-mm(23.4), B - mm(43.4), -mm(14), B - mm(43.4))
	strap.lineTo(mm(14), B - mm(43.4))
	strap.quadraticCurveTo(mm(23.4), B - mm(43.4), mm(23.4), B - mm(34))
	strap.lineTo(mm(23.4), B - mm(2))
	strap.lineTo(mm(22), B - mm(2))
	strap.lineTo(mm(22), B - mm(34))
	strap.quadraticCurveTo(mm(22), B - mm(42), mm(14), B - mm(42))
	strap.lineTo(-mm(14), B - mm(42))
	strap.quadraticCurveTo(-mm(22), B - mm(42), -mm(22), B - mm(34))
	strap.lineTo(-mm(22), B - mm(2))
	strap.closePath()
	put(gStatic, slabZ(strap, mm(-435), mm(-455), { cs: 14 }), mats.parkerized, 'handguardBand')
	put(gStatic, slabZ(strap, mm(-290), mm(-302), { cs: 14 }), mats.parkerized, 'handguardBandRear')

	// =========================================================
	// 10. НАМУШНИК  Z: −615 → −645, мушка на −630, вершина bore+22
	// =========================================================
	put(gStatic, tubeZ(mm(11), mm(8.05), mm(30), B, mm(-615), 48, mm(0.9)), mats.parkerized, 'fsBase')
	const ear = rrect(mm(28), mm(22), mm(7), mm(-630), B + mm(13))
	put(gStatic, slabX(ear, mm(5), mm(6.5), { cs: 14 }), mats.parkerized, 'fsEarR')     // прорезь сверху 8 мм
	put(gStatic, slabX(ear, mm(5), mm(-6.5), { cs: 14 }), mats.parkerized, 'fsEarL')
	put(gStatic, slabZ(rrect(mm(22), mm(9), mm(3), 0, B + mm(6)), mm(-617), mm(-643), { cs: 8 }), mats.parkerized, 'fsBridge')
	const post = rodY([[mm(2.6), mm(6)], [mm(2.6), mm(8)], [mm(1.0), mm(10)], [mm(1.0), mm(21.4)], [mm(1.3), mm(21.6)], [mm(1.3), mm(22)], [1e-5, mm(22)]], 24)
	post.translate(0, B, mm(-630))
	put(gStatic, post, mats.steelDark, 'frontPost')                                      // мушка ш 2 мм
	put(gStatic, tubeZ(mm(5.4), mm(2.75), mm(26), B - mm(13), mm(-617), 24, mm(0.6)), mats.parkerized, 'fsRodLug')

	// =========================================================
	// 11. КОСОЙ ДУЛЬНЫЙ КОМПЕНСАТОР  Z: −640 → −665, ш 22 мм
	// =========================================================
	put(gStatic, tubeZ(mm(11), mm(6.2), mm(10), B, mm(-640), 40, mm(0.8)), mats.parkerized, 'brakeBase')
	// средний поясок с настоящим сквозным окном 10×6 мм слева
	const gap = mm(10) / mm(11)                                                          // угловой размер окна
	const winSec = new THREE.Shape()
	winSec.absarc(0, B, mm(11), Math.PI + gap / 2, Math.PI * 3 - gap / 2, false)
	winSec.absarc(0, B, mm(6.2), Math.PI * 3 - gap / 2, Math.PI + gap / 2, true)
	winSec.closePath()
	put(gStatic, slabZ(winSec, mm(-650), mm(-656), { cs: 40 }), mats.parkerized, 'brakeWindow')
	// передний срез скошен под 45° вниз-вправо
	{
		const seg = 40, ro = mm(11), ri = mm(6.2), zB = mm(-656), zF = mm(-665)
		const tx = 0.7071, ty = -0.7071, amp = mm(5.5)
		const ob = [], of = [], inf = [], ib = []
		for (let i = 0; i < seg; i++) {
			const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
			const zf = zF + amp * (1 + (c * tx + s * ty))
			ob.push(new THREE.Vector3(ro * c, B + ro * s, zB))
			of.push(new THREE.Vector3(ro * c, B + ro * s, zf))
			inf.push(new THREE.Vector3(ri * c, B + ri * s, zf))
			ib.push(new THREE.Vector3(ri * c, B + ri * s, zB))
		}
		put(gStatic, shell([ob, of, inf, ib]), mats.parkerized, 'brakeCrown')
	}
	// подпружиненный фиксатор-штифт снизу
	const detent = rodY([[mm(2.6), 0], [mm(2.6), mm(3.4)], [mm(2.0), mm(3.8)], [mm(2.0), mm(5.4)], [1e-5, mm(5.4)]], 20)
	detent.rotateX(Math.PI)
	detent.translate(0, B - mm(9.6), mm(-646))
	put(gStatic, detent, mats.blued, 'brakeDetent')

	// =========================================================
	// 12. ПИСТОЛЕТНАЯ РУКОЯТЬ — наклон 22°, длина 105 мм
	//     origin (0,0,0) — центр правой ладони на этой рукояти
	// =========================================================
	const gTop = new THREE.Vector3(0, mm(34), mm(-12.1))
	const gDir = new THREE.Vector3(0, -Math.cos(22 * RAD), Math.sin(22 * RAD)).normalize()
	const gEx = new THREE.Vector3(1, 0, 0)
	const gEy = new THREE.Vector3(0, Math.sin(22 * RAD), Math.cos(22 * RAD)).normalize()
	const gLen = mm(105)
	const gA = spline([[0, mm(16.6)], [0.22, mm(15.2)], [0.5, mm(15.4)], [0.8, mm(16.8)], [1, mm(17.4)]])
	const gB = spline([[0, mm(23.5)], [0.22, mm(20.4)], [0.5, mm(20.0)], [0.8, mm(21.4)], [1, mm(20.6)]])
	{
		const rings = [], N = 26
		for (let j = 0; j <= N; j++) {
			const u = j / N
			const c = gTop.clone().addScaledVector(gDir, gLen * u)
			const prof = superRing(gA(u), gB(u), 3.0, 30)
			rings.push(prof.map((p) => c.clone().addScaledVector(gEx, p.x).addScaledVector(gEy, p.y)))
		}
		put(gStatic, loft(rings), WOOD[1], 'grip')
	}
	// стальная пятка с винтом снизу
	{
		const c = gTop.clone().addScaledVector(gDir, gLen + mm(1.5))
		const rings = []
		for (let j = 0; j <= 3; j++) {
			const u = j / 3
			const cc = c.clone().addScaledVector(gDir, mm(3.2) * u)
			const prof = superRing(mm(17.6) - mm(1.4) * u * u, mm(20.8) - mm(1.6) * u * u, 3.0, 30)
			rings.push(prof.map((p) => cc.clone().addScaledVector(gEx, p.x).addScaledVector(gEy, p.y)))
		}
		put(gStatic, loft(rings), mats.blued, 'gripHeel')
		const screw = domeY(mm(6.5), mm(1.2), 20)
		const sm = put(gStatic, screw, mats.blued, 'gripScrew')
		sm.position.copy(c).addScaledVector(gDir, mm(3.6))
		sm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), gDir)
	}

	// =========================================================
	// 13. СПУСКОВАЯ СКОБА  Z: −35 → −90, сталь 4 мм
	// =========================================================
	const guard = new THREE.Shape()
	guard.moveTo(mm(-30), RBOT)
	guard.lineTo(mm(-30), mm(6))
	guard.quadraticCurveTo(mm(-30), mm(-2), mm(-40), mm(-2))
	guard.lineTo(mm(-80), mm(-2))
	guard.quadraticCurveTo(mm(-92), mm(-2), mm(-92), mm(8))
	guard.lineTo(mm(-92), RBOT)
	guard.lineTo(mm(-84), RBOT)
	guard.lineTo(mm(-84), mm(10))
	guard.quadraticCurveTo(mm(-84), mm(6), mm(-78), mm(6))
	guard.lineTo(mm(-42), mm(6))
	guard.quadraticCurveTo(mm(-38), mm(6), mm(-38), mm(12))
	guard.lineTo(mm(-38), RBOT)
	guard.closePath()
	put(gStatic, slabX(guard, mm(18), 0, { cs: 12, bt: mm(0.8), bs: mm(0.7) }), mats.blued, 'triggerGuard')
	put(gStatic, slabZ(rrect(mm(20), mm(6), mm(2), 0, RBOT - mm(1)), mm(-30), mm(-92), { cs: 6 }), mats.blued, 'guardRail')

	// спусковой крючок, ось на Z=−48
	const trg = new THREE.Shape()
	trg.moveTo(mm(-42), mm(24))
	trg.lineTo(mm(-54), mm(24))
	trg.quadraticCurveTo(mm(-58), mm(24), mm(-58), mm(18))
	trg.quadraticCurveTo(mm(-58), mm(4), mm(-50), mm(2))
	trg.quadraticCurveTo(mm(-45), mm(1), mm(-44), mm(8))
	trg.quadraticCurveTo(mm(-43), mm(16), mm(-40), mm(20))
	trg.closePath()
	const trgGeo = slabX(trg, mm(6.5), 0, { cs: 12, bt: mm(0.5), bs: mm(0.5) })
	trgGeo.translate(0, -mm(22), mm(48))
	put(pTrigger, trgGeo, mats.blued, 'trigger')
	pTrigger.position.set(0, mm(22), mm(-48))

	// =========================================================
	// 14. ЗАЩЁЛКА МАГАЗИНА  Z: −90 → −100
	// =========================================================
	const latch = rrect(mm(11), mm(15), mm(2.5), mm(-95), mm(24))
	put(gStatic, slabX(latch, mm(13), 0, { cs: 8 }), mats.blued, 'magLatch')
	for (let i = 0; i < 5; i++) {                                                        // поперечная насечка
		put(gStatic, slabZ(rrect(mm(13.6), mm(1.5), mm(0.5), 0, mm(19) + mm(2.6) * i), mm(-90.4), mm(-99.6), { cs: 2, sg: 1 }), mats.blued, 'latchGroove')
	}

	// =========================================================
	// 15. МАГАЗИН НА 30 ПАТРОНОВ — дуга R250 вперёд-вниз
	// =========================================================
	const MAG_SEAT = new THREE.Vector3(0, mm(30), mm(-117.5))
	{
		const R = mm(250), CZ = mm(-367.5), CY = mm(30), AMAX = 47 * RAD
		const EX = new THREE.Vector3(1, 0, 0)
		const wA = spline([[0, mm(12.0)], [0.5, mm(12.0)], [1, mm(11.3)]])
		const wB = spline([[0, mm(32.5)], [0.35, mm(31.6)], [1, mm(29.0)]])
		const magRing = (u, grow) => {
			const a = AMAX * u
			const c = new THREE.Vector3(0, CY - R * Math.sin(a), CZ + R * Math.cos(a))
			const en = new THREE.Vector3(0, -Math.sin(a), Math.cos(a))
			const env = Math.min(1, Math.max(0, (u - 0.11) / 0.09)) * Math.min(1, Math.max(0, (0.95 - u) / 0.05))
			const rib = 1 + 0.05 * env * Math.pow(Math.max(0, Math.cos(u * Math.PI * 26)), 0.6)  // 13 рёбер жёсткости
			const prof = superRing(wA(u) * rib + grow, wB(u) + grow, 4.2, 30)
			return prof.map((p) => c.clone().addScaledVector(EX, p.x).addScaledVector(en, p.y))
		}
		const body = []
		for (let j = 0; j <= 104; j++) body.push(magRing(0.05 + (0.99 - 0.05) * (j / 104), 0))
		put(pMag, loft(body).translate(0, -mm(30), mm(117.5)), mats.blued, 'magBody')
		const lips = []
		for (let j = 0; j <= 6; j++) lips.push(magRing(-0.03 + 0.09 * (j / 6), mm(0.4)))
		put(pMag, loft(lips).translate(0, -mm(30), mm(117.5)), mats.steelDark, 'magLips')   // губы подачи
		const foot = []
		for (let j = 0; j <= 5; j++) {
			const u = 0.955 + 0.05 * (j / 5)
			foot.push(magRing(u, mm(1.2) * Math.min(1, j / 2)))
		}
		put(pMag, loft(foot).translate(0, -mm(30), mm(117.5)), mats.blued, 'magFloor')      // съёмная пятка
		// зацеп защёлки сзади сверху
		put(pMag, slabZ(rrect(mm(15), mm(9), mm(1.6), 0, mm(30)), mm(-85), mm(-78), { cs: 6 }).translate(0, -mm(30), mm(117.5)), mats.blued, 'magCatchLug')
	}
	pMag.position.copy(MAG_SEAT)

	// =========================================================
	// 16. ФЛАЖОК ПЕРЕВОДЧИКА ОГНЯ — правая стенка, 65×18×3 мм, ось Z=−95
	// =========================================================
	const SEL_PIVOT = new THREE.Vector3(mm(18.5), mm(55), mm(-95))
	{
		const s = new THREE.Shape()
		s.moveTo(mm(-58), mm(62))
		s.lineTo(mm(-118), mm(67))
		s.quadraticCurveTo(mm(-125), mm(68), mm(-125), mm(61))
		s.lineTo(mm(-124), mm(52))
		s.quadraticCurveTo(mm(-123), mm(46), mm(-114), mm(47))
		s.lineTo(mm(-82), mm(48))
		s.lineTo(mm(-68), mm(33))
		s.quadraticCurveTo(mm(-62), mm(27), mm(-55), mm(31))
		s.quadraticCurveTo(mm(-50), mm(34), mm(-52), mm(42))
		s.lineTo(mm(-53), mm(60))
		s.closePath()
		s.holes.push(holeCircle(mm(3), mm(-95), mm(55)))                                   // сквозное отверстие под ось
		const g = slabX(s, mm(3), mm(19), { cs: 12, bt: mm(0.5), bs: mm(0.5) })
		g.translate(-SEL_PIVOT.x, -SEL_PIVOT.y, -SEL_PIVOT.z)
		put(pSelector, g, mats.blued, 'selectorLever')
		// верхняя ступень-полка и нижняя отбортовка — объём, не плоскость
		const sh1 = slabZ(rrect(mm(6.5), mm(4), mm(1), mm(20.2), mm(66)), mm(-100), mm(-124), { cs: 5 })
		sh1.translate(-SEL_PIVOT.x, -SEL_PIVOT.y, -SEL_PIVOT.z)
		put(pSelector, sh1, mats.blued, 'selectorShelfTop')
		const sh2 = slabZ(rrect(mm(6.5), mm(4), mm(1), mm(20.2), mm(47.5)), mm(-86), mm(-112), { cs: 5 })
		sh2.translate(-SEL_PIVOT.x, -SEL_PIVOT.y, -SEL_PIVOT.z)
		put(pSelector, sh2, mats.blued, 'selectorShelfBot')
		const pad = slabX(rrect(mm(15), mm(11), mm(3), mm(-59), mm(36)), mm(2.4), mm(22.2), { cs: 8 })
		pad.translate(-SEL_PIVOT.x, -SEL_PIVOT.y, -SEL_PIVOT.z)
		put(pSelector, pad, mats.blued, 'selectorThumb')
	}
	pSelector.position.copy(SEL_PIVOT)
	// надписи АВ и ОД — выдавленная геометрия глубиной 0.4 мм
	function letterGeo(ch, s, oz, oy) {
		const src = letterShapes(ch), out = []
		for (const sh of src) {
			const pts = sh.getPoints(3), n = new THREE.Shape()
			n.moveTo(oz - pts[0].x * s, oy + pts[0].y * s)
			for (let i = 1; i < pts.length; i++) n.lineTo(oz - pts[i].x * s, oy + pts[i].y * s)
			n.closePath()
			for (const h of sh.holes) {
				const hp = h.getPoints(3), nh = new THREE.Path()
				nh.moveTo(oz - hp[0].x * s, oy + hp[0].y * s)
				for (let i = 1; i < hp.length; i++) nh.lineTo(oz - hp[i].x * s, oy + hp[i].y * s)
				nh.closePath()
				n.holes.push(nh)
			}
			out.push(n)
		}
		return slabX(out, mm(0.4), RHW + mm(0.2), { cs: 3, sg: 1, bt: mm(0.12), bs: mm(0.12) })
	}
	put(gStatic, letterGeo('A', mm(3.4), mm(-121), mm(72)), mats.blued, 'markA')
	put(gStatic, letterGeo('V', mm(3.4), mm(-126.5), mm(72)), mats.blued, 'markV')
	put(gStatic, letterGeo('O', mm(3.4), mm(-121), mm(30)), mats.blued, 'markO')
	put(gStatic, letterGeo('D', mm(3.4), mm(-126.5), mm(30)), mats.blued, 'markD')

	// =========================================================
	// 17. БОКОВАЯ ПЛАНКА ПОД ОПТИКУ — левая стенка, Z: −60 → −120
	// =========================================================
	{
		const rail = rrect(mm(60), mm(26), mm(3), mm(-90), B - mm(8))
		const slot = (cz, cy, w, h, ang) => {
			const c = Math.cos(ang), s2 = Math.sin(ang), pts = []
			const q = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
			for (const p of q) pts.push([cz + p[0] * c - p[1] * s2, cy + p[0] * s2 + p[1] * c])
			return poly(pts)
		}
		rail.holes.push(slot(mm(-73), B - mm(8), mm(19), mm(4.5), Math.PI / 4))            // косые пазы 45°
		rail.holes.push(slot(mm(-107), B - mm(8), mm(19), mm(4.5), Math.PI / 4))
		put(gStatic, slabX(rail, mm(9), mm(-21.5), { cs: 10 }), mats.blued, 'sideRail')
		put(gStatic, slabX(rrect(mm(64), mm(7), mm(2), mm(-90), B + mm(6)), mm(11), mm(-22.5), { cs: 6 }), mats.blued, 'railTop')
		put(gStatic, slabX(rrect(mm(64), mm(7), mm(2), mm(-90), B - mm(22)), mm(11), mm(-22.5), { cs: 6 }), mats.blued, 'railBot')
	}

	// =========================================================
	// 18. ПРИКЛАД  Z: +40 → +215, наклон вниз-назад 8°
	// =========================================================
	{
		const A8 = 8 * RAD
		const P0 = new THREE.Vector3(0, B - mm(12), mm(40))
		const dir = new THREE.Vector3(0, -Math.sin(A8), Math.cos(A8))
		const ey = new THREE.Vector3(0, Math.cos(A8), Math.sin(A8))
		const ex = new THREE.Vector3(1, 0, 0)
		const LEN = mm(168.7)                       // затылок с пластиной ложится ровно на Z=+215
		const hw = spline([[0, mm(17)], [0.1, mm(16.4)], [0.22, mm(16)], [0.4, mm(17.6)], [0.62, mm(19.6)], [0.85, mm(21.6)], [1, mm(22.5)]])
		const up = spline([[0, mm(31)], [0.1, mm(22)], [0.22, mm(17)], [0.4, mm(16)], [0.62, mm(16)], [0.85, mm(17)], [1, mm(28)]])
		const dn = spline([[0, mm(31)], [0.1, mm(20)], [0.22, mm(17)], [0.4, mm(25)], [0.62, mm(36)], [0.85, mm(47)], [1, mm(66)]])
		const ringAt = (u, grow, extra) => {
			const c = P0.clone().addScaledVector(dir, LEN * u + (extra || 0)).addScaledVector(ey, (up(u) - dn(u)) / 2)
			const prof = superRing(hw(u) + (grow || 0), (up(u) + dn(u)) / 2 + (grow || 0), 3.4, 32)
			return prof.map((p) => c.clone().addScaledVector(ex, p.x).addScaledVector(ey, p.y))
		}
		const rings = []
		for (let j = 0; j <= 42; j++) rings.push(ringAt(j / 42, 0, 0))
		put(gStatic, loft(rings), WOOD[1], 'stock')
		// затылок: стальная пластина с поперечной насечкой и двумя винтами
		const padMat = opts.recoilPad ? mats.rubber : mats.blued
		const plate = [ringAt(1, 0, 0), ringAt(1, mm(0.8), mm(1.2)), ringAt(1, mm(0.8), mm(3.2)), ringAt(1, mm(0.2), mm(4))]
		put(gStatic, loft(plate), padMat, 'buttPlate')
		const buttC = P0.clone().addScaledVector(dir, LEN + mm(3.3)).addScaledVector(ey, (up(1) - dn(1)) / 2)
		for (let i = 0; i < 7; i++) {
			const g = slabZ(rrect(mm(36), mm(2.2), mm(0.7), 0, 0), 0, mm(0.7), { cs: 2, sg: 1 })
			g.rotateX(A8)
			const c = buttC.clone().addScaledVector(ey, mm(-36) + mm(11) * i)
			g.translate(c.x, c.y, c.z)
			put(gStatic, g, padMat, 'buttSerration')
		}
		for (let i = 0; i < 2; i++) {
			const sc = put(gStatic, domeY(mm(7), mm(1.1), 20), mats.blued, 'buttScrew')
			sc.position.copy(buttC).addScaledVector(ey, i ? mm(20) : mm(-46)).addScaledVector(dir, mm(0.7))
			sc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
		}
		// 19. задняя антабка — левая сторона приклада, проволока ш 4 мм
		const sc = P0.clone().addScaledVector(dir, LEN * 0.46).addScaledVector(ey, mm(-24))
		const loop = put(gStatic, track(new THREE.TorusGeometry(mm(9), mm(2), 12, 32, Math.PI * 1.4)), mats.parkerized, 'swivelRear')
		loop.position.set(-mm(19), sc.y, sc.z)
		loop.rotation.set(0, Math.PI / 2, Math.PI * 0.3)
		const base = slabX(rrect(mm(26), mm(12), mm(3), 0, 0), mm(3), mm(-20))
		base.rotateX(A8)
		base.translate(0, sc.y, sc.z)
		put(gStatic, base, mats.parkerized, 'swivelRearBase')
	}

	// =========================================================
	// УЗЛЫ ДЛЯ ИГРОВОГО ДВИЖКА
	// =========================================================
	const node = (x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); group.add(o); return o }
	const nodes = {
		muzzle:       node(0, B, mm(-665)),
		chamber:      node(0, B, mm(-215)),
		eject:        node(mm(17), B + mm(6), mm(-147)),
		ejectDir:     node(mm(17), B + mm(6), mm(-147)),
		sight:        node(0, B + mm(18), mm(-300)),
		sightAxis:    node(0, B + mm(22), mm(-252)),
		ironSight:    node(0, B + mm(22), mm(-252)),
		gripR:        node(0, 0, 0),
		gripL:        node(0, B - mm(21), mm(-372)),
		handguard:    node(0, B - mm(21), mm(-372)),
		magSeat:      node(MAG_SEAT.x, MAG_SEAT.y, MAG_SEAT.z),
		magDrop:      node(0, mm(-40), mm(-150)),
		chargeRest:   node(mm(28), B + mm(4), mm(-150)),
		chargePull:   node(mm(28), B + mm(4), mm(-40)),
		boltRest:     node(0, B + mm(6), mm(-145)),
		boltTravel:   node(0, B + mm(6), mm(-35)),
		triggerPivot: node(0, mm(22), mm(-48)),
		triggerPull:  node(0, mm(22), mm(-48)),
		selectorPivot: node(SEL_PIVOT.x, SEL_PIVOT.y, SEL_PIVOT.z)
	}
	nodes.ejectDir.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0.75, 0.6, -0.28).normalize())
	nodes.sightAxis.quaternion.identity()
	nodes.gripR.rotation.set(-22 * RAD, 0, 0)
	nodes.gripL.rotation.set(0, 0, 0)
	nodes.magSeat.rotation.set(0, 0, 0)
	nodes.magDrop.rotation.set(-18 * RAD, 0, 0)
	nodes.triggerPull.rotation.set(12 * RAD, 0, 0)
	nodes.selectorPivot.rotation.set(0, 0, 0)
	nodes.muzzle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1))

	group.nodes = nodes
	group.parts = { magazine: pMag, bolt: pBolt, charging: pCharge, trigger: pTrigger, selector: pSelector }
	group.dispose = function () {
		for (const g of geoms) g.dispose()
		for (const k in mats) mats[k].dispose()
		geoms.length = 0
	}
	return group
}
// export { buildAKM }
