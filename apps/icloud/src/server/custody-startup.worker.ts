// Synthetic SQLite hot-journal fixture only; never imported by runtime.
import {Database} from 'bun:sqlite';
const input=JSON.parse(await Bun.stdin.text()) as {databasePath:string};
const db=new Database(input.databasePath,{create:false,readwrite:true});
db.exec('PRAGMA synchronous=FULL; PRAGMA journal_mode=DELETE; PRAGMA cache_size=5; PRAGMA cache_spill=1; BEGIN IMMEDIATE; UPDATE synthetic_crash_spill SET bytes=zeroblob(4096)');
// Dirty pages spill before commit; SIGKILL leaves an actual SQLite hot journal.
process.kill(process.pid,'SIGKILL');
throw Error('Synthetic process should have terminated');
