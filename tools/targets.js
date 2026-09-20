/* Цели сборки: какая модель, какой вьюер и какие детали базовой модели
   уступают место модулям. Карта имён нужна системе скрытия: деталь
   исчезает ровно тогда, когда в её слот поставлен модуль. */
'use strict';

module.exports = [
  {
    weapon: 'akm',
    title: 'АКМ',
    shell: 'src/shell/akm.html',
    model: ['src/models/akm.js'],
    app: 'src/app/akm_viewer.js',
    out: 'dist/akm.html',
    hide: {
      stock: 'stock', buttPlate: 'stock', buttSerration: 'stock', buttScrew: 'stock',
      swivelRear: 'stock', swivelRearBase: 'stock',
      magBody: 'mag', magLips: 'mag', magFloor: 'mag', magCatchLug: 'mag',
      lowerHandguard: 'handguard', handguardBand: 'handguard', handguardBandRear: 'handguard',
      upperHandguardTop: 'handguard', upperHandguardR: 'handguard', upperHandguardL: 'handguard',
      upperBand: 'handguard',
      brakeBase: 'muzzle', brakeWindow: 'muzzle', brakeCrown: 'muzzle', brakeDetent: 'muzzle',
      dustCover: 'mount', coverNose: 'mount',
      sideRail: 'siderail', railTop: 'siderail', railBot: 'siderail'
    }
  },
  {
    weapon: 'ak74',
    title: 'АК-74',
    shell: 'src/shell/ak74.html',
    model: ['src/models/ak74_geometry.js', 'src/models/ak74_assembly.js'],
    app: 'src/app/ak74_viewer.js',
    out: 'dist/ak74.html',
    hide: {
      muzzleBrake: 'muzzle',
      handguardLower: 'handguard', hgFerrule: 'handguard',
      handguardUpper: 'handguard', hgFerruleUp: 'handguard',
      stock: 'stock', buttPlate: 'stock', buttTrap: 'stock', slingLoop: 'stock',
      magBody: 'mag', magLugFront: 'mag', magLugRear: 'mag', magMouth: 'mag', magTopRound: 'mag',
      dustCover: 'mount'
    }
  }
];
