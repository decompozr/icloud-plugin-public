import {constants} from 'node:fs';
import {open,mkdir,mkdtemp,realpath,rm,chmod,unlink,rmdir,lstat} from 'node:fs/promises';
import {join,relative,isAbsolute,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';

const descriptor=z.object({assetId:z.string(),path:z.string(),filename:z.string().min(1).max(255),representation:z.enum(['original','edited']),livePhotoStillOnly:z.boolean(),mediaType:z.enum(['photo','video'])}).strict();
export type StagedUploadSource={assetId:string;filename:string;representation:'original'|'edited';livePhotoStillOnly:boolean;mediaType:'photo'|'video';bytes:number;sha256:string;privatePath:string};
const MAX_BYTES=500*1024*1024;
function within(root:string,path:string){const rel=relative(root,path);return rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel);}

/** Server-owned staging only. No source path or destination is accepted from MCP. */
export async function stageUploadSource(raw:unknown,options:{library:string;directory:string;assetId:string}):Promise<StagedUploadSource>{
 const source=descriptor.parse(raw);
 if(source.assetId!==options.assetId||!isAbsolute(options.library)||!isAbsolute(options.directory))throw Error('upload_source_identity_mismatch');
 const library=await realpath(options.library),path=await realpath(source.path);
 if(!within(library,path))throw Error('upload_source_outside_library');
 await mkdir(options.directory,{recursive:true,mode:0o700});
 const root=await realpath(options.directory);
 const directory=await mkdtemp(join(root,'upload-'));await chmod(directory,0o700);
 const privatePath=join(directory,'content');
 try{
  const input=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
   const before=await input.stat();if(!before.isFile()||before.size<=0||before.size>MAX_BYTES)throw Error('upload_source_size_invalid');
   const output=await open(privatePath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
   const hash=createHash('sha256');let bytes=0;
   try{
    const buffer=Buffer.alloc(1024*1024);
    while(true){const read=await input.read(buffer,0,buffer.length,null);if(!read.bytesRead)break;
     bytes+=read.bytesRead;if(bytes>MAX_BYTES)throw Error('upload_source_size_invalid');
     const chunk=buffer.subarray(0,read.bytesRead);hash.update(chunk);
     let offset=0;while(offset<chunk.length){const written=await output.write(chunk,offset,chunk.length-offset);if(!written.bytesWritten)throw Error('upload_source_copy_failed');offset+=written.bytesWritten;}
    }
    await output.sync();
   }finally{await output.close();}
   const after=await input.stat();
   if(bytes!==before.size||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs)throw Error('upload_source_changed');
   return {assetId:source.assetId,filename:source.filename,representation:source.representation,livePhotoStillOnly:source.livePhotoStillOnly,mediaType:source.mediaType,bytes,sha256:hash.digest('hex'),privatePath};
  }finally{await input.close();}
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}


/** Remove only this retained staged file; never sweep a directory or library. */
export async function releaseUploadSource(source:StagedUploadSource,directory:string){
 const root=await realpath(directory),parent=dirname(source.privatePath);
 if(basename(source.privatePath)!=='content'||dirname(parent)!==root||!basename(parent).startsWith('upload-'))throw Error('upload_cleanup_path_invalid');
 if(await realpath(parent)!==parent)throw Error('upload_cleanup_path_invalid');
 try{const file=await lstat(source.privatePath);if(!file.isFile()||file.isSymbolicLink())throw Error('upload_cleanup_path_invalid');await unlink(source.privatePath);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 await rmdir(parent);
}
