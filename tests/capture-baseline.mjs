/* =========================================================
   一次性迁移工具：从某个 git 版本重新生成行为基线
   ---------------------------------------------------------
   用法：
     node tests/capture-baseline.mjs <git-rev>
     例：node tests/capture-baseline.mjs HEAD~1

   <git-rev> 必须包含重构前的全局脚本
   （keywords.js / judge.js / npc-gen.js / problems.js）。
   产物：tests/baseline.json
   注意：正常情况下不需要重跑；baseline.json 已提交，
         tests/run.mjs 拿它当「零行为变化」的判据。
   ========================================================= */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeLegacyContext, evalIn, legacySourcesFromGit } from './_harness.mjs';

/* 用 fileURLToPath 而不是 URL.pathname：后者在部分 Node 版本上
   会丢掉结尾斜杠，导致拼接出来的路径少一层分隔符。 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rev = process.argv[2];
if (!rev){
  console.error('用法：node tests/capture-baseline.mjs <git-rev>');
  process.exit(1);
}

let sources;
try {
  sources = legacySourcesFromGit(rev, ROOT);
} catch (e){
  console.error(`无法从 ${rev} 读取重构前的脚本：` + e.message);
  process.exit(1);
}
const ctx = makeLegacyContext(sources);

const baselineSrc = `(function(){
  const SAMPLES = [
    'int main(){int a;cin>>a;cout<<a<<endl;return 0;}',
    '#include <bits/stdc++.h>\\nusing namespace std;\\nint main(){ios::sync_with_stdio(false);cin.tie(0);int n;cin>>n;vector<int> a(n);for(int i=0;i<n;i++)cin>>a[i];sort(a.begin(),a.end());long long ans=0;for(int i=0;i<n;i++)ans+=a[i];cout<<ans<<endl;return 0;}',
    'int main(){ return 0; }',
    '// 只有注释\\n/* 块注释 */\\nint main(){ printf("hi"); return 0; }',
    'int main(){ string s="int main() { return 0; }"; cout<<s; }',
    'int main(){for(int i=0;i<10;i++){if(i%2)continue;while(0)break;}int x=0;x++;x--;return 0;}',
    'int main(){vector<int>v;map<int,int>m;set<int>s;queue<int>q;stack<int>st;priority_queue<int>pq;sort(v.begin(),v.end());lower_bound(v.begin(),v.end(),1);return 0;}',
    'int gcd(int a,int b){return b?gcd(b,a%b):a;}int main(){int d=gcd(4,6);int e=abs(-1);double f=sqrt(2.0);int g=pow(2,3);return 0;}',
  ];
  const IDS = ['P14962','P16184','P17434'];
  const judgment = [];
  for (const id of IDS){
    const prob = PROBLEM_BY_ID.get(id);
    for (const code of SAMPLES){
      judgment.push({ id, code, out: judgeUnified(code, prob, KEYWORDS_LIST) });
    }
  }
  const npc = [];
  for (const name of ['\\u5c0f\\u660e','\\u5c0f\\u7ea2','\\u5c0f\\u521a','\\u5c0f\\u5f3a','\\u5c0f\\u4e3d']){
    for (const id of IDS) npc.push({ name, id, code: genNpcCode(name, id) });
  }
  const pool = PROBLEM_POOL.map(p => ({
    id: p.id, name: p.name, max: p.max, tl: p.tl, ml: p.ml,
    descLen: p.desc.length, starterLen: p.starter.length
  }));
  return { judgment, npc, pool };
})()`;

const result = evalIn(ctx, baselineSrc);
writeFileSync(ROOT + 'tests/baseline.json', JSON.stringify(result, null, 2) + '\n');
console.log(`已从 ${rev} 生成基线：` +
  `${result.judgment.length} 组评分 / ${result.npc.length} 份 NPC 代码 / ${result.pool.length} 道题`);
