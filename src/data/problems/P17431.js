import { STARTER_TEMPLATE } from './template.js';

/* P17431 紫金断局 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P17431.md?raw';

export default {
  id: 'P17431',
  name: '紫金断局',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
