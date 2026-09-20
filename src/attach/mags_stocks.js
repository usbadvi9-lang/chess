/* ============================================================================
   Магазины, приклады, цевья и боковые модули.

   Магазин: начало координат — плоскость шахты (верх магазина), корпус растёт
   вниз по −Y, изгиб задаётся радиусом. Приклад: начало — торец коробки,
   растёт в +Z. Цевьё: начало — стык со ствольной коробкой.
   ========================================================================== */
module.exports = function (G, C) {
  const { PI, TAU, D } = C;
  const { tr, rx, ry, rz, merge, extrude, lathe, cyl, tube, loft, mBasis } = G;
  const { bag, boxC, boxZ, plateZY, cylX, cylY, sphere, railStrip, railClamp,
    capScrew, knurlBand, spring, padButton, RAIL } = C;

  const OUT = {};

  /* --------------------------------------------------------------------
     Изогнутый магазин: дуга радиуса R, сечение ширина W × глубина Dz.
     cap — ёмкость, влияет на длину; window — окна контроля патронов.
     -------------------------------------------------------------------- */
  function curvedMag(o) {
    const O = Object.assign({ R: 380, len: 172, W: 26, Dz: 64, cap: 30,
      tilt: 5, mat: 'poly', window: false, ribs: 7, floorplate: true }, o || {});
    const P = bag();
    const HW = O.W / 2, HD = O.Dz / 2;
    const T0 = [-Math.sin(D(O.tilt)), -Math.cos(D(O.tilt))];
    const CEN = [O.R * T0[1], -O.R * T0[0]];
    const rot = (v, a) => [v[0] * Math.cos(a) + v[1] * Math.sin(a), -v[0] * Math.sin(a) + v[1] * Math.cos(a)];
    /* s ∈ [0..1] вдоль магазина; кадр даёт точку и нормаль дуги в (z,y) */
    function frame(s) {
      const phi = s * O.len / O.R;
      const rp = rot([-CEN[0], -CEN[1]], phi);
      return { P: [CEN[0] + rp[0], CEN[1] + rp[1]], T: rot(T0, phi) };
    }
    /* кольцо сечения магазина в мировых координатах */
    const ring = (s, shrink, nSeg) => {
      const f = frame(s), T = f.T, N = [-T[1], T[0]];
      const out = [], n = nSeg || 4;
      const w = HW * (1 - shrink * 0.10), d = HD * (1 - shrink * 0.06);
      const corners = [[-w, -d], [w, -d], [w, d], [-w, d]];
      for (const [x, v] of corners) {
        /* скругление углов — по 3 точки на угол */
        out.push([x, f.P[1] + v * N[1], f.P[0] + v * N[0]]);
        out.push([x, f.P[1] + v * N[1], f.P[0] + v * N[0]]);
      }
      return out;
    };
    /* корпус лофтом по дуге, с сужением книзу */
    const rings = [];
    const NS = 16;
    for (let i = 0; i <= NS; i++) {
      const s = i / NS;
      const f = frame(s), T = f.T, N = [-T[1], T[0]];
      const taper = 1 - 0.045 * s;
      const w = HW * taper, d = HD * taper;
      const rr = [];
      const pts = [];
      const R2 = 3.2;
      /* прямоугольник со скруглёнными углами в плоскости (x, N) */
      for (const [cx, cv, a0] of [[-w + R2, -d + R2, PI], [w - R2, -d + R2, -PI / 2],
        [w - R2, d - R2, 0], [-w + R2, d - R2, PI / 2]]) {
        for (let k = 0; k <= 4; k++) {
          const a = a0 + k / 4 * (PI / 2);
          pts.push([cx + Math.cos(a) * R2, cv + Math.sin(a) * R2]);
        }
      }
      for (const [x, v] of pts) rr.push([x, f.P[1] + v * N[1], f.P[0] + v * N[0]]);
      rings.push(rr);
    }
    P.add('magBody', O.mat, loft(rings, true, true));

    /* рёбра жёсткости поперёк корпуса */
    for (let i = 1; i <= O.ribs; i++) {
      const s = i / (O.ribs + 1);
      const f = frame(s), T = f.T, N = [-T[1], T[0]];
      const rr = [];
      for (const ds of [-0.022, 0.022]) {
        const g = frame(s + ds), Tg = g.T, Ng = [-Tg[1], Tg[0]];
        const row = [];
        const w = HW * 1.03, d = HD * 1.02;
        for (let k = 0; k < 20; k++) {
          const a = k / 20 * TAU;
          const cx = Math.cos(a) * w, cv = Math.sin(a) * d * 0.98;
          row.push([cx, g.P[1] + cv * Ng[1], g.P[0] + cv * Ng[0]]);
        }
        rr.push(row);
      }
      P.add('magRib', O.mat, loft(rr, false, false));
    }

    /* горловина: губки подачи и зацеп за шахту */
    const f0 = frame(0), N0 = [f0.T[1] * -1, f0.T[0]];
    P.add('magMouth', 'steelDk', boxC(0, -3.0, -2.0, O.W + 0.6, 8.0, O.Dz * 0.94, 2.0, 0.4));
    P.add('magLugFront', 'steelDk', boxC(0, -9.0, -HD + 3.0, O.W - 6, 10.0, 5.0, 1.0, 0.3));
    P.add('magLugRear', 'steelDk', boxC(0, -12.0, HD - 4.0, O.W - 8, 14.0, 6.0, 1.2, 0.3));

    /* окна контроля патронов */
    if (O.window) for (let i = 0; i < 4; i++) {
      const s = 0.25 + i * 0.16;
      const f = frame(s), T = f.T, N = [-T[1], T[0]];
      P.add('magWindow', 'bore', tr(rz(boxC(0, 0, 0, 3.0, 22, 8.0, 1.0, 0.2), 0),
        HW - 0.6, f.P[1], f.P[0]));
    }

    /* пятка и подаватель */
    if (O.floorplate) {
      const fe = frame(1.0), Te = fe.T, Ne = [-Te[1], Te[0]];
      P.add('magFloor', 'steelDk', tr(rz(boxC(0, 0, 0, O.W + 2.4, 6.0, O.Dz + 1.0, 2.2, 0.4),
        Math.atan2(Te[0], -Te[1])), 0, fe.P[1] - 1.0, fe.P[0]));
      P.add('magFloorLatch', 'steelDk', tr(boxC(0, 0, 0, 8.0, 4.0, 6.0, 0.8, 0.2),
        0, fe.P[1] + 4.0, fe.P[0] - HD + 5));
    }
    const fF = frame(0.06), NF = [-fF.T[1], fF.T[0]];
    P.add('magFollower', 'poly', tr(boxC(0, 0, 0, O.W - 4.0, 7.0, O.Dz - 6.0, 1.5, 0.3),
      0, fF.P[1], fF.P[0]));

    return { parts: P.list, frame, meta: { cap: O.cap, len: O.len } };
  }

  /* Патрон: гильза + пуля, ось +Z вперёд; используется как «верхний патрон». */
  function cartridge(o) {
    const O = Object.assign({ caseL: 39, caseR: 5.0, rimR: 5.6, bulletL: 25, bulletR: 2.8 }, o || {});
    const P = bag();
    P.add('case', 'brass', lathe([
      { r: 0, z: 0 }, { r: O.rimR, z: 0 }, { r: O.rimR, z: 1.4, s: true },
      { r: O.caseR * 0.92, z: 3.0, s: true }, { r: O.caseR, z: O.caseL * 0.62, s: true },
      { r: O.bulletR + 0.4, z: O.caseL - 3, s: true }, { r: O.bulletR + 0.4, z: O.caseL },
      { r: 0, z: O.caseL }], 26, true));
    P.add('bullet', 'copper', tr(lathe([
      { r: 0, z: 0 }, { r: O.bulletR, z: 0 }, { r: O.bulletR, z: O.bulletL * 0.42, s: true },
      { r: O.bulletR * 0.62, z: O.bulletL * 0.82, s: true }, { r: 0, z: O.bulletL }], 24, true),
      0, 0, O.caseL - 4));
    return P.list;
  }
  OUT._cartridge = cartridge;

  /* ==================================================================
     Магазины
     ================================================================== */
  OUT.mag_ak_30 = function () {
    const m = curvedMag({ R: 380, len: 172, W: 26, Dz: 64, cap: 30, tilt: 5, mat: 'poly', ribs: 7 });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин 30 (7,62/5,45)', short: '30', cap: 30, weight: 330,
      caliber: 'auto', reloadMod: 0,
      stats: { reload: 0, mobility: 0, ergonomics: 0 } } };
  };

  OUT.mag_ak_45 = function () {
    const m = curvedMag({ R: 420, len: 236, W: 26, Dz: 64, cap: 45, tilt: 5, mat: 'poly', ribs: 10 });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин 45 (РПК)', short: '45', cap: 45, weight: 470,
      caliber: 'auto', reloadMod: -10,
      stats: { reload: -12, mobility: -4, ergonomics: -3 } } };
  };

  OUT.mag_stanag_30 = function () {
    const m = curvedMag({ R: 560, len: 178, W: 24, Dz: 58, cap: 30, tilt: 3, mat: 'poly', ribs: 6, window: true });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин STANAG 30', short: '30', cap: 30, weight: 280,
      caliber: '5.56', reloadMod: 0,
      stats: { reload: 0, mobility: 0, ergonomics: 0 } } };
  };

  /* Барабан на 75 патронов снят с вооружения: он крепился «в воздухе» над
     шахтой и ломал и силуэт, и перезарядку. Штатный ряд коробчатых
     магазинов покрывает все сценарии. */

  OUT.mag_pistol_17 = function () {
    const P = bag();
    const W = 21, Dz = 32, L = 108;
    P.add('magBody', 'poly', boxC(0, -L / 2, 0, W, L, Dz, 2.4, 0.5));
    /* контрольные отверстия с нумерацией по задней стенке */
    for (let i = 0; i < 9; i++)
      P.add('magWitness', 'bore', tr(ry(cyl(1.5, 1.5, W / 2 - 1.4, W / 2 + 0.2, 12, true), PI / 2),
        0, -16 - i * 9.5, Dz / 2 - 6));
    P.add('magFloor', 'poly', boxC(0, -L - 3.0, 0, W + 2.0, 7.0, Dz + 2.0, 2.0, 0.4));
    P.add('magFollower', 'poly', boxC(0, -8.0, 0, W - 3.0, 6.0, Dz - 4.0, 1.4, 0.3));
    P.add('magLugRear', 'steelDk', boxC(0, -14.0, Dz / 2 - 2.0, 10, 12.0, 4.0, 1.0, 0.2));
    return { parts: P.list, meta: {
      slot: 'mag', name: 'Пистолетный 17', short: '17', cap: 17, weight: 190,
      caliber: '9mm', reloadMod: 0, stats: { reload: 0, mobility: 0, ergonomics: 0 } } };
  };

  OUT.mag_pistol_33 = function () {
    const P = bag();
    const W = 21, Dz = 32, L = 196;
    P.add('magBody', 'poly', boxC(0, -L / 2, 0, W, L, Dz, 2.4, 0.5));
    P.add('magFloor', 'poly', boxC(0, -L - 3.0, 0, W + 2.0, 7.0, Dz + 2.0, 2.0, 0.4));
    P.add('magFollower', 'poly', boxC(0, -8.0, 0, W - 3.0, 6.0, Dz - 4.0, 1.4, 0.3));
    P.add('magLugRear', 'steelDk', boxC(0, -14.0, Dz / 2 - 2.0, 10, 12.0, 4.0, 1.0, 0.2));
    for (let i = 0; i < 6; i++)
      P.add('magRib', 'poly', boxC(0, -30 - i * 28, 0, W + 1.2, 3.0, Dz + 1.0, 1.0, 0.2));
    return { parts: P.list, meta: {
      slot: 'mag', name: 'Пистолетный 33', short: '33', cap: 33, weight: 300,
      caliber: '9mm', reloadMod: -8, stats: { reload: -10, mobility: -3, ergonomics: -4 } } };
  };


  OUT.mag_762_20 = function () {
    const m = curvedMag({ R: 480, len: 182, W: 26, Dz: 72, cap: 20, tilt: 4, mat: 'poly', ribs: 6 });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин 20 (7,62×51)', short: '20', cap: 20, weight: 310,
      caliber: '7.62', reloadMod: 0,
      stats: { reload: 4, mobility: 2, ergonomics: 2 } } };
  };

  OUT.mag_762_25 = function () {
    const m = curvedMag({ R: 470, len: 218, W: 26, Dz: 72, cap: 25, tilt: 4, mat: 'poly', ribs: 8, window: true });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин 25 (7,62×51)', short: '25', cap: 25, weight: 390,
      caliber: '7.62', reloadMod: -6,
      stats: { reload: -6, mobility: -2, ergonomics: -1 } } };
  };

  OUT.mag_svd_10 = function () {
    const m = curvedMag({ R: 620, len: 132, W: 24, Dz: 74, cap: 10, tilt: 3, mat: 'steelDk', ribs: 4 });
    return { parts: m.parts, meta: {
      slot: 'mag', name: 'Магазин 10 (СВД)', short: '10', cap: 10, weight: 240,
      caliber: '7.62', reloadMod: 0,
      stats: { reload: 6, mobility: 3, ergonomics: 2 } } };
  };

  /* ==================================================================
     Приклады. Начало координат — торец ствольной коробки, рост в +Z.
     ================================================================== */

  /* --------------------------------------------------------------------
     Общий каркас приклада.

     Посадка (0,0,0) — задний торец ствольной коробки, ось приклада идёт
     в +Z. Силуэт задаётся таблицей сечений [t, верх, низ, полуширина],
     где t — доля длины от шейки к затыльнику, а верх/низ — отступы от
     линии посадки. Так приклад всегда вырастает из коробки, а не висит
     рядом с ней отдельной деталью.

     Хвост ствольной коробки АК занимает по высоте примерно 30…93 мм над
     плоскостью магазина, а слот приклада стоит на 48 мм. Поэтому сечение
     на стыке (t=0) имеет верх +45 и низ −18 — приклад садится на торец
     коробки заподлицо, без ступеньки и зазора.
     -------------------------------------------------------------------- */
  function stockBody(P, name, mat, L, Y, TAB, o) {
    const O = Object.assign({ rings: 26, seg: 30, power: 4.4 }, o || {});
    const at = (t, i) => {
      for (let k = 1; k < TAB.length; k++) {
        if (t <= TAB[k][0]) {
          const a = TAB[k - 1], b = TAB[k];
          const u = (t - a[0]) / (b[0] - a[0] || 1);
          return a[i] + (b[i] - a[i]) * u;
        }
      }
      return TAB[TAB.length - 1][i];
    };
    const rings = [];
    for (let i = 0; i <= O.rings; i++) {
      const t = i / O.rings, z = t * L;
      const top = Y + at(t, 1), bot = Y + at(t, 2), hw = at(t, 3);
      const yc = (top + bot) / 2, hh = (top - bot) / 2;
      const ring = [];
      for (let k = 0; k < O.seg; k++) {
        const a = k / O.seg * TAU, cs = Math.cos(a), sn = Math.sin(a), p = O.power;
        ring.push([hw * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p),
          yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p), z]);
      }
      rings.push(ring);
    }
    P.add(name, mat, loft(rings, true, true));
    return { at, top: (t) => Y + at(t, 1), bot: (t) => Y + at(t, 2), hw: (t) => at(t, 3) };
  }

  /* Затыльник по обводу торца: пятка, резиновый амортизатор, насечка. */
  function buttPad(P, mat, z, Y, halfW, top, bot, o) {
    const O = Object.assign({ plate: 6, pad: 11, grooves: 5 }, o || {});
    const h = top - bot, yc = (top + bot) / 2;
    P.add('buttPlate', mat, boxC(0, yc, z + O.plate / 2, halfW * 2 + 2.5, h + 3.0, O.plate, 3.0, 0.6));
    P.add('recoilPad', 'rubber', boxC(0, yc, z + O.plate + O.pad / 2, halfW * 2 + 2.0, h + 2.4, O.pad, 3.2, 0.6));
    for (let i = 0; i < O.grooves; i++)
      P.add('padGroove', 'rubber', boxC(0, bot + 6 + i * (h - 12) / (O.grooves - 1),
        z + O.plate + O.pad - 0.6, halfW * 2, 2.0, 1.4, 0.5, 0.1));
    return z + O.plate + O.pad;
  }

  /* Телескопический приклад: буферная труба, салазка с щекой, затыльник.
     Труба выходит из коробки по её оси, салазка обхватывает трубу — в
     прежней версии «коробка» висела рядом и не касалась трубы. */
  OUT.stock_telescopic = function (o) {
    const O = Object.assign({ mat: 'poly', ext: 2, mounts: 6 }, o || {});
    const P = bag();
    const Y = 36.0;                          // ось трубы на высоте хвоста коробки
    const R_T = 14.6;                        // труба Ø29,2 (карабинная)
    const L_T = 168;
    const STEP = 17.5;
    const pos = 30 + O.ext * STEP;           // вылет салазки по фиксатору
    const bodyL = 92;

    P.add('castleNut', 'steelDk', tr(cyl(R_T + 4.2, R_T + 4.2, -8, -1, 30, true), 0, Y, 0));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      P.add('castleSlot', 'bore', tr(cyl(1.8, 1.8, -8.2, -0.8, 10, true),
        Math.cos(a) * (R_T + 3.4), Y + Math.sin(a) * (R_T + 3.4), 0));
    }
    P.add('bufferTube', 'anod', tr(cyl(R_T, R_T, -2, L_T, 34, true), 0, Y, 0));
    P.add('tubeRib', 'anod', tr(boxC(0, 0, 0, 9.0, 5.0, L_T - 14, 1.2, 0.3), 0, Y - R_T - 1.2, L_T / 2));
    for (let i = 0; i < O.mounts; i++)
      P.add('detentNotch', 'bore', tr(cyl(3.2, 3.2, -4.4, 1.6, 12, true), 0, Y - R_T - 1.2, 34 + i * STEP));

    /* Салазка: стенки обхватывают трубу сверху и снизу, между ними — паз. */
    const HW = 20.0;
    for (const s of [-1, 1])
      P.add('sliderWall', O.mat, boxC(s * (HW - 2.4), Y - 2.0, pos + bodyL / 2, 5.0, 46, bodyL, 3.0, 0.6));
    P.add('sliderTop', O.mat, boxC(0, Y + 20.0, pos + bodyL / 2, HW * 2 - 2, 8.0, bodyL, 3.0, 0.6));
    P.add('sliderBottom', O.mat, boxC(0, Y - 24.0, pos + bodyL / 2, HW * 2 - 2, 8.0, bodyL - 10, 3.0, 0.6));
    P.add('sliderNose', O.mat, tr(tube(R_T + 0.6, R_T + 5.0, pos - 6, pos + 6, 30), 0, Y, 0));

    /* щека и накладка под скулу */
    P.add('cheek', O.mat, boxC(0, Y + 27.0, pos + bodyL / 2 + 6, 30, 10.0, bodyL - 18, 4.0, 0.8));
    P.add('cheekPad', 'rubber', boxC(0, Y + 32.4, pos + bodyL / 2 + 6, 27, 3.0, bodyL - 26, 3.0, 0.5));

    /* рычаг фиксатора длины под трубой */
    P.add('lockLever', 'poly', boxC(0, Y - 30.0, pos + 26, 24, 8.0, 34, 2.4, 0.5));
    P.add('lockPin', 'steel', tr(cylY(2.6, 2.6, Y - 28, Y - 16, 14), 0, 0, pos + 26));
    P.add('lockSpring', 'steel', tr(spring(3.2, 0.7, 0, 9, 6), 0, Y - 26, pos + 26));

    const zEnd = pos + bodyL;
    const butt = buttPad(P, O.mat, zEnd, Y, 21.0, Y + 26.0, Y - 28.0, { plate: 6, pad: 12 });

    for (const s of [-1, 1])
      P.add('qdSocket', 'steelDk', tr(cylX(5.0, 5.0, s * 18.0, s * 21.0, 18), 0, Y - 12, pos + 22));
    P.add('slingLoop', 'steelDk', tr(rx(tube(4.0, 6.4, -2.0, 2.0, 22), PI / 2), 0, Y - 30, zEnd - 10));

    return { parts: P.list, meta: {
      slot: 'stock', name: 'Телескопический приклад', short: 'ТЕЛЕСКОП', weight: 340,
      lengthOfPull: butt, adjust: { steps: O.mounts, step: STEP, current: O.ext },
      cheekY: Y + 30, buttZ: butt,
      stats: { vertRecoil: -16, horizRecoil: -10, adsSpeed: -2, mobility: -2, ergonomics: 6 } } };
  };

  /* Складной рамочный приклад в духе АКМС/АКС-74.

     Рама — штампованный треугольник: два плеча, сходящиеся от шарнира у
     коробки к плоскому затыльнику. Плечи идут наклонно (верхнее почти по
     оси, нижнее — вниз и назад), как у настоящего АКС; прежняя версия
     ставила две параллельные трубки в пустоте без связи с коробкой. */
  OUT.stock_folding = function (o) {
    const O = Object.assign({ mat: 'steelDk' }, o || {});
    const P = bag();
    const Y = 30.0, L = 236;
    const HINGE = [-14.0, Y - 4, 6];

    /* проушина шарнира на хвосте коробки */
    P.add('hingeBlock', O.mat, boxC(HINGE[0], HINGE[1], HINGE[2], 20, 42, 26, 3.0, 0.5));
    P.add('hingeAxis', 'steel', tr(cylY(4.2, 4.2, HINGE[1] - 26, HINGE[1] + 26, 18), HINGE[0], 0, HINGE[2]));
    P.add('hingeLatch', 'steel', boxC(HINGE[0], HINGE[1] - 24, 22, 9.0, 9.0, 18, 1.2, 0.3));
    P.add('latchSpring', 'steel', tr(spring(3.0, 0.6, 0, 9, 5), HINGE[0], HINGE[1] - 26, 22));

    /* корень рамы: обойма, которой плечи сидят на проушине */
    P.add('frameRoot', O.mat, boxC(-2.0, Y, 16, 34, 44, 22, 3.0, 0.5));

    /* два плеча-штамповки прямоугольного сечения, сходящиеся к затыльнику */
    const armRings = (y0, y1, dy) => {
      const rings = [];
      const NS = 12;
      for (let i = 0; i <= NS; i++) {
        const t = i / NS, z = 16 + t * (L - 34);
        const yc = y0 + (y1 - y0) * t;
        const hw = 5.0 - 1.0 * t, hh = 8.0 - 2.4 * t;
        const ring = [];
        for (let k = 0; k < 14; k++) {
          const a = k / 14 * TAU, cs = Math.cos(a), sn = Math.sin(a), p = 3.2;
          ring.push([hw * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p),
            yc + dy + hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p), z]);
        }
        rings.push(ring);
      }
      return loft(rings, true, true);
    };
    /* верхнее плечо идёт почти по оси, нижнее опускается под щёку */
    P.add('armUpper', O.mat, armRings(Y + 16, Y + 12, 0));
    P.add('armLower', O.mat, armRings(Y - 22, Y - 14, 0));
    /* перемычка жёсткости посередине рамы */
    P.add('frameBrace', O.mat, tr(boxC(0, 0, 0, 9.0, 34, 7.0, 1.4, 0.3), 0, Y - 2, 16 + (L - 34) * 0.58));

    /* плоский затыльник-«лопата» с резиновой накладкой */
    const zEnd = L - 18;
    P.add('buttPlate', O.mat, boxC(0, Y, zEnd + 5, 44, 62, 9, 5.0, 0.8));
    P.add('buttPad', 'rubber', boxC(0, Y, zEnd + 13, 43, 60, 8, 5.0, 0.8));
    for (let i = 0; i < 4; i++)
      P.add('padGroove', 'rubber', boxC(0, Y - 22 + i * 14, zEnd + 16.6, 41, 2.2, 1.4, 0.5, 0.1));
    P.add('slingLoop', O.mat, tr(rx(tube(4.0, 6.4, -2.0, 2.0, 22), PI / 2), 0, Y - 30, 40));

    return { parts: P.list, meta: {
      slot: 'stock', name: 'Складной рамочный', short: 'СКЛАДНОЙ', weight: 520,
      lengthOfPull: zEnd + 17, cheekY: Y + 18, buttZ: zEnd + 17,
      /* складывается влево вокруг проушины — как у АКС */
      fold: { pivot: HINGE, axis: 'y', angle: 176,
        parts: ['frameRoot', 'armUpper', 'armLower', 'frameBrace',
          'buttPlate', 'buttPad', 'padGroove', 'slingLoop'] },
      stats: { vertRecoil: -12, horizRecoil: -8, adsSpeed: 0, mobility: 6, ergonomics: 2 } } };
  };

  /* Классический деревянный приклад АКМ.

     Силуэт настоящего АК: из хвоста коробки выходит узкая шейка, гребень
     идёт почти горизонтально до затыльника, а низ круто уходит вниз и
     назад, образуя характерный «живот» под щёку. Пятка затыльника выше
     носка, поэтому приклад «ложится» в плечо. */
  OUT.stock_wood = function (o) {
    const O = Object.assign({ mat: 'wood' }, o || {});
    const P = bag();
    /* Y — линия посадки слота (48 мм над плоскостью магазина). Верх стыка
       +45 совпадает с крышкой коробки (93 мм), низ −18 — с её дном. */
    const Y = 0.0, L = 246;
    /* [t, верх, низ, полуширина] — отсчёт от линии посадки */
    const TAB = [
      [0.00, 45, -18, 16.0],   // стык с хвостом коробки
      [0.07, 44, -22, 16.2],   // шейка
      [0.20, 43, -33, 16.8],
      [0.36, 43, -42, 17.4],
      [0.54, 44, -48, 17.9],
      [0.72, 46, -51, 18.3],
      [0.88, 48, -52, 18.6],
      [1.00, 50, -50, 18.8]    // пятка выше носка — приклад ложится в плечо
    ];
    const prof = stockBody(P, 'stockBody', O.mat, L, Y, TAB, { rings: 26, seg: 30, power: 4.6 });

    /* стальной затыльник по обводу торца и винты пятки/носка */
    const top = prof.top(1), bot = prof.bot(1), hw = prof.hw(1);
    P.add('buttPlate', 'steelDk', boxC(0, (top + bot) / 2, L + 3.5, hw * 2 + 1.6, top - bot + 2.0, 7, 3.0, 0.6));
    P.add('buttSerration', 'steelDk', boxC(0, (top + bot) / 2, L + 7.2, hw * 2 - 2, top - bot - 4, 1.2, 2.0, 0.2));
    P.add('buttScrew', 'steel', tr(capScrew(4.0, 8, 2.0), 0, top - 7, L + 7));
    P.add('buttScrewLow', 'steel', tr(capScrew(4.0, 8, 2.0), 0, bot + 8, L + 7));
    /* лючок пенала принадлежностей в пятке */
    P.add('cleaningTrap', 'steelDk', tr(cyl(7.0, 7.0, L + 2, L + 6, 22, true), 0, Y + 34, 0));
    /* антабка на левой стороне ложи */
    /* Антабка утоплена в древесину: прорезь в ложе и стальная скоба в ней,
       как на АКМ. Накладная «шайба» снаружи выглядела чужеродной. */
    const swZ = L * 0.30, swX = prof.hw(0.30) - 1.2, swY = Y - 26;
    P.add('slingSlot', 'woodDk', tr(boxC(0, 0, 0, 5.0, 13, 34, 1.5, 0.3), -swX, swY, swZ));
    P.add('slingLoop', 'steelDk', tr(ry(G.torus(5.6, 1.7, 20, 9), 0), -swX - 0.4, swY, swZ));
    P.add('slingPin', 'steel', tr(cylX(1.6, 1.6, -swX - 3.0, -swX + 3.0, 12), 0, swY + 5.2, swZ));

    return { parts: P.list, meta: {
      slot: 'stock', name: 'Деревянный приклад', short: 'ДЕРЕВО', weight: 640,
      lengthOfPull: L + 7, cheekY: Y + 44, buttZ: L + 7,
      stats: { vertRecoil: -20, horizRecoil: -14, adsSpeed: -4, mobility: -6, ergonomics: 4 } } };
  };

  /* «Пистолетная» заглушка вместо приклада (труба без салазки) */
  OUT.stock_none = function () {
    const P = bag();
    const Y = 18.0, R_T = 14.6;
    P.add('bufferTube', 'anod', tr(cyl(R_T, R_T, 0, 88, 32, true), 0, Y, 0));
    P.add('tubeCap', 'anod', tr(lathe([{ r: 0, z: 88 }, { r: R_T, z: 88 },
      { r: R_T - 1.5, z: 92 }, { r: 0, z: 92 }], 30, true), 0, Y, 0));
    P.add('castleNut', 'steelDk', tr(cyl(R_T + 4.0, R_T + 4.0, -6, 0, 30, true), 0, Y, 0));
    P.add('slingLoop', 'steelDk', tr(rx(tube(3.6, 5.8, -2.0, 2.0, 20), PI / 2), 0, Y - 16, 20));
    return { parts: P.list, meta: {
      slot: 'stock', name: 'Без приклада', short: 'НЕТ', weight: 120,
      lengthOfPull: 92, cheekY: Y + 14, buttZ: 92,
      stats: { vertRecoil: 22, horizRecoil: 16, adsSpeed: 6, mobility: 14, ergonomics: -12 } } };
  };

  /* ==================================================================
     Цевья. Начало координат — стык с коробкой, рост в −Z.
     ================================================================== */

  /* Модульное цевьё M-LOK: труба с гранями, планка сверху, слоты по бокам */
  OUT.handguard_mlok = function (o) {
    const O = Object.assign({ len: 240, mat: 'anod', slots: true }, o || {});
    const P = bag();
    const L = O.len, R = 21.0, Y = 0;

    /* восьмигранная труба */
    const rings = [];
    for (const z of [-L, -L + 6, -8, 0]) {
      const ring = [];
      const rr = (z > -10) ? R + 2.2 : R;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU + PI / 8;
        ring.push([Math.cos(a) * rr, Math.sin(a) * rr, z]);
        ring.push([Math.cos(a) * rr, Math.sin(a) * rr, z]);
      }
      rings.push(ring);
    }
    P.add('shell', O.mat, loft(rings, false, false));
    /* внутренняя стенка, чтобы труба не была «бумажной» */
    const ringsIn = rings.map((r) => r.map((p) => {
      const l = Math.hypot(p[0], p[1]) || 1;
      return [p[0] / l * (l - 3.0), p[1] / l * (l - 3.0), p[2]];
    }));
    P.add('shellInner', 'bore', loft(ringsIn, false, false));
    P.add('capFront', O.mat, tr(tube(R - 3.2, R + 0.3, -L - 3, -L, 26), 0, 0, 0));

    /* верхняя планка по всей длине */
    for (const p of [{ g: railStrip(L - 4, -4, 5.2, 4.2) }])
      P.add('topRail', O.mat, tr(p.g, 0, R + 4.6, 0));

    /* M-LOK слоты: по 3 ряда на каждой из нижних граней */
    if (O.slots) {
      for (const side of [-1, 1, 0]) {
        const a = side === 0 ? -PI / 2 : (side > 0 ? 0 : PI);
        for (let i = 0; i < Math.floor((L - 40) / 42); i++) {
          const z = -30 - i * 42;
          const g = boxC(0, 0, z, 6.0, 3.0, 32, 1.5, 0.3);
          P.add('mlokSlot', 'bore', tr(rz(tr(g, 0, R - 1.0, 0), a), 0, 0, 0));
        }
      }
    }
    /* вентиляционные отверстия по верхним скосам */
    for (const s of [-1, 1]) for (let i = 0; i < Math.floor((L - 50) / 30); i++) {
      const a = s * D(45);
      P.add('vent', 'bore', tr(rz(tr(cyl(4.6, 4.6, R - 3.4, R + 0.6, 16, true), 0, 0, 0), 0), 0, 0, 0));
      P.list.pop();
      const g = rx(cyl(4.6, 4.6, R - 3.4, R + 0.6, 16, true), -PI / 2);
      P.add('vent', 'bore', tr(rz(tr(g, 0, 0, -36 - i * 30), a), 0, 0, 0));
    }
    /* гайка ствола и антиротационные зубья */
    P.add('barrelNut', 'steelDk', tr(tube(15.0, R - 1.6, -6, 10, 30), 0, 0, 0));
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      P.add('nutTooth', 'steelDk', tr(cyl(1.6, 1.6, -5, 8, 8, true),
        Math.cos(a) * (R - 3.4), Math.sin(a) * (R - 3.4), 0));
    }
    for (const s of [-1, 1])
      P.add('clampScrew', 'steel', tr(rx(capScrew(3.4, 9, 1.6), PI), s * 12.0, -R - 2.0, -6));

    return { parts: P.list, meta: {
      slot: 'handguard', name: 'Цевьё M-LOK', short: 'M-LOK', weight: 320, len: L,
      rails: {
        top: { pos: [0, R + 4.6, -4], rot: [0, 0, 0], len: L - 4 },
        bottom: { pos: [0, -R - 0.6, -30], rot: [0, 0, PI], len: L - 60 },
        left: { pos: [-R - 0.6, 0, -30], rot: [0, 0, PI / 2], len: L - 60 },
        right: { pos: [R + 0.6, 0, -30], rot: [0, 0, -PI / 2], len: L - 60 }
      },
      stats: { vertRecoil: -4, adsSpeed: -1, mobility: 0, ergonomics: 6 } } };
  };

  /* Классическое деревянное цевьё с газовой трубкой */
  OUT.handguard_wood = function (o) {
    const O = Object.assign({ len: 200, mat: 'wood' }, o || {});
    const P = bag();
    const L = O.len;
    /* нижняя накладка */
    const rings = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, z = -t * L;
      const w = 20.5 - 2.6 * Math.pow(t, 1.6), h = 17.5 - 3.5 * t;
      const ring = [];
      for (let k = 0; k < 20; k++) {
        const a = k / 20 * TAU, cs = Math.cos(a), sn = Math.sin(a), p = 2.4;
        ring.push([w * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p),
          -6 + h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p) * (sn < 0 ? 1.15 : 0.8), z]);
      }
      rings.push(ring);
    }
    P.add('lowerWood', O.mat, loft(rings, true, true));
    /* верхняя накладка над газовой трубкой */
    const ringsUp = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, z = -8 - t * (L - 30);
      const w = 14.5 - 1.6 * t, h = 11.0 - 1.4 * t;
      const ring = [];
      for (let k = 0; k < 18; k++) {
        const a = k / 18 * TAU, cs = Math.cos(a), sn = Math.sin(a), p = 2.3;
        ring.push([w * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p),
          26 + h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p), z]);
      }
      ringsUp.push(ring);
    }
    P.add('upperWood', O.mat, loft(ringsUp, true, true));
    /* стальные обоймицы и «ласточкин хвост» под боковой кронштейн */
    for (const z of [-12, -L + 16])
      P.add('ferrule', 'steelDk', tr(tube(19.0, 21.4, z - 4, z + 4, 26), 0, -6, 0));
    /* пальцевые выемки — тёмные полосы заподлицо с боковиной */
    /* пальцевые выемки — неглубокие овальные впадины на боковинах */
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++)
      P.add('grooveCut', 'woodDk', tr(ry(cyl(5.4, 5.4, 0, 1.6, 20, true), PI / 2),
        s * 19.0, -6, -40 - i * 26));

    return { parts: P.list, meta: {
      slot: 'handguard', name: 'Деревянное цевьё', short: 'ДЕРЕВО', weight: 260, len: L,
      rails: {},
      stats: { vertRecoil: 0, adsSpeed: 1, mobility: 2, ergonomics: -4 } } };
  };

  /* Цевьё с «квад-рейл»: четыре планки Пикатинни */
  OUT.handguard_quad = function (o) {
    const O = Object.assign({ len: 230, mat: 'anod' }, o || {});
    const P = bag();
    const L = O.len, R = 19.5;
    P.add('core', O.mat, tube(R - 3.0, R, -L, 0, 26));
    for (const [nm, a, y, x] of [['top', 0, R, 0], ['bottom', PI, -R, 0],
      ['left', PI / 2, 0, -R], ['right', -PI / 2, 0, R]]) {
      const strip = railStrip(L - 8, -6, 5.0, 4.2);
      P.add(nm + 'Rail', O.mat, tr(rz(tr(strip, 0, R + 4.4, 0), a), 0, 0, 0));
    }
    P.add('barrelNut', 'steelDk', tr(tube(14.6, R - 1.4, -6, 12, 28), 0, 0, 0));
    for (const s of [-1, 1])
      P.add('clampScrew', 'steel', tr(rx(capScrew(3.4, 9, 1.6), PI), s * 11.0, -R - 6.5, -8));
    return { parts: P.list, meta: {
      slot: 'handguard', name: 'Квад-рейл', short: 'QUAD', weight: 430, len: L,
      rails: {
        top: { pos: [0, R + 4.4, -6], rot: [0, 0, 0], len: L - 8 },
        bottom: { pos: [0, -R - 4.4, -6], rot: [0, 0, PI], len: L - 8 },
        left: { pos: [-R - 4.4, 0, -6], rot: [0, 0, PI / 2], len: L - 8 },
        right: { pos: [R + 4.4, 0, -6], rot: [0, 0, -PI / 2], len: L - 8 }
      },
      stats: { vertRecoil: -6, adsSpeed: -3, mobility: -4, ergonomics: 8 } } };
  };


  /* ==================================================================
     ОПТИЧЕСКИЕ КРОНШТЕЙНЫ (OPTIC MOUNT)

     Отдельный слот-переходник: на АК прицел нельзя поставить напрямую,
     сначала ставится кронштейн, и уже он даёт планку под оптику.
     Каждый кронштейн объявляет rails.top — система подхватывает её как
     дочерний слот и предлагает туда прицелы.
     ================================================================== */

  /* Крышка ствольной коробки с планкой (самый частый вариант на АК) */
  OUT.mount_dustcover = function (o) {
    const O = Object.assign({ mat: 'anod' }, o || {});
    const P = bag();
    /* Крышка садится на коробку: ширина по щекам 36 мм, подъём арки над
       посадочной плоскостью 17 мм — как у штатной крышки АК. Высокая арка
       из прежней версии поднимала прицел на «ходули». */
    const L = 200, W = 36, H = 17;
    const RAIL_Y = H + 3.4;                  // низ планки лежит на спине крышки

    /* корпус крышки: арочный профиль с рёбрами жёсткости */
    const arch = [];
    for (let k = 0; k <= 16; k++) {
      const a = PI * (k / 16);
      arch.push([Math.cos(a) * (W / 2), Math.sin(a) * H * 0.92]);
    }
    arch.push([-W / 2, -2], [W / 2, -2]);
    P.add('cover', O.mat, extrude(G.round(arch, 1.2), { z0: -L, z1: 0, ch: 0.5 }));
    for (let i = 0; i < 5; i++)
      P.add('coverRib', O.mat, boxC(0, H * 0.45, -18 - i * 40, W + 0.8, H * 0.6, 3.0, 1.0, 0.2));

    /* передний зацеп и задняя защёлка — то, чем крышка держится */
    P.add('frontLug', 'steelDk', boxC(0, 4.0, -L + 4, W - 6, 7.0, 10, 1.0, 0.3));
    P.add('rearLatch', 'steelDk', boxC(0, 5.5, -6, 14, 10.0, 12, 1.2, 0.3));
    P.add('latchSpring', 'steel', tr(spring(3.0, 0.6, 0, 8, 5), 0, 9.0, -10));

    /* планка Пикатинни сверху, на всю длину крышки */
    P.add('rail', O.mat, tr(railStrip(L - 16, -8, 5.2, 4.2), 0, RAIL_Y, 0));
    /* усиленные боковые щёки — крышка с планкой не «гуляет» */
    for (const s of [-1, 1])
      P.add('sideWall', O.mat, boxC(s * (W / 2 - 1.2), H * 0.4, -L / 2, 2.4, H * 0.75, L - 20, 1.0, 0.3));

    return { parts: P.list, meta: {
      slot: 'mount', name: 'Крышка с планкой', short: 'КРЫШКА', weight: 240,
      rails: { top: { pos: [0, RAIL_Y, -8], rot: [0, 0, 0], len: L - 16, accepts: ['optic', 'magnifier'] } },
      stats: { adsSpeed: -1, ergonomics: 4 } } };
  };

  /* Боковой кронштейн-переходник на «ласточкин хвост» АК */
  OUT.mount_side = function (o) {
    const O = Object.assign({ mat: 'anod' }, o || {});
    const P = bag();
    const RAIL_Y = 58;                        // планка над осью канала ствола

    /* зажим на боковую планку: скоба + прижимной рычаг */
    P.add('clampPlate', O.mat, boxC(0, 14, 0, 10, 40, 78, 2.4, 0.5));
    P.add('dovetailJaw', 'steelDk', tr(rz(boxC(0, 0, 0, 8, 11, 74, 1.0, 0.3), D(6)), -4.0, 2.0, 0));
    P.add('lever', 'steel', tr(cylX(4.2, 4.2, -17, -7, 18), 0, 8.0, 24));
    P.add('leverArm', O.mat, boxC(-14.0, 22.0, 24, 5.0, 30.0, 8.0, 1.6, 0.3));
    P.add('leverSpring', 'steel', tr(spring(3.0, 0.6, 0, 8, 5), -10.0, 8.0, 12));

    /* вынос вверх и вперёд — прицел встаёт над ствольной коробкой */
    P.add('arm', O.mat, boxC(6.0, RAIL_Y - 14, -6, 22, 26, 68, 2.4, 0.5));
    P.add('armRib', O.mat, boxC(6.0, RAIL_Y - 24, -6, 10, 14, 64, 1.4, 0.3));
    P.add('rail', O.mat, tr(railStrip(84, 34, 5.2, 4.2), 0, RAIL_Y, 0));

    return { parts: P.list, meta: {
      slot: 'mount', name: 'Боковой кронштейн', short: 'БОК', weight: 290,
      rails: { top: { pos: [0, RAIL_Y, 34], rot: [0, 0, 0], len: 84, accepts: ['optic', 'magnifier'] } },
      stats: { adsSpeed: -2, mobility: -1, ergonomics: 2 } } };
  };

  /* Низкий переходник: просто планка поверх штатной колодки прицела */
  OUT.mount_rearsight = function (o) {
    const O = Object.assign({ mat: 'anod' }, o || {});
    const P = bag();
    const RAIL_Y = 12.4;
    P.add('base', O.mat, boxC(0, 4.0, 0, 24, 8.0, 64, 2.0, 0.4));
    for (const s of [-1, 1])
      P.add('clawJaw', 'steelDk', boxC(s * 11.0, 1.0, 0, 4.0, 10.0, 56, 1.0, 0.3));
    for (const z of [-20, 20])
      P.add('clampScrew', 'steel', tr(rx(capScrew(3.4, 9, 1.6), PI), 11.0, -2.0, z));
    P.add('rail', O.mat, tr(railStrip(60, -2, 5.0, 4.2), 0, RAIL_Y, 0));
    return { parts: P.list, meta: {
      slot: 'mount', name: 'Низкий переходник', short: 'НИЗКИЙ', weight: 90,
      rails: { top: { pos: [0, RAIL_Y, -2], rot: [0, 0, 0], len: 60, accepts: ['optic'] } },
      stats: { adsSpeed: 1, ergonomics: 1 } } };
  };

  /* «Горка» — цельнофрезерованная платформа поверх крышки коробки.

     Классический тюнинг АК: длинная планка с рёбрами охлаждения по бокам,
     облегчающими окнами и собственным «завалённым» местом под мини-
     коллиматор. В отличие от штатной крышки держит нулевую точку, потому
     что опирается сразу на колодку прицела и на хвостовик коробки. */
  OUT.mount_topcover_rail = function (o) {
    const O = Object.assign({ mat: 'anodMatt' }, o || {});
    const P = bag();
    const L = 228, W = 38, H = 20;
    const RAIL_Y = H + 3.2;

    /* корпус: плоская спина с покатыми боками */
    const body = G.round([
      [-W / 2, 0], [W / 2, 0], [W / 2, H - 7], [W / 2 - 5.5, H],
      [-W / 2 + 5.5, H], [-W / 2, H - 7]
    ], 1.6);
    P.add('shell', O.mat, extrude(body, { z0: -L, z1: 0, ch: 0.6 }));

    /* косые рёбра охлаждения по бокам — узнаваемый признак «горки» */
    for (const s of [-1, 1])
      for (let i = 0; i < 16; i++)
        P.add('coolFin', O.mat, tr(rz(boxC(0, 0, 0, 3.4, H - 9, 4.6, 0.8, 0.2), s * D(16)),
          s * (W / 2 - 1.0), H / 2 - 1.0, -26 - i * 11));

    /* облегчающие окна в боковинах ближе к хвосту */
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++)
        P.add('lightHole', 'bore', tr(ry(cyl(4.4, 4.4, s * (W / 2 - 3.0), s * (W / 2 + 0.6), 18, true), PI / 2),
          0, H / 2, -186 - i * 13));

    /* опора на колодку прицела спереди и на хвостовик коробки сзади */
    P.add('frontClaw', 'steelDk', boxC(0, -3.0, -L + 12, W - 8, 14.0, 24, 1.6, 0.4));
    P.add('frontPin', 'steel', tr(cylX(2.6, 2.6, -14, 14, 16), 0, -4.0, -L + 12));
    P.add('rearBlock', 'steelDk', boxC(0, -2.0, -10, 18, 12.0, 20, 1.4, 0.3));
    P.add('rearScrew', 'steel', tr(rx(capScrew(3.6, 10, 1.8), PI), 0, 6.0, -10));

    /* основная планка сверху и «завалённая» площадка под мини-коллиматор */
    P.add('rail', O.mat, tr(railStrip(L - 24, -12, 5.2, 4.2), 0, RAIL_Y, 0));
    P.add('cantedPad', O.mat, tr(rz(boxC(0, 0, 0, 22, 7.0, 54, 1.6, 0.3), D(45)),
      -(W / 2 - 2.0), H / 2 + 2.0, -62));

    return { parts: P.list, meta: {
      slot: 'mount', name: 'Горка (планка на коробку)', short: 'ГОРКА', weight: 310,
      rails: {
        top: { pos: [0, RAIL_Y, -12], rot: [0, 0, 0], len: L - 24,
          accepts: ['optic', 'magnifier', 'ironRear'] },
        /* левая площадка под «завалённый» коллиматор */
        left: { pos: [-(W / 2 + 2.0), H / 2 + 7.0, -62], rot: [0, 0, D(45)], len: 50,
          accepts: ['optic_offset'], maxWeight: 120 }
      },
      stats: { adsSpeed: -2, mobility: -1, ergonomics: 7, precision: 4 } } };
  };

  /* Боковая планка под фонарь/ЛЦУ (SIDERAIL) — вешается на цевьё */
  OUT.siderail_short = function (o) {
    const O = Object.assign({ mat: 'anod', len: 76 }, o || {});
    const P = bag();
    const L = O.len;
    P.add('base', O.mat, boxC(0, 3.0, 0, 22, 6.0, L, 1.8, 0.4));
    P.add('rail', O.mat, tr(railStrip(L - 8, (L - 8) / 2, 5.0, 4.2), 0, 9.6, 0));
    for (const z of [-L / 2 + 12, L / 2 - 12])
      P.add('screw', 'steel', tr(rx(capScrew(3.0, 7, 1.4), PI), 0, 0.5, z));
    return { parts: P.list, meta: {
      slot: 'siderail', name: 'Боковая планка', short: 'ПЛАНКА', weight: 58, len: L,
      rails: { top: { pos: [0, 9.6, (L - 8) / 2], rot: [0, 0, 0], len: L - 8,
        accepts: ['tactical'] } },
      stats: { mobility: -1, ergonomics: 2 } } };
  };

  /* ==================================================================
     Боковые модули и мелочи
     ================================================================== */

  /* Боковая планка-переходник (для АК: планка на левую стенку) */
  OUT.sidemount_rail = function () {
    const P = bag();
    P.add('plate', 'anod', boxC(0, 0, 0, 8.0, 34, 86, 2.4, 0.5));
    P.add('dovetail', 'steelDk', tr(rz(boxC(0, 0, 0, 7.0, 12, 82, 1.0, 0.3), D(6)), -5.0, -12, 0));
    P.add('lever', 'steel', tr(cylX(4.5, 4.5, -18, -6, 18), 0, -6, 24));
    P.add('leverArm', 'anod', boxC(-16.0, 6.0, 24, 5.0, 28, 8.0, 1.6, 0.3));
    P.add('topRail', 'anod', tr(railStrip(80, 40, 5.0, 4.2), 0, 21.0, 0));
    return { parts: P.list, meta: {
      slot: 'sidemount', name: 'Боковая планка', short: 'ПЛАНКА', weight: 130,
      rails: { top: { pos: [0, 21.0, 40], rot: [0, 0, 0], len: 80 } },
      stats: { adsSpeed: -1, mobility: -1, ergonomics: 2 } } };
  };

  /* Ремень-антабка QD */
  OUT.sling_qd = function () {
    const P = bag();
    P.add('socket', 'steelDk', tr(cylX(5.6, 5.6, -4, 4, 20), 0, 0, 0));
    P.add('pushButton', 'steel', tr(cylX(2.4, 2.4, 4, 6.4, 14), 0, 0, 0));
    P.add('loop', 'steelDk', tr(ry(G.torus(8.0, 2.2, 26, 12), 0), 0, -10.0, 0));
    P.add('strap', 'rubber', boxC(0, -22.0, 0, 3.0, 22, 26, 1.0, 0.2));
    return { parts: P.list, meta: {
      slot: 'sling', name: 'Антабка QD', short: 'РЕМЕНЬ', weight: 40,
      stats: { adsSpeed: 1, mobility: 3, ergonomics: 2 } } };
  };

  return OUT;
};
