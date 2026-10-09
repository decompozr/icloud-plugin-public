import {isAbsolute} from 'node:path';
import {lstat,mkdir,readdir} from 'node:fs/promises';

export function parseSetupOptions(args:string[]){
 const directory=args[0];
 if(!directory||!isAbsolute(directory))throw Error('Usage: bun setup.ts /absolute/new/photos-runtime [--python /absolute/existing/python] [--sign identity]');
 let python:string|undefined,sign='-';
 const seen=new Set<string>();
 for(let i=1;i<args.length;i+=2){
  const key=args[i],value=args[i+1];
  if(!key||!['--python','--sign'].includes(key)||!value||seen.has(key))throw Error('Invalid setup option');
  seen.add(key);
  if(key==='--python'){if(!isAbsolute(value))throw Error('Existing Python must be absolute');python=value;}
  else sign=value;
 }
 return {directory,python,sign};
}

/** Never reuse an existing runtime. Failed setup remains available for diagnosis. */
export async function reserveSetupDirectory(directory:string){
 await mkdir(directory,{recursive:true,mode:0o700});
 const st=await lstat(directory);
 if(st.isSymbolicLink()||!st.isDirectory()||(st.mode&0o777)!==0o700||st.uid!==process.getuid?.())throw Error('Private owned directory required');
 if((await readdir(directory)).length)throw Error('Existing runtime retained; choose a new empty runtime directory');
 // Exclusive reservation also rejects concurrent setup before tools execute.
 await mkdir(directory+'/.setup-in-progress',{mode:0o700});
 if((await readdir(directory)).some(name=>name!=='.setup-in-progress'))throw Error('Runtime changed during setup; files retained');
}
