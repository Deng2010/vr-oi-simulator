import { STARTER_TEMPLATE } from './template.js';

/* P16186 策定乾坤 的题面正文（Markdown，构建时内联，不额外发请求） */
import desc from './P16186.md?raw';

export default {
  id: 'P16186',
  name: '策定乾坤',
  max: 100,
  tl: '1.0s',
  ml: '256MB',
  starter: STARTER_TEMPLATE,
  desc,
};
