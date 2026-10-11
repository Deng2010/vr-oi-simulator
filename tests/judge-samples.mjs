/* =========================================================
   评测器测试样本（被 run.mjs 与 capture-judge-baseline.mjs 共用）
   ---------------------------------------------------------
   为什么要单独抽一个文件：
   - run.mjs 用 JUDGE_SAMPLES 做「行为快照」比对；
   - capture-judge-baseline.mjs 用同一份样本重新冻结快照，
     两边必须完全一致，否则重冻出来的基线永远对不上；
   - run.mjs 的反灌水判据用 EXPLOIT_* 与 HONEST_SOLUTION。
   ========================================================= */

/* 8 份固定输入 × 3 道题 = 24 组快照（沿用重构时那批样本，便于对比历史） */
export const JUDGE_SAMPLES = [
  'int main(){int a;cin>>a;cout<<a<<endl;return 0;}',
  '#include <bits/stdc++.h>\nusing namespace std;\nint main(){ios::sync_with_stdio(false);cin.tie(0);' +
    'int n;cin>>n;vector<int> a(n);for(int i=0;i<n;i++)cin>>a[i];sort(a.begin(),a.end());' +
    'long long ans=0;for(int i=0;i<n;i++)ans+=a[i];cout<<ans<<endl;return 0;}',
  'int main(){ return 0; }',
  '// 只有注释\n/* 块注释 */\nint main(){ printf("hi"); return 0; }',
  'int main(){ string s="int main() { return 0; }"; cout<<s; }',
  'int main(){for(int i=0;i<10;i++){if(i%2)continue;while(0)break;}int x=0;x++;x--;return 0;}',
  'int main(){vector<int>v;map<int,int>m;set<int>s;queue<int>q;stack<int>st;' +
    'priority_queue<int>pq;sort(v.begin(),v.end());lower_bound(v.begin(),v.end(),1);return 0;}',
  'int gcd(int a,int b){return b?gcd(b,a%b):a;}int main(){int d=gcd(4,6);int e=abs(-1);' +
    'double f=sqrt(2.0);int g=pow(2,3);return 0;}'
];

export const JUDGE_IDS = ['P14962', 'P16184', 'P17434'];

/* ---------------------------------------------------------
   反灌水判据用的样本
   --------------------------------------------------------- */

const padLines = n => '\n' + Array.from({ length: n }, (_, i) => '// pad ' + i).join('\n');

/* 灌水：真正干活的只有第一行，剩下 150 行全是注释。
   旧版长度分数原始行数，这份代码能白拿满长度分。 */
export const COMMENT_PAD = 'int main(){int x;cin>>x;cout<<x;return 0;}' + padLines(150);

/* 关键词堆砌：一行里声明 19 个用不到的算法词标识符，再配 110 行注释 */
export const KEYWORD_SOUP =
  'int main(){int dp,dfs,bfs,lca,dijkstra,kruskal,dist,dep,fa,prefix,mod,INF,gcd,' +
  'sort,vector,map,set,queue;cin>>dp;cout<<dp;return 0;}' + padLines(110);

/* 认真解：读入 → 排序 → 线性扫描 → 输出。16 道题里通用的「像样代码」 */
export const HONEST_SOLUTION = `#include <bits/stdc++.h>
using namespace std;
int main(){
  ios::sync_with_stdio(false); cin.tie(0);
  int n; cin >> n;
  vector<long long> a(n);
  for (int i = 0; i < n; i++) cin >> a[i];
  sort(a.begin(), a.end());
  long long ans = 0, sum = 0;
  for (int i = 0; i < n; i++){
    sum += a[i];
    ans = max(ans, sum * (n - i));
  }
  cout << ans << endl;
  return 0;
}`;

/* 同一份认真解，只是后面挂了 150 行注释。
   「加注释不得改变基础分」是最锋利的那条判据：旧版长度分按原始行数算，
   这份样本的基础分会凭 150 行 `// pad` 直接涨 27 分（len 3.3 → 30）。 */
export const HONEST_PADDED = HONEST_SOLUTION + padLines(150);
