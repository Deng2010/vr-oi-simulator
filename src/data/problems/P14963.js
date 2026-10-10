import { STARTER_TEMPLATE } from './template.js';

/* P14963 何意味 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P14963.md?raw';

export default {
  id: 'P14963',
  name: '何意味',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
