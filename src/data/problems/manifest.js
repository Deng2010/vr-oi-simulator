/* ---------------------------------------------------------
   题库清单（轻量，随主包一起加载）。
   只含列表页 / 计分 / 抽题 / 存档恢复需要的元数据；
   题面与起手代码在 src/data/problems/<id>.js 中按需懒加载。
   新增题目：把 .js 与 .md 放进本目录，并在此处补一行。

   keywords / hints 是**题目差异化评分**用的特征表（见 systems/scoring.js）：
   - keywords：该题正解里最可能出现的 C++ 词（词边界匹配），只从
     src/data/keywords.js 的全局词表里挑，避免出现评测器认不出的词；
   - hints：该题正解里极可能出现的代码片段（子串匹配），可以带符号。
   放在清单里而不是 <id>.js 里，是因为评测发生时题面往往还没懒加载
   （玩家可以不看题面直接写代码提交），而评测必须同步拿到这些特征。

   difficulty：1~4，**题号连续的 4 道题从前到后依次为 1~4**
   （洛谷的题号本身就是按场次成组出的：P14962~P14965 是一组，
   P15861~P15864 是一组，以此类推）。它只用于抽题后的排序
   （见 selection.js），**任何界面都不显示**；
   tests/run.mjs 有一条静态断言盯着界面层不许引用这个字段。
   --------------------------------------------------------- */
export const PROBLEM_MANIFEST = [
  { id: "P14962", name: "一次买够", max: 100, tl: "1.0s", ml: "256MB", difficulty: 1,
    keywords: ["priority_queue", "set", "sort", "vector", "while", "for", "long", "if"],
    hints: ["priority_queue", "sort(", "while(", "for(", "push_back"] },
  { id: "P14963", name: "何意味", max: 100, tl: "1.0s", ml: "256MB", difficulty: 2,
    keywords: ["mod", "unsigned", "long", "puts", "vector", "struct", "for", "if"],
    hints: ["puts(", "mod", "unsigned", "%", "for("] },
  { id: "P14964", name: "可比豆出道计划", max: 100, tl: "1.0s", ml: "256MB", difficulty: 3,
    keywords: ["dfs", "vector", "sort", "fa", "max", "for", "int", "dep"],
    hints: ["dfs(", "sort(", "vector<", "fa["] },
  { id: "P14965", name: "昔涟", max: 100, tl: "1.0s", ml: "256MB", difficulty: 4,
    keywords: ["dfs", "vector", "fa", "dep", "push_back", "long", "if", "for"],
    hints: ["dfs(", "push_back", "fa[", "dep[", "for("] },
  { id: "P15861", name: "A_Step_Back", max: 100, tl: "1.0s", ml: "256MB", difficulty: 1,
    keywords: ["long", "while", "for", "if", "sqrt", "vector"],
    hints: ["sqrt(", "while(", "long long", "printf"] },
  { id: "P15862", name: "回去！", max: 100, tl: "1.0s", ml: "256MB", difficulty: 2,
    keywords: ["mod", "long", "const", "vector", "for", "while", "if", "unsigned"],
    hints: ["mod", "%", "long long", "for(", "while("] },
  { id: "P15863", name: "wywmrfz", max: 100, tl: "1.0s", ml: "256MB", difficulty: 3,
    keywords: ["dp", "mod", "prefix", "for", "if", "vector", "long", "max"],
    hints: ["dp[", "mod", "%", "for(", "prefix"] },
  { id: "P15864", name: "阵列之弈", max: 100, tl: "1.0s", ml: "256MB", difficulty: 4,
    keywords: ["mod", "long", "for", "if", "vector", "const", "pow"],
    hints: ["mod", "%", "pow(", "for(", "long long"] },
  { id: "P16184", name: "数据交锋", max: 100, tl: "1.0s", ml: "256MB", difficulty: 1,
    keywords: ["mod", "long", "pow", "string", "char", "for", "if", "const"],
    hints: ["mod", "%", "string", "for(", "pow("] },
  { id: "P16185", name: "战术突破", max: 100, tl: "1.0s", ml: "256MB", difficulty: 2,
    keywords: ["dist", "long", "priority_queue", "vector", "gcd", "min", "if", "for"],
    hints: ["dist[", "priority_queue", "gcd(", "vector<", "while("] },
  { id: "P16186", name: "策定乾坤", max: 100, tl: "1.0s", ml: "256MB", difficulty: 3,
    keywords: ["mod", "long", "vector", "for", "if", "const", "pow"],
    hints: ["mod", "%", "for(", "long long", "vector<"] },
  { id: "P16187", name: "单挑风云", max: 100, tl: "1.0s", ml: "256MB", difficulty: 4,
    keywords: ["long", "for", "if", "vector", "max", "min", "array"],
    hints: ["for(", "if(", "max(", "min(", ">>"] },
  { id: "P17431", name: "紫金断局", max: 100, tl: "1.0s", ml: "256MB", difficulty: 1,
    keywords: ["dp", "long", "max", "prefix", "vector", "for", "if", "INF"],
    hints: ["dp[", "max(", "for(", "if(", "long long"] },
  { id: "P17432", name: "彼方的她", max: 100, tl: "1.0s", ml: "256MB", difficulty: 2,
    keywords: ["vector", "queue", "dist", "push_back", "bfs", "for", "if", "min"],
    hints: ["vector<", "queue<", "dist[", "push_back", "for("] },
  /* P17433 的题面是「多组数据 + 闭式公式」，正解里一定有多组数据处理：
     所以特征词只留 while/cout/long 这类**起手模板里不存在**的词。
     第一版档案误收了 int/cin（起手模板自带 cin.tie(0)），
     结果空模板白拿 40 分 —— 特征词太泛就等于没配。 */
  { id: "P17433", name: "卿即终解", max: 100, tl: "1.0s", ml: "256MB", difficulty: 3,
    keywords: ["while", "cout", "long", "cin", "for"],
    hints: ["while(", "cout<<", "cout <<", "long long"] },
  { id: "P17434", name: "星链光华", max: 100, tl: "1.0s", ml: "256MB", difficulty: 4,
    keywords: ["vector", "dfs", "fa", "dep", "lca", "long", "push_back", "max"],
    hints: ["dfs(", "fa[", "dep[", "vector<", "push_back"] }
];
