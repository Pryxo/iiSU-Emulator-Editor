import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

test('deployment versions the full module graph and changes URLs after catalog edits',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'iisu-emulator-editor-build-'));
 try {
  for(const dir of ['scripts','js','css','emulators/example','consoles/example','assets','docs']) await mkdir(path.join(root,dir),{recursive:true});
  await copyFile(new URL('../scripts/build.js',import.meta.url),path.join(root,'scripts/build.js'));
  await writeFile(path.join(root,'package.json'),'{"type":"module"}');
  await writeFile(path.join(root,'LICENSE'),'test');
  await writeFile(path.join(root,'index.html'),'<link href="./css/main.css"><script type="module" src="./js/app.js"></script>');
  await writeFile(path.join(root,'js/app.js'),"import {value} from './nested.js';");
  await writeFile(path.join(root,'js/nested.js'),"export const value = 1;");
  await writeFile(path.join(root,'css/main.css'),'body{}');
  await writeFile(path.join(root,'emulators/index.json'),'{"emulators":[]}');
  await writeFile(path.join(root,'emulators/example/emulator.json'),'{"description":"old"}');
  const build=()=>execFileSync(process.execPath,['scripts/build.js'],{cwd:root});
  const read=relative=>readFile(path.join(root,relative),'utf8');
  build();
  const first=await read('dist/index.html');
  const version=first.match(/app\.js\?v=([a-f0-9]{16})/)[1];
  assert.ok(first.includes('main.css?v='+version));
  assert.ok((await read('dist/js/app.js')).includes('nested.js?v='+version));
  assert.equal(await read('js/app.js'),"import {value} from './nested.js';");
  build();assert.equal(await read('dist/index.html'),first);
  await writeFile(path.join(root,'emulators/example/emulator.json'),'{"description":"updated"}');
  build();
  assert.notEqual(await read('dist/index.html'),first);
  assert.ok(!(await read('dist/js/app.js')).includes(version));
  const emulatorBuild = await read('dist/index.html');
  await writeFile(path.join(root,'consoles/example/console.json'),'{"description":"console"}');
  build();
  assert.notEqual(await read('dist/index.html'),emulatorBuild);
  assert.equal(await read('dist/consoles/example/console.json'),'{"description":"console"}');
 } finally {
  const resolved=await realpath(root),parent=await realpath(tmpdir());
  if(path.dirname(resolved)!==parent || !path.basename(resolved).startsWith('iisu-emulator-editor-build-')) throw new Error('Unsafe test cleanup path');
  await rm(resolved,{recursive:true,force:true});
 }
});
