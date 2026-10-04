import {validateConfig} from './config-validator.js';
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
// JSON.parse silently keeps the last duplicate object key. Refuse that data loss.
function checkObjectKeys(source) {
  const stack = [];
  for (const match of source.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],:]/g)) {
    const token = match[0], current = stack.at(-1);
    if (token === '{' || token === '[') {
      stack.push({object: token === '{', keys: new Set(), expectingKey: true});
      if (stack.length > 200) throw new Error('This JSON is nested too deeply to edit safely.');
    } else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && current?.object) current.expectingKey = true;
    else if (token === ':' && current?.object) current.expectingKey = false;
    else if (token.startsWith('"') && current?.object && current.expectingKey) {
      const key = JSON.parse(token);
      if (current.keys.has(key)) throw new Error(`Duplicate JSON property: ${key}. Resolve it before editing to prevent data loss.`);
      current.keys.add(key); current.expectingKey = false;
    }
  }
}
export async function readConfig(file) {
  if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Choose a .json file.');
  if (file.size > MAX_FILE_SIZE) throw new Error('This file is too large. Choose a JSON file smaller than 10 MB.');
  let source;
  try { source = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(await file.arrayBuffer()); }
  catch { throw new Error('Choose a UTF-8 encoded JSON file. The file could not be decoded safely.'); }
  let data;
  try { data = JSON.parse(source.replace(/^\uFEFF/, ''), (key, value) => {
    if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('unsafe number');
    return value;
  }); } catch (error) {
    throw new Error(error.message === 'unsafe number' ? 'This file contains numbers that cannot be preserved safely by this editor.' : 'Could not parse JSON. Check for missing commas, quotes, or brackets.');
  }
  checkObjectKeys(source);
  validateConfig(data);
  return {data, name: file.name, size: file.size, source, newline: source.includes('\r\n') ? '\r\n' : '\n', indent: source.match(/\n([\t ]+)"/)?.[1] || '  ', bom: source.startsWith('\uFEFF')};
}
