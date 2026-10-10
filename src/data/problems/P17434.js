import { STARTER_TEMPLATE } from './template.js';

/* P17434 星链光华 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P17434.md?raw';

export default {
  id: 'P17434',
  name: '星链光华',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
