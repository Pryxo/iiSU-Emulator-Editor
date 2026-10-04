import {equal} from './config-merger.js';
export function serializeConfig(data, file) {
  if (equal(data, file.data)) return file.source;
  return (file.bom ? '\uFEFF' : '') + JSON.stringify(data, null, file.indent).replace(/\n/g, file.newline) + file.newline;
}
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
}
export function downloadJSON(data, file) { saveBlob(new Blob([serializeConfig(data, file)], {type:'application/json'}), file.name); }
