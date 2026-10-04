import {SETTINGS} from './settings.js';
import {readConfig} from './config-loader.js';
import {loadEmulators} from './emulator-loader.js';
import {createPlatformFilter} from './platform-filter.js';
import {clone, equal, planChange, planRemoval, applyPlan, rebuild, changesBetween} from './config-merger.js';
import {downloadJSON} from './download.js';
import {$, el, button, toast, showError, jsonViewer, diffView, openPreview, setupDialogs, confirmAction, safeLink, descriptionView} from './ui.js';

const state = {
  file:null, original:null, modified:null,
  definitions:[], actions:[], changes:[], search:'', platform:'all', loading:false, libraryLoading:true
};
let detailReturnFocus;
const platformFilter = createPlatformFilter($('#platform-filter'), value => {
  state.platform = value;
  renderLists();
  $('#database-list').scrollTop = 0;
  $('#config-list').scrollTop = 0;
});
setupDialogs();
$('#detail-dialog').addEventListener('close',() => {
  if (!detailReturnFocus) return;
  const {side,shortName,id} = detailReturnFocus;
  const panel = $('#' + side + '-list');
  const row = panel.querySelector('[data-console="' + CSS.escape(shortName) + '"][data-emulator-id="' + CSS.escape(id) + '"]');
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
    if (files.length !== 1) throw new Error('Choose only emuladores.json.');
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

function renderPlatforms() {
  const options = [...(state.modified?.consoles || [])]
    .sort((a,b) => a.longName.localeCompare(b.longName))
    .map(c => ({value:c.shortName, label:c.longName}));
  platformFilter.setOptions([{value:'all',label:'All consoles'}, ...options],state.platform);
}
function matches(consoleEntry, emulator) {
  return (state.platform === 'all' || state.platform === consoleEntry.shortName) &&
    (consoleEntry.longName + ' ' + consoleEntry.shortName + ' ' + emulator.name + ' ' + emulator.id).toLowerCase().includes(state.search);
}
function findDefinition(shortName, id) {
  return state.definitions.find(d => d.entries.some(m => m.shortName === shortName && m.emulator.id.toLowerCase() === id.toLowerCase()));
}
function rowControl(symbol, label, callback, className) {
  const control = button(symbol, callback, 'row-button ' + className);
  control.setAttribute('aria-label',label); control.title = label;
  return control;
}
function renderRow(consoleEntry, emulator, definition, isDatabase) {
  const row = el('div','emulator-row');
  row.dataset.console = consoleEntry.shortName;
  row.dataset.emulatorId = emulator.id;
  const label = el('div','row-label',emulator.name.replace(/\s*\(Standalone\)/g,''));
  const controls = el('div','row-controls');
  if (isDatabase) {
    const exists = consoleEntry.emulators.some(e => e.id.toLowerCase() === emulator.id.toLowerCase());
    const add = rowControl(exists ? '✓' : '+', (exists ? 'Already added: ' : 'Add ') + emulator.name + ' · ' + consoleEntry.shortName,
      () => addEmulator(definition,consoleEntry.shortName), exists ? 'added' : 'add');
    add.disabled = exists;
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
function renderLists() {
  if (!state.modified) return;
  const databaseGroups = [], configGroups = [];
  const visibleEmulators = new Set();
  let databaseCount = 0, configCount = 0;
  const consoles = [...state.modified.consoles].sort((a,b) => a.longName.localeCompare(b.longName));
  for (const consoleEntry of consoles) {
    const available = state.definitions.flatMap(definition =>
      definition.entries.filter(m => m.shortName === consoleEntry.shortName).map(m => ({definition, emulator:m.emulator})))
      .filter(item => matches(consoleEntry,item.emulator)).sort((a,b) => a.emulator.name.localeCompare(b.emulator.name));
    const existing = consoleEntry.emulators.filter(e => matches(consoleEntry,e)).slice().sort((a,b) => a.name.localeCompare(b.name));
    if (available.length) {
      available.forEach(item => visibleEmulators.add(item.definition));
      const group = el('section','console-group'); group.append(el('h3','console-title',consoleEntry.longName));
      group.append(...available.map(item => renderRow(consoleEntry,item.emulator,item.definition,true)));
      databaseGroups.push(group); databaseCount += available.length;
    }
    if (existing.length) {
      const group = el('section','console-group'); group.append(el('h3','console-title',consoleEntry.longName));
      group.append(...existing.map(e => renderRow(consoleEntry,e,findDefinition(consoleEntry.shortName,e.id),false)));
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
  render();
}
function undo() {
  if (!state.actions.length) return;
  state.actions.pop();
  state.modified = rebuild(state.original,state.actions);
  state.changes = changesBetween(state.original,state.modified);
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
async function addEmulator(definition, shortName) {
  try {
    const plan = planChange(state.modified,definition,shortName);
    if (await applyWithConfirmation(plan)) toast('Emulator added');
  } catch (error) { toast(error.message,true); }
}
function showDetail(consoleEntry, emulator, definition, isDatabase) {
  detailReturnFocus = {side:isDatabase ? 'database' : 'config',shortName:consoleEntry.shortName,id:emulator.id};
  $('#detail-title').textContent = emulator.name.replace(/\s*\(Standalone\)/g,'');
  const content = [];
  if (definition?.description.trim()) content.push(descriptionView(definition.description));
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
  renderLists();
  $('#workspace-status').textContent = state.changes.length ? state.changes.length + (state.changes.length === 1 ? ' change' : ' changes') : 'No changes';
  $('#undo').disabled = !state.actions.length;
  $('#change-dot').hidden = !state.changes.length;
}

let searchTimer;
$('#search').addEventListener('input',event => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.search = event.target.value.trim().toLowerCase(); renderLists(); },100);
});
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
    const result = await loadEmulators();
    state.definitions = result.definitions;
    showError('#library-error',result.errors.join(' '));
  } catch(error) {
    showError('#library-error',error.message);
    $('#library-error').append(button('Retry',loadLibrary));
  } finally { state.libraryLoading = false; renderLists(); }
}
render(); loadLibrary();
