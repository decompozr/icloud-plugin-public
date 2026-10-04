import { i18n } from '../i18n/index.js';
export const authEnglish = {
 product: 'iCloud Plugin',chooseAccounts:'Choose accounts this connection may access',continueSelected:'Continue with selected accounts',
 connectionExpired:'This connection request cannot continue. Return to ChatGPT and choose Connect another account to start a new request.',savedReconnect:'The account is saved. Return to ChatGPT, choose Connect another account, and select this account to finish authorization.',
 titleConnect:'Connect an iCloud account',headingConnect:'Choose an iCloud account',introConnect:'Choose the accounts this connection may access, or add an iCloud account. Existing connections do not gain access to newly linked accounts.',addAccount:'Add new iCloud account',accountLabel:'Account name (optional)',email:'Apple Account email address',password:'Apple app-specific password',passwordHelp:'Use an Apple app-specific password. It is verified and stored securely by this service; it is never sent to ChatGPT.',appleGuide:'Create an app-specific password',saveAccount:'Verify and connect account',cancel:'Cancel connection',selectedAccount:'Selected iCloud account',providerError:'No registered service could verify this credential. Check the Apple Account address, app-specific password and network, then try again.',duplicateAccount:'This account already exists. Select it above, or update its password on the private management page.',accountUnavailable:'The selected account has no stored credentials. Update its password on the private management page.',chooseAccount:'Choose an account before approving access.',
 titleConsent: 'Authorize connection', titleSignIn: 'Owner sign-in',
 headingConsent: 'Authorize iCloud access', headingSignIn: 'Sign in with your passkey',
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
 unknownClient: 'Unknown client', clientIdentifier: 'Client identifier',
 scopeSend: 'Send new messages and replies from your iCloud mailbox',
 scopeRead: 'Read and search mail', scopeWrite: 'Change message state and organize your mailbox',
 scopeUnsubscribe: 'Submit unsubscribe requests', scopeOffline: 'Continue using this connection when you are offline',
} as const;
export type AuthCopyKey = keyof typeof authEnglish;
i18n.addResourceBundle('en', 'auth', authEnglish, true, true);
i18n.addResourceBundle('zh-TW', 'auth', { headingConsent:'授權 iCloud 帳號存取',clientIdentifier:'用戶端識別碼',chooseAccounts:'選擇此連線可存取的帳號',continueSelected:'繼續授權所選帳號',connectionExpired:'此連線要求無法繼續。請返回 ChatGPT，選擇 Connect another account 重新開始。',savedReconnect:'帳號已儲存。請返回 ChatGPT，選擇 Connect another account，再選取此帳號完成授權。',titleConnect:'連接 iCloud 帳號',headingConnect:'選擇 iCloud 帳號',introConnect:'選擇此連線可存取的帳號，或新增 iCloud 帳號。既有連線不會自動獲得新帳號的存取權。',addAccount:'新增 iCloud 帳號',accountLabel:'帳號名稱（選填）',email:'Apple 帳號電子郵件地址',password:'Apple App 專用密碼',passwordHelp:'請使用 Apple App 專用密碼。服務會驗證並安全儲存，不會傳送到 ChatGPT。',appleGuide:'建立 App 專用密碼',saveAccount:'驗證並連接帳號',cancel:'取消連線',selectedAccount:'選定的 iCloud 帳號',providerError:'所有已註冊服務都未能驗證此憑證。請確認 Apple 帳號地址、App 專用密碼與網路後重試。',duplicateAccount:'此帳號已存在。請從上方選擇，或在私人管理頁面更新密碼。',accountUnavailable:'此帳號沒有已儲存的憑證。請在私人管理頁面更新密碼。',chooseAccount:'授權前請先選擇帳號。', scopeSend: '從你的 iCloud 信箱寄送新郵件及回覆' }, true, true);
export function authT(key: AuthCopyKey): string { return i18n.t(key, { ns: 'auth' }); }
