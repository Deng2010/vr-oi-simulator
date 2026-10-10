import { STARTER_TEMPLATE } from './template.js';

/* P15861 A_Step_Back 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P15861.md?raw';

export default {
  id: 'P15861',
  name: 'A_Step_Back',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
