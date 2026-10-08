'use strict';
/* =========================================================
   NPC 代码生成器
   输入：NPC 名字 + 题目 id
   输出：一段看起来像那么回事的 C++ 代码
   同一组合总是生成同一份代码（确定性）
   ========================================================= */

const NPC_STYLES = {
  '小明': {
    indent: '    ',
    header: id => `// ${id} \u2014\u2014 小明\n// 认真读题，稳扎稳打`,
    inline: ['// 先读入', '// 核心处理', '// 输出结果'],
    stmtRange: [6, 9],
    useSort: true,
    useBubble: false,
  },
  '小红': {
    indent: '    ',
    header: id => `// ${id} \u2014\u2014 小红`,
    inline: ['// 注意边界'],
    stmtRange: [5, 8],
    useSort: true,
    useBubble: false,
  },
  '小刚': {
    indent: '    ',
    header: id => `// ${id} by 小刚`,
    inline: [],
    stmtRange: [4, 6],
    useSort: true,
    useBubble: false,
  },
  '小强': {
    indent: '  ',
    header: id => `// ${id}`,
    inline: [],
    stmtRange: [3, 5],
    useSort: false,
    useBubble: true,
  },
  '小丽': {
    indent: '    ',
    header: id => `// ${id} …… 好难`,
    inline: ['// 不会写', '// 先随便写写'],
    stmtRange: [2, 4],
    useSort: false,
    useBubble: false,
  },
};

const STMT_POOL = {
  loopBody: [
    'ans += a[i];',
    'ans = max(ans, a[i]);',
    'ans = min(ans, a[i]);',
    'sum += i;',
    'if (a[i] > 0) ans++;',
    'ans = (ans + a[i]) % 1000000007;',
  ],
  sortStmt: [
    'sort(a.begin(), a.end());',
    'sort(a.begin(), a.end(), greater<long long>());',
    'reverse(a.begin(), a.end());',
  ],
  write: [
    'cout << ans << endl;',
    'cout << sum << endl;',
    'cout << ans + sum << endl;',
  ],
};

function genNpcCode(npcName, probId){
  const style = NPC_STYLES[npcName] || NPC_STYLES['小刚'];
  const rng = mulberry32(hashStr(npcName + '|' + probId));
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const range = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const ind = style.indent;
  const inner = ind + ind;

  const lines = [];
  lines.push(style.header(probId));
  lines.push('#include <bits/stdc++.h>');
  lines.push('using namespace std;');
  lines.push('');
  lines.push('int main() {');
  lines.push(ind + 'ios::sync_with_stdio(false);');
  lines.push(ind + 'cin.tie(0);');
  lines.push('');

  /* 1. 声明区 */
  lines.push(ind + 'int n;');
  if (rng() < 0.75) lines.push(ind + 'long long ans = 0;');
  if (rng() < 0.55) lines.push(ind + 'long long sum = 0;');
  if (rng() < 0.45) lines.push(ind + 'vector<long long> a;');

  /* 2. 输入区 */
  lines.push(ind + 'cin >> n;');
  if (rng() < 0.6) lines.push(ind + 'a.resize(n);');
  if (rng() < 0.75) lines.push(ind + 'for (int i = 0; i < n; i++) cin >> a[i];');

  /* 3. 逻辑区 */
  if (style.inline.length && rng() < 0.6){
    lines.push(ind + pick(style.inline));
  }
  const bodyN = range(style.stmtRange[0], style.stmtRange[1]);
  lines.push(ind + 'for (int i = 0; i < n; i++) {');
  for (let i = 0; i < bodyN; i++){
    lines.push(inner + pick(STMT_POOL.loopBody));
  }
  lines.push(ind + '}');

  /* 4. 排序 / 冒泡（可选） */
  if (style.useSort && rng() < 0.7){
    lines.push(ind + pick(STMT_POOL.sortStmt));
  } else if (style.useBubble && rng() < 0.6){
    lines.push(ind + 'for (int i = 0; i < n - 1; i++)');
    lines.push(inner + 'for (int j = 0; j < n - 1 - i; j++)');
    lines.push(inner + ind + 'if (a[j] > a[j + 1]) swap(a[j], a[j + 1]);');
  }

  /* 5. 输出 */
  lines.push('');
  lines.push(ind + pick(STMT_POOL.write));
  lines.push('');
  lines.push(ind + 'return 0;');
  lines.push('}');

  return lines.join('\n');
}
