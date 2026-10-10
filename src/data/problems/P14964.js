import { STARTER_TEMPLATE } from './template.js';

/* P14964 可比豆出道计划 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P14964.md?raw';

export default {
  id: 'P14964',
  name: '可比豆出道计划',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
