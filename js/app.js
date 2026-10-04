import {SETTINGS} from './settings.js';
import {readConfig} from './config-loader.js';
import {saveSession, restoreSession} from './session.js';
import {loadEmulators, isConsoleEntry} from './emulator-loader.js';
import {consoleKey} from './config-validator.js';
import {loadConsoles} from './console-loader.js';
import {createPlatformFilter} from './platform-filter.js';
import {clone, equal, planChange, planRemoval, planConsoleChange, planConsoleRemoval, applyPlan, rebuild, changesBetween} from './config-merger.js';
import {downloadJSON} from './download.js';
import {$, el, button, toast, showError, jsonViewer, diffView, openPreview, setupDialogs, confirmAction, safeLink, descriptionView} from './ui.js';

const state = {
  file:null, original:null, modified:null,
  definitions:[], consoleDefinitions:[], actions:[], changes:[], search:'', platform:'all', loading:false, libraryLoading:true
};
let detailReturnFocus;
const platformFilter = createPlatformFilter($('#platform-filter'), value => {
  state.platform = value;
  persistSession();
  renderLists();
  $('#database-list').scrollTop = 0;
  $('#config-list').scrollTop = 0;
});
setupDialogs();
$('#detail-dialog').addEventListener('close',() => {
  if (!detailReturnFocus) return;
  const {side,shortName,id,header} = detailReturnFocus;
  const panel = $('#' + side + '-list');
  const row = header ? panel.querySelector('[data-console-header="' + CSS.escape(consoleKey(shortName)) + '"]') : panel.querySelector('[data-console="' + CSS.escape(shortName) + '"][data-emulator-id="' + CSS.escape(id) + '"]');
  (row?.querySelector('.info') || panel).focus({preventScroll:true});
});
document.querySelectorAll('[data-brand]').forEach(node => node.textContent = SETTINGS.name);
document.title = SETTINGS.name;
let repository = SETTINGS.repositoryUrl;
if (!repository && location.hostname.endsWith('.github.io')) {
  const owner = location.hostname.split('.')[0];
  const repo = location.pathname.split('/').filter(Boolean)[0] || owner + '.github.io';
  repository = 'https://github.com/' + owner + '/' + repo;
}
const repoLink = safeLink('GitHub', repository);
if (repoLink) $('[data-repository]').href = repoLink.href;

function pickFile() {
  if (state.loading) return;
  $('#file-input').click();
}
$('#upload-zone').addEventListener('click', () => pickFile());
$('#replace-file').addEventListener('click', () => pickFile());
$('#file-input').addEventListener('change', async event => {
  const files = [...event.target.files];
  event.target.value = '';
  await loadFile(files);
});

let dragDepth = 0;
const dropzone = $('#upload-zone');
dropzone.addEventListener('dragenter', event => {
  event.preventDefault(); dragDepth++; dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragover', event => event.preventDefault());
dropzone.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) dropzone.classList.remove('drag-over');
});
dropzone.addEventListener('drop', event => {
  event.preventDefault(); dragDepth = 0; dropzone.classList.remove('drag-over');
  loadFile([...event.dataTransfer.files]);
});
for (const type of ['dragover','drop']) window.addEventListener(type, event => {
  if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
});

async function loadFile(files) {
  if (!files.length || state.loading) return;
  state.loading = true;
  renderUpload();
  showError('#file-error', '');
  showError('#workspace-error', '');
  try {
    if (files.length !== 1) throw new Error('Choose one JSON configuration file.');
    const file = await readConfig(files[0]);
    if (state.changes.length && !await confirmAction('Replace file?', 'Your pending changes will be cleared.', 'Replace')) return;
    state.file = file;
    state.actions = [];
    state.changes = [];
    state.original = clone(file.data);
    state.modified = clone(state.original);
    state.platform = 'all';
    state.search = '';
    $('#search').value = '';
    persistSession();
    renderPlatforms();
    if (state.original) {
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
      requestAnimationFrame(() => $('#search').focus({preventScroll:true}));
    }
  } catch (error) {
    showError(state.original ? '#workspace-error' : '#file-error', error.message);
  } finally {
    state.loading = false;
    render();
  }
}

