export const $ = selector => document.querySelector(selector);
export function el(tag, className, text) { const node = document.createElement(tag); if(className) node.className = className; if(text !== undefined) node.textContent = text; return node; }
export function button(label, onClick, className = 'text-button') { const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', onClick); return node; }
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
  try { const url = new URL(href); if (url.protocol !== 'https:') return null; const a = el('a','',label); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; } catch { return null; }
}
