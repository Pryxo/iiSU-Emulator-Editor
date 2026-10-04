import {mkdir, copyFile, cp, realpath, rm, readFile, writeFile, readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// One content-based version for the entire module graph and emulator catalog.
// Updating only app.js would still let browsers reuse older imported modules.
async function sourceFiles(directory) {
  const entries = await readdir(directory,{withFileTypes:true});
  const files = await Promise.all(entries.map(entry => {
    const name = path.join(directory,entry.name);
    return entry.isDirectory() ? sourceFiles(name) : [name];
  }));
  return files.flat().sort();
}
const versionFiles = ['index.html', ...await sourceFiles('js'), ...await sourceFiles('css'), ...await sourceFiles('emulators')];
const hash = createHash('sha256');
for (const file of versionFiles) hash.update(file.replaceAll(path.sep,'/')).update('\0').update(await readFile(file)).update('\0');
const version = hash.digest('hex').slice(0,16);
// Explicit allowlist: private input files and tests never enter the deploy artifact.
await mkdir('dist',{recursive:true});
// Remove old generated packages so deleted source definitions are never redeployed.
const workspace = await realpath('.');
const output = await realpath('dist');
if (!output.startsWith(workspace + path.sep)) throw new Error('Build output must stay inside the workspace.');
const emulatorOutput = path.join(output,'emulators');
try {
  const resolved = await realpath(emulatorOutput);
  if (!resolved.startsWith(output + path.sep)) throw new Error('Emulator output must stay inside dist.');
  await rm(emulatorOutput,{recursive:true,force:true});
} catch(error) { if(error.code !== 'ENOENT') throw error; }
for(const name of ['index.html','LICENSE']) await copyFile(name,`dist/${name}`);
for(const name of ['assets','css','js','emulators','docs']) await cp(name,`dist/${name}`,{recursive:true});
for (const file of await sourceFiles('dist/js')) {
  if (!file.endsWith('.js')) continue;
  const source = await readFile(file,'utf8');
  await writeFile(file,source.replace(/(\bfrom\s*['"])(\.{1,2}\/[^'"?]+\.js)(['"])/g,`$1$2?v=${version}$3`));
}
const html = await readFile('dist/index.html','utf8');
await writeFile('dist/index.html',html.replace(/((?:src|href)="\.\/(?:js|css)\/[^"?]+\.(?:js|css))"/g,`$1?v=${version}"`));
console.log('Static site prepared in dist/ (input JSON files excluded).');
