export const $ = selector => document.querySelector(selector);
export function el(tag, className, text) { const node = document.createElement(tag); if(className) node.className = className; if(text !== undefined) node.textContent = text; return node; }
export function button(label, onClick, className = 'text-button') { const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', onClick); return node; }
export function statusIndicator(status) {
  const color = Number.isInteger(status) ? ['red','yellow','green'][status] : undefined;
  const text = color ? ['Not Working','Needs Testing','Fully Working'][status] : 'Missing Info';
  const dot = el('span', 'emulator-status');
  dot.dataset.status = color || 'unknown';
  dot.tabIndex = 0;
  dot.setAttribute('role', 'img');
  dot.setAttribute('aria-label', text);
  const tooltip = el('span', 'status-tooltip', text);
  tooltip.setAttribute('popover', 'manual');
  tooltip.setAttribute('role', 'tooltip');
  dot.append(tooltip);
  let listeners;
  const hide = () => {
    tooltip.hidePopover();
    listeners?.abort();
  };
  const show = () => {
    if (tooltip.matches(':popover-open')) return;
    tooltip.showPopover();
    const rect = dot.getBoundingClientRect();
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
    tooltip.style.top = `${rect.top >= height + 12 ? rect.top - height - 8 : rect.bottom + 8}px`;
    listeners = new AbortController();
    const options = {capture:true, signal:listeners.signal};
    window.addEventListener('scroll', hide, options);
    window.addEventListener('resize', hide, options);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, options);
  };
  dot.addEventListener('pointerenter', show);
  dot.addEventListener('pointerleave', hide);
  dot.addEventListener('focus', show);
  dot.addEventListener('blur', hide);
  tooltip.addEventListener('toggle', () => {
    if (!tooltip.matches(':popover-open')) listeners?.abort();
  });
  return dot;
}
let toastTimer;
export function toast(message, error = false) { clearTimeout(toastTimer); const node = el('div', `toast${error ? ' error' : ''}`, message); $('#toasts').replaceChildren(node); toastTimer = setTimeout(() => node.remove(), 4200); }
export function showError(selector, message) { const node = $(selector); node.textContent = message || ''; node.hidden = !message; }
export function jsonViewer(value, title) {
  const source = value === undefined ? '// No entry' : JSON.stringify(value, null, 2);
  const wrapper = el('div', 'json-viewer'), bar = el('div', 'json-toolbar');
  const copy = button('Copy', async () => { try { await navigator.clipboard.writeText(source); copy.textContent = 'Copied ✓'; setTimeout(() => copy.textContent = 'Copy', 1800); } catch { toast('Copy is unavailable. Select the JSON text to copy it.', true); } });
  bar.append(el('span', '', title), copy); const pre = el('pre'); pre.tabIndex = 0; pre.setAttribute('aria-label', title); const code = el('code');
  const pattern = /"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    code.append(document.createTextNode(source.slice(last,match.index)));
    const type = match[0].startsWith('"') ? (match[0].endsWith(':') ? 'key' : 'string') : /^[-\d]/.test(match[0]) ? 'number' : 'literal';
    code.append(el('span', `token-${type}`, match[0])); last = match.index + match[0].length;
  }
  code.append(document.createTextNode(source.slice(last))); pre.append(code); wrapper.append(bar,pre); return wrapper;
}
export function diffView(before, after, title) { const section = el('section','diff-block'), grid = el('div','diff-grid'); section.append(el('h3','', title)); const left = el('div'), right = el('div'); left.append(el('span','diff-label before','− Original'),jsonViewer(before,'Before')); right.append(el('span','diff-label','+ Modified'),jsonViewer(after,'After')); grid.append(left,right); section.append(grid); return section; }
export function openPreview(title, children) { $('#preview-title').textContent = title; $('#preview-content').replaceChildren(...children); $('#preview-dialog').showModal(); }
export function setupDialogs() {
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
      if(event.key !== 'Tab') return;
      const focusable=[...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(node=>node.getClientRects().length && (node.tagName === 'SUMMARY' || !node.closest('details:not([open])')));
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey && document.activeElement === first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey && document.activeElement === last){event.preventDefault();first?.focus();}
    });
    dialog.addEventListener('click', event => { if(event.target === dialog) { const r = dialog.getBoundingClientRect(); if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  });
}
export function confirmAction(title, message, accept = 'Apply changes') {
  return new Promise(resolve => {
    const dialog = $('#confirm-dialog'); $('#confirm-title').textContent = title; $('#confirm-message').textContent = message; $('#accept-confirm').textContent = accept;
    let approved = false;
    const yes = () => { approved = true; dialog.close(); }, no = () => dialog.close();
    $('#accept-confirm').addEventListener('click',yes); $('#cancel-confirm').addEventListener('click',no);
    dialog.addEventListener('close', () => { $('#accept-confirm').removeEventListener('click',yes); $('#cancel-confirm').removeEventListener('click',no); resolve(approved); }, {once:true});
    dialog.showModal(); $('#cancel-confirm').focus();
  });
}
export function safeLink(label, href) {
  try { const url = new URL(href); if (!['https:', 'http:'].includes(url.protocol)) return null; const a = el('a','',label); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; } catch { return null; }
}
export function descriptionView(text) {
  const description = el('p', 'detail-description');
  let last = 0;
  for (const match of text.matchAll(/\bhttps?:\/\/[^\s<>"']+/gi)) {
    let href = match[0].replace(/[.,;:!?]+$/, '');
    // Leave sentence punctuation and unmatched closing brackets outside the link.
    while (/[)\]}]$/.test(href)) {
      const close = href.at(-1), open = {')':'(', ']':'[', '}':'{'}[close];
      if (href.split(close).length <= href.split(open).length) break;
      href = href.slice(0, -1).replace(/[.,;:!?]+$/, '');
    }
    description.append(document.createTextNode(text.slice(last, match.index)));
    description.append(safeLink(href, href) || document.createTextNode(href));
    last = match.index + href.length;
  }
  description.append(document.createTextNode(text.slice(last)));
  return description;
}
