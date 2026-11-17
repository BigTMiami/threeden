// @ts-check
/**
 * auto-grow.js — a text box that starts short, grows with what's written up
 * to `max` pixels, then scrolls (the New post box, editing a post).
 *
 *   autoGrow(textarea, { max = 240 })   → call fit() after setting .value in code
 */

/** @param {HTMLTextAreaElement} textarea */
export function autoGrow(textarea, { max = 240 } = {}) {
  const fit = () => {
    textarea.style.height = 'auto';
    const full = textarea.scrollHeight + 2;
    textarea.style.height = `${Math.min(full, max)}px`;
    textarea.style.overflowY = full > max ? 'auto' : 'hidden';
  };
  textarea.classList.add('is-auto-grow');
  textarea.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return { fit };
}