function renderUpload() {
  const loaded = !!state.original;
  $('#upload-screen').hidden = loaded;
  $('#workspace').hidden = !loaded;
  $('#upload-zone').disabled = state.loading;
  $('#replace-file').disabled = state.loading;
  $('#upload-heading').textContent = state.loading ? 'Reading file…' : 'Upload file';

}

function availableConsoles() {
  const consoles = new Map((state.modified?.consoles || []).map(c => [consoleKey(c.shortName),c]));
  for (const definition of state.consoleDefinitions) {
    const entry = definition.console;
    if (!consoles.has(consoleKey(entry.shortName))) consoles.set(consoleKey(entry.shortName), {...entry,emulators:[]});
  }
  return [...consoles.values()];
}
function renderPlatforms() {
  const options = availableConsoles()
    .sort((a,b) => a.longName.localeCompare(b.longName))
    .map(c => ({value:c.shortName, label:c.longName}));
  if (state.platform !== 'all') state.platform = options.find(option => consoleKey(option.value) === consoleKey(state.platform))?.value || (state.libraryLoading ? state.platform : 'all');
  platformFilter.setOptions([{value:'all',label:'All consoles'}, ...options],state.platform);
}
function matches(consoleEntry, emulator) {
  return (state.platform === 'all' || state.platform === consoleEntry.shortName) &&
    (consoleEntry.longName + ' ' + consoleEntry.shortName + ' ' + emulator.name + ' ' + emulator.id).toLowerCase().includes(state.search);
}
function findDefinition(shortName, id) {
  return state.definitions.find(d => d.entries.some(m => consoleKey(m.shortName) === consoleKey(shortName) &&
    (isConsoleEntry(m) ? m.emulators : [m.emulator]).some(e => e.id.toLowerCase() === id.toLowerCase())));
}
function rowControl(symbol, label, callback, className) {
  const control = button('', callback, 'row-button ' + className);
  const paths = {
    '+': 'M12 5v14M5 12h14',
    '−': 'M5 12h14',
    '✓': 'M5 12l4 5L19 7',
    'i': 'M12 11v7M12 6h.01'
  };
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', paths[symbol]);
  icon.append(path);
  control.append(icon);
  control.setAttribute('aria-label',label); control.title = label;
  return control;
}
function renderRow(consoleEntry, emulator, definition, isDatabase) {
  const row = el('div','emulator-row');
  row.dataset.console = consoleEntry.shortName;
  row.dataset.emulatorId = emulator.id;
  const label = el('div','row-label',emulator.name);
  const controls = el('div','row-controls');
  if (isDatabase) {
    const status = definition?.status;
    const color = Number.isInteger(status) ? ['red','yellow','green'][status] : undefined;
    const dot = el('span', 'emulator-status');
    dot.dataset.status = color || 'unknown';
    dot.title = color ? ['Not Working','Needs Testing','Fully Working'][status] : 'Missing Info';
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', dot.title);
    label.classList.add('has-status');
    label.replaceChildren(dot, el('span', '', emulator.name));
    const present = state.modified.consoles.some(c => consoleKey(c.shortName) === consoleKey(consoleEntry.shortName));
    const plan = present ? planChange(state.modified,definition,consoleEntry.shortName,emulator.id) : null;
    const exists = consoleEntry.emulators.some(e => e.id.toLowerCase() === emulator.id.toLowerCase());
    const unchanged = plan?.exactMatch;
    const action = !present ? 'Add the console first: ' : unchanged ? 'Already added: ' : exists ? 'Update ' : 'Add ';
    const add = rowControl(unchanged ? '✓' : '+', action + emulator.name + ' · ' + consoleEntry.shortName,
      () => addEmulator(definition,consoleEntry.shortName,emulator.id), unchanged ? 'added' : 'add');
    add.disabled = !present || unchanged;
    controls.append(add);
  } else {
    controls.append(rowControl('−','Remove ' + emulator.name + ' · ' + consoleEntry.shortName, () => {
      try {
        commit(planRemoval(state.modified,consoleEntry.shortName,emulator.id));
        toast('Emulator removed');
        $('#config-list').focus({preventScroll:true});
      } catch(error) { toast(error.message,true); }
    },'remove'));
  }
  controls.append(rowControl('i','Info: ' + emulator.name + ' · ' + consoleEntry.shortName,
    () => showDetail(consoleEntry,emulator,definition,isDatabase),'info'));
  row.append(label,controls);
  return row;
}
function findConsoleDefinition(shortName) {
  return state.consoleDefinitions.find(d => consoleKey(d.console.shortName) === consoleKey(shortName));
}
function renderConsoleHeader(consoleEntry, definition, isDatabase) {
  const header = el('div','console-header');
  header.dataset.consoleHeader = consoleKey(consoleEntry.shortName);
  const display = isDatabase && definition ? definition.console : consoleEntry;
  header.append(el('h3','console-title',display.longName));
  const controls = el('div','row-controls');
  if (isDatabase && definition) {
    const plan = planConsoleChange(state.modified,definition.console);
    const label = plan.exactMatch ? 'Already added console: ' : plan.beforeConsole ? 'Replace console: ' : 'Add console: ';
    const add = rowControl(plan.exactMatch ? '✓' : '+',label + display.longName,async () => {
      try {
        const current = planConsoleChange(state.modified,definition.console);
        if (current.exactMatch) return;
        if (current.needsConfirmation && !await confirmAction('Replace ' + display.longName + '?',
          'Replace this entire console, including all metadata and its ' + current.beforeConsole.emulators.length + ' current emulator(s), with the database console shown in its info panel? The replacement contains ' + current.consoleEntry.emulators.length + ' emulator(s). You can add individual emulators afterward and undo this replacement.', 'Replace console')) return;
        commit(current); toast(current.beforeConsole ? 'Console replaced' : 'Console added');
        $('#database-list').focus({preventScroll:true});
      } catch(error) { toast(error.message,true); }
    },plan.exactMatch ? 'added' : 'add');
    add.disabled = plan.exactMatch;
    controls.append(add);
  } else if (!isDatabase) {
    controls.append(rowControl('−','Remove console: ' + display.longName,async () => {
      try {
        const plan = planConsoleRemoval(state.modified,consoleEntry.shortName);
        if (!await confirmAction('Remove ' + display.longName + '?','Remove this entire console and all ' + plan.beforeConsole.emulators.length + ' emulator(s)? You can undo this removal.','Remove console')) return;
        commit(plan); toast('Console removed'); $('#config-list').focus({preventScroll:true});
      } catch(error) { toast(error.message,true); }
    },'remove'));
  }
  if (!isDatabase || definition) controls.append(rowControl('i','Info: ' + display.longName + ' console',() => {
    detailReturnFocus = {side:isDatabase ? 'database' : 'config',shortName:consoleEntry.shortName,header:true};
    $('#detail-title').textContent = display.longName;
    const content = isDatabase && definition?.description.trim() ? [descriptionView(definition.description)] : [];
    content.push(jsonViewer(display,'Console entry'));
    $('#detail-content').replaceChildren(...content); $('#detail-dialog').showModal();
  },'info'));
  header.append(controls);
  return header;
}
function renderLists() {
  if (!state.modified) return;
  const databaseGroups = [], configGroups = [];
  const visibleEmulators = new Set();
  let databaseCount = 0, configCount = 0;
  const consoles = availableConsoles().sort((a,b) => a.longName.localeCompare(b.longName));
  for (const consoleEntry of consoles) {
    const present = state.modified.consoles.some(c => consoleKey(c.shortName) === consoleKey(consoleEntry.shortName));
    const consoleDefinition = findConsoleDefinition(consoleEntry.shortName);
    const available = state.definitions.flatMap(definition =>
      definition.entries.filter(m => consoleKey(m.shortName) === consoleKey(consoleEntry.shortName))
        .map(m => ({definition, emulator:m.emulator})))
      .filter(item => matches(consoleEntry,item.emulator))
      .sort((a,b) => a.emulator.name.localeCompare(b.emulator.name));
    const existing = consoleEntry.emulators.filter(e => matches(consoleEntry,e)).slice().sort((a,b) => a.name.localeCompare(b.name));
    if (available.length || (consoleDefinition && matches(consoleEntry,{name:consoleDefinition.console.longName,id:consoleDefinition.console.shortName}))) {
      available.forEach(item => visibleEmulators.add(item.definition));
      const group = el('section','console-group'); group.append(renderConsoleHeader(consoleEntry,consoleDefinition,true));
      group.append(...available.map(item => renderRow(consoleEntry,item.emulator,item.definition,true)));
      databaseGroups.push(group); databaseCount += available.length;
    }
    if (existing.length || (present && !consoleEntry.emulators.length && matches(consoleEntry,{name:'',id:''}))) {
      const group = el('section','console-group'); group.append(renderConsoleHeader(consoleEntry,consoleDefinition,false));
      group.append(...existing.map(e => renderRow(consoleEntry,e,findDefinition(consoleEntry.shortName,e.id),false)));
      if (!existing.length) group.append(el('p','empty-list','No emulators here yet.'));
      configGroups.push(group); configCount += existing.length;
    }
  }
  $('#database-count').textContent = visibleEmulators.size + (visibleEmulators.size === 1 ? ' emulator' : ' emulators');
  $('#database-count').title = databaseCount + ' console-specific entries';
  $('#config-count').textContent = configCount;
  $('#database-list').replaceChildren(...(databaseGroups.length ? databaseGroups : [el('p','empty-list',state.libraryLoading ? 'Loading…' : 'No matching emulators.')]));
  $('#config-list').replaceChildren(...(configGroups.length ? configGroups : [el('p','empty-list',state.search ? 'No matches.' : 'No emulators here yet.')]));
}

