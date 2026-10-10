/* =========================================================
   代码编辑器：题面渲染、语法高亮、自动保存
   由 index.html 内联脚本第 2228-2352 行拆出。
   ========================================================= */
import { state } from '../core/state.js';
import { $ } from '../core/util.js';
import { loadProblemData } from '../data/problems/index.js';
import { scheduleAutoSave } from '../systems/save.js';
import { codeArea, verdictEl } from './dom.js';

export function renderProblemList(){
  const list = $('problemList');
  list.innerHTML = '';
  state.problems.forEach(p => {
    const sc = state.score[p.id] || 0;
    const div = document.createElement('div');
    div.className = 'pitem' + (p.id === state.curProb ? ' active' : '') + (sc >= p.max ? ' ac' : '');
    div.innerHTML = `<div class="pn"><span>${p.id} ${p.name}</span></div>
                     <div class="pn" style="margin-top:4px">
                       <span style="font-size:11px;opacity:.6">${p.max} 分</span>
                       <span class="sc">${sc}</span>
                     </div>`;
    div.onclick = () => {
      saveCode();
      state.curProb = p.id;
      renderProblemList();
      loadProblem(p.id);
    };
    list.appendChild(div);
  });
}

function problemPaneHtml(p, body){
  return `
    <h3>${p.id} · ${p.name}</h3>
    <div class="meta">时间限制 ${p.tl} &nbsp;|&nbsp; 内存限制 ${p.ml} &nbsp;|&nbsp; 满分 ${p.max}</div>
    <pre>${body}</pre>`;
}

/* 题面正文按需加载：先用清单中的元数据占位，再异步补齐 Markdown 正文。
   一局只抽 4 道题，因此打开电脑最多下载 4 份题面，
   而不是把全部 16 道题的题面都塞进首包。 */
export async function loadProblem(id){
  const meta = state.problems.find(x => x.id === id);
  if (!meta) return;

  $('problemPane').innerHTML = problemPaneHtml(meta, '题面载入中…');

  let p;
  try {
    p = await loadProblemData(id);
  } catch (e){
    console.error(e);
    $('problemPane').innerHTML = problemPaneHtml(meta, '题面加载失败，请检查网络后重试。');
    return;
  }
  if (state.curProb !== id) return;      /* 加载期间切了题，丢弃这次结果 */

  if (state.code[id] === undefined) state.code[id] = p.starter;
  $('problemPane').innerHTML = problemPaneHtml(p, p.desc.replace(/</g, '&lt;'));
  codeArea.value = state.code[id];
  $('fileName').textContent = p.id + '.cpp';
  verdictEl.classList.add('hidden');
  scheduleHighlight();
}

export function saveCode(){
  state.code[state.curProb] = codeArea.value;
  scheduleAutoSave();
}

/* =========================================================
   语法高亮
   ========================================================= */

export const codeHighlight = $('codeHighlight');

export const HL_KEYWORDS = new Set([
  'int','long','short','char','float','double','void','bool','auto','signed','unsigned',
  'if','else','for','while','do','switch','case','default','break','continue','return','goto',
  'using','namespace','include','define','typedef','struct','class','union','enum',
  'public','private','protected','virtual','override','static','inline','const','constexpr',
  'new','delete','template','typename','try','catch','throw','sizeof','true','false','nullptr',
  'vector','pair','map','set','queue','stack','deque','string','priority_queue',
  'std','cout','cin','endl','sort','swap','min','max','push_back','pop_back','begin','end',
  'scanf','printf','puts','putchar','getchar'
]);

/* 占位符 & 正则提到模块级，避免每次高亮都重新构造 */

export const HL_TOK = '\x00T';

export const HL_TOK_RE = /\x00T(\d+)\x00/g;

/* 节流：连续输入时最多每 50ms 重建一次高亮 DOM */

export let hlPending = false;

export let hlLastRun = 0;

export function scheduleHighlight(){
  if (hlPending) return;
  hlPending = true;
  const now = performance.now();
  const delay = Math.max(0, 50 - (now - hlLastRun));
  setTimeout(() => {
    hlPending = false;
    hlLastRun = performance.now();
    codeHighlight.innerHTML = hlRender(codeArea.value) + '\n';
    codeHighlight.scrollTop = codeArea.scrollTop;
    codeHighlight.scrollLeft = codeArea.scrollLeft;
  }, delay);
}

export function hlEscape(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function hlRender(code){
  const tokens = [];
  const TOK = HL_TOK;
  let s = code;

  s = s.replace(/\/\*[\s\S]*?\*\//g, m => {
    tokens.push(`<span class="tok-c">${hlEscape(m)}</span>`);
    return TOK + (tokens.length - 1) + '\x00';
  });
  s = s.replace(/\/\/[^\n]*/g, m => {
    tokens.push(`<span class="tok-c">${hlEscape(m)}</span>`);
    return TOK + (tokens.length - 1) + '\x00';
  });
  s = s.replace(/"(?:[^"\\\n]|\\.)*"/g, m => {
    tokens.push(`<span class="tok-s">${hlEscape(m)}</span>`);
    return TOK + (tokens.length - 1) + '\x00';
  });
  s = s.replace(/'(?:[^'\\\n]|\\.)*'/g, m => {
    tokens.push(`<span class="tok-s">${hlEscape(m)}</span>`);
    return TOK + (tokens.length - 1) + '\x00';
  });
  s = s.replace(/^(\s*#\s*\w+)/gm, m => {
    tokens.push(`<span class="tok-p">${hlEscape(m)}</span>`);
    return TOK + (tokens.length - 1) + '\x00';
  });

  s = hlEscape(s);

  /* 先做关键字替换，再做数字替换：
     否则第 2 步插入的 `<span class="tok-n">` 里的 class
     会被第 3 步的关键字规则再次包一层，破坏 HTML */
  s = s.replace(/\b([A-Za-z_]\w*)\b/g, m => {
    if (HL_KEYWORDS.has(m)) return `<span class="tok-k">${m}</span>`;
    return m;
  });
  s = s.replace(/\b(0x[0-9a-fA-F]+|\d+\.?\d*[fFlL]?)\b/g, '<span class="tok-n">$1</span>');

  s = s.replace(HL_TOK_RE, (_,i) => tokens[+i]);
  return s;
}
