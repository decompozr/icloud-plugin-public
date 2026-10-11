import {isAbsolute} from 'node:path';
export function parseReaderSetupOptions(args:string[]){
 const directory=args[0];
 if(!directory||!isAbsolute(directory))throw Error('Absolute new reader runtime required');
 const options:Record<string,string>={};
 for(let i=1;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!key||!['--python','--library','--sign'].includes(key)||!value||options[key])throw Error('Invalid reader setup option');options[key]=value;}
 const python=options['--python'],library=options['--library'],sign=options['--sign'];
 if(!python||!library||!isAbsolute(python)||!isAbsolute(library))throw Error('Existing Python and selected library must be absolute');
 if(!sign||sign==='-'||sign.startsWith('-'))throw Error('Stable signing identity required; ad-hoc reader forbidden');
 return {directory,python,library,sign};
}
