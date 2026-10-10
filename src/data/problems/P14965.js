import { STARTER_TEMPLATE } from './template.js';

/* P14965 昔涟 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P14965.md?raw';

export default {
  id: 'P14965',
  name: '昔涟',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
