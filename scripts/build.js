import {mkdir, copyFile, cp, realpath, rm} from 'node:fs/promises';
import path from 'node:path';
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
console.log('Static site prepared in dist/ (input JSON files excluded).');
