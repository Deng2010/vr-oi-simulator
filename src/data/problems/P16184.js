import { STARTER_TEMPLATE } from './template.js';

/* P16184 数据交锋 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P16184.md?raw';

export default {
  id: 'P16184',
  name: '数据交锋',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
