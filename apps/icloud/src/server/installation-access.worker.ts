// Synthetic process-exclusion fixture only; excluded from runtime builds.
import {InstallationAccess} from './installation-access.js';
try{
 const access=InstallationAccess.acquire(process.argv[2]!,'runtime');
 console.log('acquired');
 if(process.argv[3]==='hold')await Bun.stdin.text();
 access.release();
}catch{console.error('blocked');process.exitCode=1;}
