// одноразовый разбор бандла из attachments в src/*
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(process.argv[2], 'utf8');
const lines = src.split('\n');
const starts = [];
lines.forEach((l, i) => { const m = l.match(/^__def\("([a-z_]+)", function \(module, exports\) \{$/); if (m) starts.push({ name: m[1], i }); });
console.log(starts.map(s => s.name + ':' + (s.i + 1)).join(' '));
const ends = [];
lines.forEach((l, i) => { if (l === '});') ends.push(i); });
for (let k = 0; k < starts.length; k++) {
  const s = starts[k].i;
  const e = ends.find((x) => x > s && (k + 1 >= starts.length || x < starts[k + 1].i) && (k + 1 >= starts.length ? true : x < starts[k + 1].i));
  // последний '});' перед следующим __def
  let last = -1;
  const lim = k + 1 < starts.length ? starts[k + 1].i : lines.length;
  for (let i = s; i < lim; i++) if (lines[i] === '});') last = i;
  const body = lines.slice(s + 1, last).join('\n');
  fs.writeFileSync('/tmp/split_' + starts[k].name + '.js', body.replace(/\s+$/,'') + '\n');
  console.log(starts[k].name, last - s, 'строк');
}
