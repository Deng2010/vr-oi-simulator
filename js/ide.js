'use strict';
/* =========================================================
   ide —— IDE 面板 / 语法高亮 / 提交评测
   （自 index.html 内联脚本拆出）
   ========================================================= */
/* =========================================================
   面板管理
   ========================================================= */
function openPauseMenu(){
  if (state.view !== 'world' || !state.started || state.ended || state.frozen) return;
  state.view = 'pause';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  releaseLock();
  pauseMenu.classList.remove('hidden');
  syncViewUI();
}
function closePauseMenu(){
  pauseMenu.classList.add('hidden');
  state.view = 'world';
  crosshair.classList.remove('hidden');
  requestLock();
}
function openCode(){
  state.view = 'code';
  crosshair.classList.add('hidden');
  promptEl.classList.add('hidden');
  releaseLock();
  codeUI.classList.remove('hidden');
  verdictEl.classList.add('hidden');
  renderProblemList();
  loadProblem(state.curProb);
  setTimeout(() => codeArea.focus(), 60);
}
function closeCode(){
  state.view = 'world';
  codeUI.classList.add('hidden');
  crosshair.classList.remove('hidden');
  requestLock();
}
function renderProblemList(){
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
      loadProblem(p.id);
      renderProblemList();
    };
    list.appendChild(div);
  });
}
function loadProblem(id){
  const p = state.problems.find(x => x.id === id);
  if (!p) return;
  if (state.code[id] === undefined) state.code[id] = p.starter;
  $('problemPane').innerHTML = `
    <h3>${p.id} · ${p.name}</h3>
    <div class="meta">时间限制 ${p.tl} &nbsp;|&nbsp; 内存限制 ${p.ml} &nbsp;|&nbsp; 满分 ${p.max}</div>
    <pre>${p.desc.replace(/</g, '&lt;')}</pre>`;
  codeArea.value = state.code[id];
  $('fileName').textContent = p.id + '.cpp';
  verdictEl.classList.add('hidden');
  scheduleHighlight();
}
function saveCode(){
  state.code[state.curProb] = codeArea.value;
  scheduleAutoSave();
}

/* =========================================================
   语法高亮
   ========================================================= */
const codeHighlight = $('codeHighlight');

const HL_KEYWORDS = new Set([
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
const HL_TOK = '\x00T';
const HL_TOK_RE = /\x00T(\d+)\x00/g;

/* 节流：连续输入时最多每 50ms 重建一次高亮 DOM */
let hlPending = false;
let hlLastRun = 0;
function scheduleHighlight(){
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

function hlEscape(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function hlRender(code){
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


/* =========================================================
   评测器（确定性）
   ========================================================= */
function judgeCode(code, prob){
  return judgeUnified(code, prob, KEYWORDS_LIST);
}

function submitCode(){
  saveCode();
  const prob = state.problems.find(x => x.id === state.curProb);
  const code = state.code[state.curProb];

  const badWord = containsBannedWord(code);
  if (badWord){
    showBannedWordDialog(badWord);
    return;
  }

  const btn = $('btnSubmit');
  btn.disabled = true;

  verdictEl.classList.remove('hidden');
  verdictEl.innerHTML = `
    <h4>评测中… <span style="color:#5b8cff">${prob.id}</span></h4>
    <div class="judging">正在编译 & 运行测试数据…</div>
    <div class="barwrap"><i id="jbar"></i></div>
  `;
  audio.beep(680, 0.06, 0.04);

  let prog = 0;
  const iv = setInterval(() => {
    prog += 7 + Math.random() * 12;
    const bar = $('jbar');
    if (bar) bar.style.width = Math.min(100, prog) + '%';
    if (prog >= 100){
      clearInterval(iv);
      const res = judgeCode(code, prob);
      state.score[prob.id] = Math.max(state.score[prob.id] || 0, res.score);
      state.submitCount[prob.id] = (state.submitCount[prob.id] || 0) + 1;
      recalcScore();
      renderVerdict(prob, res);
      renderProblemList();
      /* 桌面显示器贴图重绘合并到一次调度里 */
      scheduleDeskScreensUpdate();
      btn.disabled = false;
      if (res.score >= prob.max){
        audio.beep(880, 0.15, 0.05);
        unlockAch('first_ac');
        if (state.problems.every(p => (state.score[p.id] || 0) >= p.max)) unlockAch('full_score');
      } else if (res.score > 0) audio.beep(560, 0.15, 0.045);
      else audio.beep(220, 0.25, 0.05);
    }
  }, 130);
}

function renderVerdict(prob, res){
  const statusText = res.status === 'AC' ? 'Accepted' :
                     res.status === 'CE' ? 'Compile Error' :
                     res.status === 'PART' ? 'Partial' : 'Wrong Answer';
  const color = res.status === 'AC' ? '#38d39f' :
                res.status === 'CE' ? '#8b95a9' :
                res.status === 'PART' ? '#ffcc57' : '#ff5f6d';
  verdictEl.innerHTML = `
    <h4>${prob.id} 评测结果 <span style="color:${color}">${res.score} 分</span></h4>
    <div style="color:${color};font-size:12px;margin-bottom:12px;font-family:monospace">${statusText}</div>
    <div class="cases">${res.cases.map(c =>
      `<div class="case ${c.status}">#${c.id}<br>${c.status}</div>`).join('')}</div>
    <div style="margin-top:12px;font-size:11px;color:#5d6880">
      ${res.status === 'CE' ? '提示：代码中未找到 main 函数或代码过短。' : ''}
      ${res.status !== 'AC' && res.status !== 'CE' ? '提示：检查算法复杂度与边界情况。' : ''}
      ${res.status === 'AC' ? '\u{1F389} 恭喜！这道题你拿到了满分。' : ''}
    </div>`;
}

let lastHudProbsKey = '';
function recalcScore(){
  let total = 0;
  state.problems.forEach(p => { total += (state.score[p.id] || 0); });
  state.totalScore = total;
  renderHudProbs();
}
function renderHudProbs(){
  const key = state.problems.map(p => p.id + '|' + (state.score[p.id] || 0)).join(',');
  if (key === lastHudProbsKey) return;
  lastHudProbsKey = key;
  hudProbs.innerHTML = state.problems.map(p => {
    const sc = state.score[p.id] || 0;
    return `<div class="row ${sc >= p.max ? 'ac' : ''}">
              <span>${p.id} ${p.name}</span><b>${sc}</b>
            </div>`;
  }).join('');
}
