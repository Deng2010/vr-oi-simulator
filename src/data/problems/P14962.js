import { STARTER_TEMPLATE } from './template.js';

/* P14962 一次买够 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P14962.md?raw';

export default {
  id: 'P14962',
  name: '一次买够',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
