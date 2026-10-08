import{join,resolve,dirname}from'node:path';
const root=resolve(import.meta.dir,'../../..'),cli=join(dirname(Bun.resolveSync('svelte-check/package.json',join(root,'apps/studio'))),'bin/svelte-check');
for(const owner of ['apps/studio','packages/ui','modules/account/ui','modules/mail/ui','modules/calendar/ui','modules/photos/ui','modules/homekit/ui']){
 const child=Bun.spawn([process.execPath,cli,'--workspace',join(root,owner),'--tsconfig','./tsconfig.json'],{cwd:join(root,owner),stdout:'inherit',stderr:'inherit'});
 if(await child.exited!==0)throw Error('UI typecheck failed: '+owner);
}
