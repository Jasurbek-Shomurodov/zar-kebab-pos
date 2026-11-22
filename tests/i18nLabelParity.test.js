import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

// Every screen keeps its labels in one object per language ({ uz: {...}, ru: {...}, en: {...} }).
// A key present in one language and missing from another renders as an empty button or heading
// (CashierTables "openCheck" shipped that way), so the key sets must be identical.
const root = new URL('../src', import.meta.url).pathname
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(x => x.isDirectory() ? (x.name === 'generated' ? [] : walk(d + '/' + x.name)) : /\.jsx?$/.test(x.name) ? [d + '/' + x.name] : [])
function mask(src){ // replace string/comment contents with spaces, keep length; keep quotes for keys
  let out='',i=0,n=src.length;const stack=[];
  while(i<n){const c=src[i],d=src[i+1];
    if(c==='/'&&d==='/'){while(i<n&&src[i]!=='\n'){out+=' ';i++}continue}
    if(c==='/'&&d==='*'){while(i<n&&!(src[i]==='*'&&src[i+1]==='/')){out+=src[i]==='\n'?'\n':' ';i++}out+='  ';i+=2;continue}
    if(c==="'"||c==='"'){const q=c;let j=i+1;while(j<n&&src[j]!==q&&src[j]!=='\n'){if(src[j]==='\\')j++;j++}
      // keep quoted token as S + content-less marker but preserve key text if followed by colon
      const body=src.slice(i+1,j);const after=src.slice(j+1).match(/^\s*:/);
      out+= after ? q+body.replace(/[{}]/g,'_')+q : q+' '.repeat(Math.max(0,j-i-1))+q; i=j+1;continue}
    if(c==='`'){let j=i+1,depth=0;while(j<n){if(src[j]==='\\'){j+=2;continue}if(src[j]==='$'&&src[j+1]==='{'){depth++;j+=2;continue}if(src[j]==='}'&&depth>0){depth--;j++;continue}if(src[j]==='`'&&depth===0)break;j++}
      out+='`'+src.slice(i+1,j).replace(/[^\n]/g,' ')+'`';i=j+1;continue}
    out+=c;i++}
  return out}
function matchBrace(s,i){let d=0;for(let j=i;j<s.length;j++){const c=s[j];if(c==='{'||c==='['||c==='(')d++;else if(c==='}'||c===']'||c===')'){d--;if(d===0)return j}}return -1}
const KEY_AT = /(?:([A-Za-z_$][\w$]*)|'([^']*)'|"([^"]*)")\s*:(?!:)/y
function previousNonSpace(s, from, stop) {
  for (let j = from - 1; j > stop; j -= 1) if (!/\s/.test(s[j])) return s[j]
  return ''
}
function keys(s, open, close) {
  const ks = []
  const flags = []
  let depth = 0
  let i = open + 1
  while (i < close) {
    const c = s[i]
    if (c === '{' || c === '[' || c === '(') { depth += 1; i += 1; continue }
    if (c === '}' || c === ']' || c === ')') { depth -= 1; i += 1; continue }
    if (depth === 0 && !/\s/.test(c)) {
      const prev = previousNonSpace(s, i, open)
      if (prev === '' || prev === ',' || prev === '{') {
        KEY_AT.lastIndex = i
        const m = KEY_AT.exec(s)
        if (m && m.index + m[0].length <= close) { ks.push(m[1] || m[2] || m[3]); i += m[0].length; continue }
        if (s.startsWith('...', i)) { flags.push('spread'); i += 3; continue }
      }
    }
    i += 1
  }
  return { ks, flags }
}
function findLabelMismatches() {
let groups=0,bad=0;const badList=[];
for(const f of walk(root)){const raw=fs.readFileSync(f,'utf8');const s=mask(raw);
  const re=/(?<![\w$.'"])(uz|ru|en)\s*:\s*\{/g;let m;const blocks=[];
  while((m=re.exec(s))){const open=m.index+m[0].length-1;const close=matchBrace(s,open);if(close<0)continue;blocks.push({lang:m[1],open,close,idx:m.index})}
  // group by enclosing: consecutive blocks where next starts shortly after prev close (only whitespace/comma between)
  const top=blocks.filter(b=>!blocks.some(o=>o!==b&&o.open<b.open&&o.close>b.close));
  let g=[];const flush=()=>{if(g.length>=2){groups++;const sets={};let spread=false;for(const b of g){const k=keys(s,b.open,b.close);sets[b.lang]=new Set(k.ks);if(k.flags.length)spread=true}
      const all=new Set(Object.values(sets).flatMap(x=>[...x]));const miss={};
      for(const l of ['uz','ru','en']){if(!sets[l]){miss[l]=['<whole language block absent>'];continue}const mm=[...all].filter(k=>!sets[l].has(k));if(mm.length)miss[l]=mm}
      if(Object.keys(miss).length){bad++;const line=raw.slice(0,g[0].idx).split('\n').length;badList.push({f:f.replace(root+'/',''),line,size:all.size,spread,miss})}}g=[]};
  for(const b of top){if(g.length){const between=s.slice(g[g.length-1].close+1,b.idx);if(/^[\s,]*$/.test(between)&&!g.some(x=>x.lang===b.lang)){g.push(b);continue}flush()}g.push(b)}
  flush()}

  return { groups, badList }
}

test('per-screen label objects carry the same keys in uz, ru and en', () => {
  const { groups, badList } = findLabelMismatches()
  assert.ok(groups > 40, `expected to find the label objects, found ${groups}`)
  const report = badList
    // A language given as a reference (`en: EN`) or built with a spread cannot be compared key by key here.
    .filter(entry => !entry.spread)
    .map(entry => ({ ...entry, miss: Object.fromEntries(Object.entries(entry.miss).filter(([, keys]) => !keys[0].startsWith('<whole'))) }))
    .filter(entry => Object.keys(entry.miss).length)
    .map(entry => `${entry.f}:${entry.line} ` + Object.entries(entry.miss).map(([lang, keys]) => `missing in ${lang}: ${keys.join(', ')}`).join(' | '))
  assert.deepEqual(report, [])
})

test('the shared dictionary has the same keys in every language', async () => {
  const source = fs.readFileSync(root + '/lib/i18n.js', 'utf8')
  const masked = mask(source)
  const sets = {}
  for (const lang of ['uz', 'ru', 'en']) {
    const match = new RegExp('(?<![\\w$.])' + lang + '\\s*:\\s*\\{').exec(masked)
    assert.ok(match, `i18n.js has a ${lang} block`)
    const open = match.index + match[0].length - 1
    sets[lang] = new Set(keys(masked, open, matchBrace(masked, open)).ks)
  }
  for (const lang of ['uz', 'ru']) {
    assert.deepEqual([...sets.en].filter(key => !sets[lang].has(key)), [], `keys missing in ${lang}`)
    assert.deepEqual([...sets[lang]].filter(key => !sets.en.has(key)), [], `keys only in ${lang}`)
  }
})
