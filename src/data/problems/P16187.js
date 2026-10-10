import { STARTER_TEMPLATE } from './template.js';

/* P16187 单挑风云 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P16187.md?raw';

export default {
  id: 'P16187',
  name: '单挑风云',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
