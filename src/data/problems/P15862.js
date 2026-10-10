import { STARTER_TEMPLATE } from './template.js';

/* P15862 回去！ 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P15862.md?raw';

export default {
  id: 'P15862',
  name: '回去！',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
