import {readConfig} from './config-loader.js';
import {clone, rebuild, changesBetween} from './config-merger.js';

// Scope storage to this editor's path, including on shared GitHub Pages origins.
export const SESSION_KEY = 'iisu-editor-session:' + new URL('../', import.meta.url).pathname;
export function clearSession(storage = window.sessionStorage) {
  storage.removeItem(SESSION_KEY);
}
export function saveSession(state, storage = window.sessionStorage) {
  if (!state.file) return;
  try {
    storage.setItem(SESSION_KEY, JSON.stringify({
      version:1, file:{name:state.file.name, source:state.file.source},
      actions:state.actions, search:state.search, platform:state.platform
    }));
  } catch (error) {
    // Never restore an older file or older edits after a failed save.
    clearSession(storage);
    throw error;
  }
}
export async function restoreSession(storage = window.sessionStorage) {
  const source = storage.getItem(SESSION_KEY);
  if (!source) return null;
  try {
    const saved = JSON.parse(source);
    if (saved.version !== 1 || typeof saved.file?.name !== 'string' ||
        typeof saved.file.source !== 'string' || !Array.isArray(saved.actions) ||
        typeof saved.search !== 'string' || typeof saved.platform !== 'string') {
      throw new Error('Invalid editor session.');
    }
    const file = await readConfig(new File([saved.file.source], saved.file.name));
    const original = clone(file.data), modified = rebuild(original, saved.actions);
    return {file, original, modified, actions:saved.actions,
      changes:changesBetween(original, modified), search:saved.search, platform:saved.platform};
  } catch (error) {
    clearSession(storage);
    throw error;
  }
}
