/* =========================================================
   在 Node 中以「经典脚本」语义加载全局脚本 / 从 git 历史取旧文件。
   仅供测试与一次性迁移工具使用：
   把重构前的单文件实现加载进来做行为对照。
   const/let 顶格声明进入全局词法环境而非 globalThis，
   因此求值必须发生在同一个 vm context 内。
   ========================================================= */
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

export function makeLegacyContext(sources){
  const ctx = vm.createContext({ console, performance });
  for (const { name, code } of sources){
    vm.runInContext(code, ctx, { filename: name });
  }
  return ctx;
}

export function evalIn(ctx, code){
  return vm.runInContext(code, ctx);
}

/* 从指定 git 版本取出重构前的全局脚本 */
export function legacySourcesFromGit(rev, root, files = ['keywords.js', 'judge.js', 'npc-gen.js', 'problems.js']){
  return files.map(f => ({
    name: f,
    code: execFileSync('git', ['show', `${rev}:${f}`], { cwd: root, encoding: 'utf8' })
  }));
}
