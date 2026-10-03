import { i18n } from '../i18n/index.js';
export const authEnglish = {
 product: 'iCloud Plugin',
 titleConsent: 'Authorize connection', titleSignIn: 'Owner sign-in',
 headingConsent: 'Authorize mailbox access', headingSignIn: 'Sign in with your passkey',
 introConsent: 'This client requests the permissions below. Access is granted only after you approve.',
 introSignIn: 'Use the passkey you created during setup.',
 allow: 'Allow connection', usePasskey: 'Use passkey', deny: 'Deny', owner: 'Owner',
 requestFailed: 'The request failed. Try again or restart the connection.',
 incompleteConnection: 'The connection request is incomplete. Reconnect from your client.',
 unsupportedCallback: 'Unsupported callback URL.',
 signedIn: 'Signed in. Return to your client to continue.',
 incompleteAuthorization: 'The authorization response is incomplete. Reconnect.',
 working: 'Working…',
 actionFailed: 'The request did not complete. Try again. Cancelling the passkey prompt does not grant access.',
 unknownClient: 'Unknown client',
 scopeSend: 'Send new messages and replies from your iCloud mailbox',
 scopeRead: 'Read and search mail', scopeWrite: 'Change message state and organize your mailbox',
 scopeUnsubscribe: 'Submit unsubscribe requests', scopeOffline: 'Continue using this connection when you are offline',
} as const;
export type AuthCopyKey = keyof typeof authEnglish;
i18n.addResourceBundle('en', 'auth', authEnglish, true, true);
i18n.addResourceBundle('zh-TW', 'auth', { scopeSend: '從你的 iCloud 信箱寄送新郵件及回覆' }, true, true);
export function authT(key: AuthCopyKey): string { return i18n.t(key, { ns: 'auth' }); }
