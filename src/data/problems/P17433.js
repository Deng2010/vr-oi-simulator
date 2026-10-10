import { STARTER_TEMPLATE } from './template.js';

/* P17433 卿即终解 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P17433.md?raw';

export default {
  id: 'P17433',
  name: '卿即终解',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
