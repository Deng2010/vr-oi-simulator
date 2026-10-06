'use strict';
/* =========================================================
   全局关键字列表
   所有题目共用这一份，加题时不需要修改这里
   ========================================================= */

const KEYWORDS_LIST = [
  /* 基本类型 */
  'int', 'long', 'char', 'float', 'double', 'bool', 'void', 'auto',
  'const', 'unsigned',

  /* 控制流 */
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
  'continue', 'return', 'try', 'throw',

  /* 定义 / 命名空间 */
  'class', 'struct', 'enum', 'template', 'typename',
  'public', 'private', 'namespace', 'using', 'typedef',

  /* STL 容器 */
  'vector', 'map', 'set', 'queue', 'stack', 'deque',
  'pair', 'string', 'array',
  'unordered_map', 'unordered_set', 'priority_queue',

  /* STL 算法 / 操作 */
  'sort', 'reverse', 'unique', 'lower_bound', 'upper_bound',
  'push_back', 'emplace_back', 'begin', 'end', 'size',

  /* 输入输出 */
  'cin', 'cout', 'scanf', 'printf', 'endl', 'puts',
  'memset', 'sizeof',

  /* 数学 */
  'gcd', 'abs', 'sqrt', 'pow', 'min', 'max',

  /* 算法概念 */
  'dp', 'dfs', 'bfs', 'lca', 'dijkstra', 'kruskal',
  'dist', 'dep', 'fa', 'prefix', 'mod', 'INF'
];
