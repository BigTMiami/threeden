// @ts-check
/**
 * sanitize.js — clean up HTML before showing it on the page.
 *
 * The shared note stores rich text as HTML. Pasted content can carry things
 * we never want to run (scripts, inline event handlers like onerror=...), so
 * we keep only a short list of formatting tags and drop every attribute
 * except:
 *   - safe links (http, https, mailto)
 *   - @mention chips (`<span class="mention" data-username="anna" contenteditable="false">`)
 *   - text alignment on blocks (`style="text-align: center"`)
 *   - checklists (`<ul class="checklist">`, `<li data-checked="true">`)
 *   - photos and videos added in the editor: `<figure class="rt-media">`
 *     holding an `<img>` or a `<video controls>` whose src is a data: URL
 *     of a picture or a video (nothing loaded from elsewhere)
 *
 * This is a simple allow-list for a prototype. A production app should use
 * a well-tested library such as DOMPurify.
 */

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'DIV', 'SPAN', 'H2', 'H3', 'H4',
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'MARK', 'CODE', 'SUB', 'SUP',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR', 'A',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
  'FIGURE', 'IMG', 'VIDEO',
]);

const IMAGE_SRC = /^data:image\/(png|jpe?g|gif|webp);base64,/i;
const VIDEO_SRC = /^data:video\/[a-z0-9.+-]+;base64,/i;

/** Blocks that may keep a text-align style. */
const ALIGNABLE = new Set(['P', 'DIV', 'H2', 'H3', 'H4', 'LI', 'BLOCKQUOTE', 'TD', 'TH']);
const ALIGN_STYLE = /^\s*text-align:\s*(left|center|right|justify);?\s*$/i;

/** A mention chip keeps exactly these (and its data-username). */
const MENTION_ATTRIBUTES = { class: 'mention', contenteditable: 'false' };
const USERNAME = /^[a-z0-9_.]{3,20}$/;

export function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  cleanNode(template.content);
  return template.innerHTML;
}

function cleanNode(parent) {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Keep the text inside unknown tags, but drop the tag itself.
      // Scripts and styles are removed entirely, contents and all.
      if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') {
        child.remove();
      } else {
        cleanNode(child);
        child.replaceWith(...child.childNodes);
      }
      continue;
    }

    const isMention = child.tagName === 'SPAN' && USERNAME.test(child.getAttribute('data-username') ?? '');
    for (const attribute of [...child.attributes]) {
      const { name, value } = attribute;
      const keep = (child.tagName === 'A' && name === 'href' && /^(https?:\/\/|mailto:)/i.test(value))
        || (isMention && (MENTION_ATTRIBUTES[name] === value || name === 'data-username'))
        || (name === 'style' && ALIGNABLE.has(child.tagName) && ALIGN_STYLE.test(value))
        || (child.tagName === 'UL' && name === 'class' && value === 'checklist')
        || (child.tagName === 'LI' && name === 'data-checked' && value === 'true')
        || (child.tagName === 'FIGURE' && name === 'class' && value === 'rt-media')
        || (child.tagName === 'IMG' && ((name === 'src' && IMAGE_SRC.test(value)) || name === 'alt'))
        || (child.tagName === 'VIDEO' && ((name === 'src' && VIDEO_SRC.test(value)) || name === 'controls' || name === 'preload'));
      if (!keep) child.removeAttribute(name);
    }
    // A picture or video without a safe source is dropped.
    if ((child.tagName === 'IMG' || child.tagName === 'VIDEO') && !child.hasAttribute('src')) { child.remove(); continue; }
    if (child.tagName === 'VIDEO') child.setAttribute('controls', '');
    cleanNode(child);
  }
}
