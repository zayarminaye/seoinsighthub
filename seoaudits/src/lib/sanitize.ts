import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import type { WindowLike } from 'dompurify';

const window = new JSDOM('').window;
const purify = DOMPurify(window as unknown as WindowLike);

const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'code', 'br', 'span'];

export function sanitizeHtml(dirty: string): string {
  return purify.sanitize(dirty, { ALLOWED_TAGS });
}
