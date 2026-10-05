import {z} from 'zod';
export const verificationMethod=z.enum(['sms','trusted_device','security_key','unknown']);
export type VerificationMethod=z.infer<typeof verificationMethod>;
export function verificationPrompt(method:VerificationMethod){
 switch(method){
  case 'sms':return 'This sign-in requested an SMS code. Enter the latest code from Apple\'s text message, not a code from a Mac or iPhone pop-up.';
  case 'trusted_device':return 'Enter the code from the trusted-device prompt for this sign-in.';
  case 'security_key':return 'This sign-in requires a security key; six-digit code verification is not available.';
  default:return 'The verification source is unknown. Request a new code before entering one.';
 }
}
export function verificationFailure(method:VerificationMethod){return `Apple did not accept this verification code. ${verificationPrompt(method)}`;}
