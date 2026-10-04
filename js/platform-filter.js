// A bounded, browser-independent select. The popover escapes workspace clipping.
export function createPlatformFilter(root, onChange) {
  const trigger = root.querySelector('button');
  const label = root.querySelector('.platform-label');
  const menu = root.querySelector('[role="listbox"]');
  let options = [], selected = 'all', active = 0, prefix = '', prefixTimer;
  const isOpen = () => menu.matches(':popover-open');

  function position() {
    const rect = trigger.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 16, above = rect.top - 16;
    const upwards = below < 200 && above > below;
    const height = Math.max(0, Math.min(320, upwards ? above : below));
    const width = Math.min(Math.max(rect.width, 280), innerWidth - 24);
    menu.style.width = width + 'px';
    menu.style.maxHeight = height + 'px';
    menu.style.left = Math.max(12, Math.min(rect.right - width, innerWidth - width - 12)) + 'px';
    menu.style.top = (upwards ? rect.top - menu.offsetHeight - 6 : rect.bottom + 6) + 'px';
  }
  function highlight(index, scroll = true) {
    active = Math.max(0, Math.min(index, options.length - 1));
    [...menu.children].forEach((node, i) => node.classList.toggle('is-active', i === active));
    const node = menu.children[active];
    if (!node) return;
    trigger.setAttribute('aria-activedescendant', node.id);
    if (scroll) node.scrollIntoView({block:'nearest'});
  }
  function close() { if (isOpen()) menu.hidePopover(); }
  function open() {
    if (!options.length || isOpen()) return;
    menu.showPopover();
    trigger.setAttribute('aria-expanded','true');
    position();
    highlight(options.findIndex(option => option.value === selected));
  }
  function updateSelection() {
    label.textContent = options.find(option => option.value === selected)?.label || 'All consoles';
    trigger.classList.toggle('has-selection', selected !== 'all');
    [...menu.children].forEach((node, i) => node.setAttribute('aria-selected', String(options[i].value === selected)));
  }
  function choose(index) {
    if (!options[index]) return;
    const changed = selected !== options[index].value;
    selected = options[index].value;
    updateSelection(); close();
    trigger.focus({preventScroll:true});
    if (changed) onChange(selected);
  }
  trigger.addEventListener('click', () => isOpen() ? close() : open());
  trigger.addEventListener('keydown', event => {
    if (['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Escape') { close(); return; }
      if (!isOpen()) { open(); if (event.key === 'End') highlight(options.length - 1); if (event.key === 'Home') highlight(0); return; }
      if (event.key === 'Enter' || event.key === ' ') choose(active);
      else if (event.key === 'Home') highlight(0);
      else if (event.key === 'End') highlight(options.length - 1);
      else highlight(active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Tab') {
      if (isOpen()) choose(active);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); open();
      clearTimeout(prefixTimer); prefix += event.key.toLowerCase();
      const index = options.findIndex(option => option.label.toLowerCase().startsWith(prefix));
      if (index >= 0) highlight(index);
      prefixTimer = setTimeout(() => prefix = '', 700);
    }
  });
  menu.addEventListener('beforetoggle', event => {
    if (event.newState === 'closed') {
      trigger.setAttribute('aria-expanded','false');
      trigger.removeAttribute('aria-activedescendant');
      prefix = ''; clearTimeout(prefixTimer);
    }
  });
  window.addEventListener('resize', () => { if (isOpen()) position(); });
  document.addEventListener('scroll', event => {
    if (isOpen() && !menu.contains(event.target)) position();
  }, true);
  return {
    setOptions(items, value = 'all') {
      close(); options = items; selected = value;
      menu.replaceChildren(...items.map((item, index) => {
        const node = document.createElement('div');
        node.id = 'platform-option-' + index;
        node.className = 'platform-option'; node.dataset.value = item.value;
        node.setAttribute('role','option'); node.textContent = item.label; node.title = item.label;
        node.addEventListener('pointermove', () => highlight(index, false));
        node.addEventListener('pointerdown', event => event.preventDefault());
        node.addEventListener('click', () => choose(index));
        return node;
      }));
      updateSelection();
    }
  };
}
