import { SetupStore } from './store';
// Only dummy inputs arrive over stdin; no host environment credentials are read.
const input = JSON.parse(await Bun.stdin.text());
const store = new SetupStore(input.path, Buffer.from(input.key, 'hex'));
try {
  if (input.action === 'enroll') {
    store.enroll(input.proof, input.owner, input.credential, () => true);
    console.log('claimed');
  } else {
    if (store.read() !== input.credential) throw new Error('Mismatch');
    console.log('persisted');
  }
} catch { console.log('rejected'); }
finally { store.close(); }