function commit(plan) {
  const modified = applyPlan(state.modified,plan);
  if (equal(modified,state.modified)) return;
  state.actions.push(plan);
  state.modified = modified;
  state.changes = changesBetween(state.original,modified);
  persistSession();
  render();
}
function undo() {
  if (!state.actions.length) return;
  state.actions.pop();
  state.modified = rebuild(state.original,state.actions);
  state.changes = changesBetween(state.original,state.modified);
  persistSession();
  render();
  toast('Change undone');
}
async function applyWithConfirmation(plan) {
  if (!plan.entryChanged) return false;
  if (plan.needsConfirmation && !await confirmAction('Update ' + plan.platform + '?',
    'Apply this emulator to your config?', 'Apply changes')) return false;
  commit(plan);
  return true;
}
async function addEmulator(definition, shortName, emulatorId) {
  try {
    const plan = planChange(state.modified,definition,shortName,emulatorId);
    if (!plan.entryChanged && !plan.exactMatch) {
      toast('Your entry differs from the database. Updating preserves your extra fields, commands, and packages.');
      return;
    }
    if (await applyWithConfirmation(plan)) toast('Emulator applied');
  } catch (error) { toast(error.message,true); }
}
function showDetail(consoleEntry, emulator, definition, isDatabase) {
  detailReturnFocus = {side:isDatabase ? 'database' : 'config',shortName:consoleEntry.shortName,id:emulator.id};
  $('#detail-title').textContent = emulator.name;
  const content = [];
  if (isDatabase && definition?.description.trim()) content.push(descriptionView(definition.description));
  content.push(jsonViewer(emulator,'Emulator entry'));
  $('#detail-content').replaceChildren(...content);
  $('#detail-dialog').showModal();
}

