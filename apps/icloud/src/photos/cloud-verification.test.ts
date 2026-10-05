import {expect,test} from 'bun:test';
import {verificationPrompt,verificationFailure,verificationMethod} from './cloud-verification.js';
test('SMS and trusted-device instructions identify distinct verification sources',()=>{
 expect(verificationPrompt('sms')).toContain('SMS');expect(verificationPrompt('sms')).toContain('not a code from a Mac or iPhone');
 expect(verificationPrompt('trusted_device')).toContain('trusted-device prompt');
 expect(verificationFailure('sms')).toContain('SMS');
 expect(verificationMethod.catch('unknown').parse('provider-private-secret')).toBe('unknown');
});
