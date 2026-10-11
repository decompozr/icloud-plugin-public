import {test,expect} from 'bun:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReaderXcodeProject} from './setup-reader.js';
test('prepared Xcode project binds resources to its own runtime, never a previous task directory',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'reader-xcode-project-'));
 try{
  const project=await createReaderXcodeProject(fileURLToPath(new URL('./native/',import.meta.url)),directory);
  expect(project.startsWith(directory+'/')).toBe(true);
  const text=await readFile(join(project,'project.pbxproj'),'utf8');
  expect(text.match(/PHOTOS_READER_RESOURCES = "\$\(SRCROOT\)\/\.\.\/DecompozR Photos Reader.app\/Contents\/Resources";/g)).toHaveLength(2);
  expect(text).not.toContain('.decompozr/flow/run');
  expect(await readFile(join(directory,'Xcode/PhotosReader.swift'),'utf8')).toContain('reader_library_mismatch');
  await expect(createReaderXcodeProject(fileURLToPath(new URL('./native/',import.meta.url)),directory)).rejects.toThrow();
 }finally{await rm(directory,{recursive:true,force:true});}
});