function previewChanges() {
  const controls = el('div','preview-actions');
  controls.append(el('p','',state.changes.length + (state.changes.length === 1 ? ' change' : ' changes')));
  if (state.actions.length) controls.append(button('Undo all',async () => {
    if (!await confirmAction('Undo all changes?','Restore the file you loaded.','Undo all')) return;
    state.actions = []; state.modified = clone(state.original); state.changes = [];
    persistSession();
    render(); $('#preview-dialog').close(); toast('Changes cleared');
  }));
  const diffs = state.changes.map(change => diffView(change.before,change.after,state.file.name + ' · ' + change.title));
  openPreview('Changes',[controls,...diffs]);
}
function showFile() {
  const file = state.file, entry = el('section','file-entry'), actions = el('div');
  entry.append(el('strong','',file.name),el('p','',(file.size/1024).toFixed(1) + ' KB'));
  actions.append(button('View JSON',() => {
    const toolbar = el('div','preview-actions');
    toolbar.append(button('Back to file',showFile));
    const body = el('div');
    const show = original => body.replaceChildren(jsonViewer(original ? file.data : state.modified,file.name));
    toolbar.append(button('Original',() => show(true)),button('Modified',() => show(false)));
    show(false); openPreview(file.name,[toolbar,body]);
  }),button('Download',() => {
    try { downloadJSON(state.modified,file); } catch(error) { toast(error.message,true); }
  }),button('Replace',pickFile));
  entry.append(actions);
  openPreview('File',[entry]);
}
function render() {
  renderUpload();
  renderPlatforms();
  renderLists();
  $('#workspace-status').textContent = state.changes.length ? state.changes.length + (state.changes.length === 1 ? ' change' : ' changes') : 'No changes';
  $('#undo').disabled = !state.actions.length;
  $('#change-dot').hidden = !state.changes.length;
}

