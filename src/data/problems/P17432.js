import { STARTER_TEMPLATE } from './template.js';

/* P17432 彼方的她 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P17432.md?raw';

export default {
  id: 'P17432',
  name: '彼方的她',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
