let observerInstalled = false;

function enhanceActionMenuSelects(root = document) {
  root.querySelectorAll?.('.actions-menu-dropdown select.cl-tb-select').forEach(enhanceSelect);
}

function installObserver() {
  if (observerInstalled || !document.body) return;
  observerInstalled = true;
  enhanceActionMenuSelects();
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches?.('.actions-menu-dropdown select.cl-tb-select')) enhanceSelect(node);
    enhanceActionMenuSelects(node);
  }))).observe(document.body, { childList: true, subtree: true });
}

export function enhanceSelect(select) {
  if (!select || select.dataset.premiumSelect === 'true') return;
  installObserver();
  select.dataset.premiumSelect = 'true';
  const wrap = document.createElement('div');
  wrap.className = 'premium-select';
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'premium-select__trigger';
  const menu = document.createElement('div');
  menu.className = 'premium-select__menu'; menu.setAttribute('role', 'listbox');
  const searchable = select.dataset.premiumSearch === 'true';
  const search = searchable ? document.createElement('input') : null;
  if (search) {
    search.type = 'search';
    search.className = 'premium-select__search';
    search.placeholder = select.dataset.premiumSearchPlaceholder || 'Buscar...';
    search.setAttribute('aria-label', `Buscar ${select.getAttribute('aria-label') || 'opção'}`);
  }
  const renderOptions = (query = '') => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    const options = [...select.options].filter(option => !normalizedQuery || option.text.toLocaleLowerCase('pt-BR').includes(normalizedQuery));
    const items = options.map(option => {
      const item = document.createElement('button');
      item.type = 'button'; item.className = 'premium-select__option'; item.textContent = option.text;
      item.classList.toggle('is-selected', option.selected);
      item.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        if (search) search.value = '';
        wrap.classList.remove('is-open');
        sync();
      });
      return item;
    });
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'premium-select__empty';
      empty.textContent = 'Nenhuma opção encontrada.';
      items.push(empty);
    }
    menu.replaceChildren(...(search ? [search] : []), ...items);
  };
  const sync = () => { trigger.textContent = select.options[select.selectedIndex]?.text || 'Selecionar'; renderOptions(search?.value || ''); };
  select.parentNode.insertBefore(wrap, select); wrap.append(trigger, menu, select); select.classList.add('premium-select__native'); sync();
  trigger.addEventListener('click', () => {
    const willOpen = !wrap.classList.contains('is-open');
    document.querySelectorAll('.premium-select.is-open').forEach(el => el !== wrap && el.classList.remove('is-open'));
    wrap.classList.toggle('is-open');
    if (willOpen && search) requestAnimationFrame(() => search.focus());
  });
  search?.addEventListener('input', () => renderOptions(search.value));
  select.addEventListener('change', sync);
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, characterData: true });
  document.addEventListener('click', event => { if (!wrap.contains(event.target)) wrap.classList.remove('is-open'); });
}
