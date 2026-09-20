/* Габариты собранных модулей в системе оружия (мм) — для проверки посадки. */
const fs=require('fs'), path=require('path');
const ROOT=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const MOD={};
const def=(n,f)=>{const m={exports:{}};f(m,m.exports);MOD[n]=m.exports;};
const load=(n,p)=>def(n,new Function('module','exports',read(p)));
load('kernel','src/kernel.js');
load('common','src/attach/common.js');
load('optics','src/attach/optics.js');
load('muzzle','src/attach/muzzle.js');
load('tactical','src/attach/tactical.js');
load('mags_stocks','src/attach/mags_stocks.js');
load('system','src/attach/system.js');
load('slots','src/attach/slots.js');
const G=MOD.kernel, C=MOD.common(G), SYS=MOD.system(G,C);
const REG=SYS.registry([MOD.optics(G,C),MOD.muzzle(G,C),MOD.tactical(G,C),MOD.mags_stocks(G,C)]);
const SLOTS=MOD.slots;
const bbox=(g)=>{const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(let i=0;i<g.p.length;i+=3)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],g.p[i+k]);mx[k]=Math.max(mx[k],g.p[i+k]);}
  return mn.concat(mx).map(v=>Math.round(v*10)/10);};
module.exports={G,C,SYS,REG,SLOTS,bbox};
if(require.main===module){
  const weaponKey=process.argv[2]||'akm';
  const cfg={}; for(const kv of (process.argv[3]||'').split(';')) { if(!kv)continue; const i=kv.indexOf('='); cfg[kv.slice(0,i)]=kv.slice(i+1); }
  const def0=SLOTS[weaponKey];
  const weapon={caliber:def0.caliber,weight:def0.weight,ballistics:def0.ballistics,stats:{},base:[],nodes:{},slots:def0.slots};
  const asm=SYS.assemble(weapon,REG,Object.keys(cfg).length?cfg:def0.defaults);
  for(const sk in asm.modules){
    const m=asm.modules[sk];
    const parts=asm.parts.filter(p=>p.src===sk);
    const merged=G.merge(parts.map(p=>p.geo));
    console.log(sk.padEnd(18), m.key.padEnd(18), JSON.stringify(bbox(merged)));
  }
  if(asm.slotsDynamic) for(const d of asm.slotsDynamic) console.log('  dyn', d.key, JSON.stringify(d.pos.map(v=>Math.round(v))), 'rotZ', (d.rot[2]||0).toFixed(2), d.accepts.join('/'));
  console.log('nodes', JSON.stringify(asm.nodes));
  console.log('warn', asm.warnings, 'err', asm.errors);
}