let searchTimer;
$('#search').addEventListener('input',event => {
  clearTimeout(searchTimer);
  state.search = event.target.value.trim().toLowerCase();
  searchTimer = setTimeout(() => { persistSession(); renderLists(); },100);
});
function persistSession() {
  try {
    saveSession(state);
    showError('#session-warning', '');
  } catch {
    showError('#session-warning', 'Your browser could not keep this session. Download your JSON before leaving or refreshing the editor.');
  }
}
window.addEventListener('pagehide', persistSession);
$('#nav-editor').addEventListener('click',() => $('#search').focus());
$('#nav-changes').addEventListener('click',previewChanges);
$('#nav-file').addEventListener('click',showFile);
$('#undo').addEventListener('click',undo);
$('#download-config').addEventListener('click',() => {
  try {
    downloadJSON(state.modified,state.file); toast('Download started');
  } catch(error) { toast('Download failed: ' + error.message,true); }
});
async function loadLibrary() {
  try {
    const results = await Promise.allSettled([loadEmulators(),loadConsoles()]);
    const errors = results.flatMap(result => result.status === 'fulfilled' ? result.value.errors : [result.reason.message]);
    state.definitions = results[0].status === 'fulfilled' ? results[0].value.definitions : [];
    state.consoleDefinitions = results[1].status === 'fulfilled' ? results[1].value.definitions : [];
    // Keep previously published full-console packages usable while contributors migrate.
    state.definitions = state.definitions.map(definition => ({...definition,entries:definition.entries.flatMap(entry => {
      if (!isConsoleEntry(entry)) return [entry];
      if (!findConsoleDefinition(entry.shortName)) state.consoleDefinitions.push({description:definition.description,console:entry});
      return entry.emulators.map(emulator => ({shortName:entry.shortName,emulator}));
    })}));
    showError('#library-error',errors.join(' '));
    if (errors.length) $('#library-error').append(button('Retry',loadLibrary));
  } catch(error) {
    showError('#library-error',error.message);
    $('#library-error').append(button('Retry',loadLibrary));
  } finally { state.libraryLoading = false; render(); }
}
state.loading = true;
render();
try {
  const saved = await restoreSession();
  if (saved) {
    Object.assign(state, saved);
    $('#search').value = state.search;
  }
} catch {
  toast('The previous session could not be restored. Please upload your JSON again.', true);
}
state.loading = false;
render(); loadLibrary();
