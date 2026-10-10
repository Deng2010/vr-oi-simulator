import { STARTER_TEMPLATE } from './template.js';

/* P16185 战术突破 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P16185.md?raw';

export default {
  id: 'P16185',
  name: '战术突破',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
