import { STARTER_TEMPLATE } from './template.js';

/* P15864 阵列之弈 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P15864.md?raw';

export default {
  id: 'P15864',
  name: '阵列之弈',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
