import { i18n } from '../i18n/index.js';
export const authEnglish = {
 product: 'iCloud Plugin',
 connectionExpired:'This connection request cannot continue. Return to ChatGPT and choose Connect another account to start a new request.',savedReconnect:'The account is saved. Return to ChatGPT, choose Connect another account, and select this account to finish authorization.',
 titleConnect:'Connect an iCloud account',headingConnect:'Choose an iCloud account',introConnect:'Connect an existing account or add another iCloud account. Each connection uses the account you select.',addAccount:'Add new iCloud account',accountLabel:'Account name (optional)',email:'iCloud email address',password:'Apple app-specific password',passwordHelp:'Use an Apple app-specific password. It is verified and stored securely by this service; it is never sent to ChatGPT.',appleGuide:'Create an app-specific password',saveAccount:'Verify and connect account',cancel:'Cancel connection',selectedAccount:'Selected iCloud account',providerError:'Could not sign in to iCloud Mail. Check the email and app-specific password, then try again.',duplicateAccount:'This account already exists. Select it above, or update its password on the private management page.',accountUnavailable:'The selected account has no stored credentials. Update its password on the private management page.',chooseAccount:'Choose an account before approving access.',
 titleConsent: 'Authorize connection', titleSignIn: 'Owner sign-in',
 headingConsent: 'Authorize iCloud access', headingSignIn: 'Sign in with your passkey',
 introConsent: 'Choose what this connection can do. Unchecked actions will not be granted.',
 permissions:'Allowed actions',backToAccounts:'Back to accounts',selectPermission:'Choose at least one permission, or deny the connection.',permissionMail:'Mail',permissionCalendar:'Calendar',permissionConnection:'Connection',permissionPhotos:'Mac Photos library',photosLibrary:'Photos uses the selected library on the Mac running this service. Your iCloud app-specific password connects Mail and Calendar only.',scopePhotosRead:'Read photos, previews, existing people labels and albums in the selected Mac Photos library',scopePhotosWrite:'Apply reviewed album and metadata changes; sharing requires a separate review on the Mac',scopePhotosDelete:'Delete specifically reviewed photos from the synced library; deletion can affect other synced devices',
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
i18n.addResourceBundle('zh-TW', 'auth', { permissions:'允許的操作',backToAccounts:'返回帳號',selectPermission:'請選擇至少一項權限，或拒絕連線。',introConsent:'選擇此連線可以執行的操作。未勾選的項目不會授權。',permissionMail:'郵件',permissionCalendar:'行事曆',permissionConnection:'連線',permissionPhotos:'Mac 照片庫',photosLibrary:'照片使用執行此服務的 Mac 上選定的照片庫。iCloud App 專用密碼只用於郵件與行事曆。',scopePhotosRead:'讀取選定 Mac 照片庫的照片、預覽、既有人物標籤與相簿',scopePhotosWrite:'套用經確認的相簿與中繼資料變更；分享需要在 Mac 上另外確認',scopePhotosDelete:'刪除經確認的指定照片；同步照片庫的刪除可能影響其他同步裝置',headingConsent:'授權 iCloud 存取',clientIdentifier:'用戶端識別碼', connectionExpired:'此連線要求無法繼續。請返回 ChatGPT，選擇 Connect another account 重新開始。',savedReconnect:'帳號已儲存。請返回 ChatGPT，選擇 Connect another account，再選取此帳號完成授權。',titleConnect:'連接 iCloud 帳號',headingConnect:'選擇 iCloud 帳號',introConnect:'選擇既有帳號或新增另一個 iCloud 帳號。每個連線只使用你選擇的帳號。',addAccount:'新增 iCloud 帳號',accountLabel:'帳號名稱（選填）',email:'iCloud 郵件地址',password:'Apple App 專用密碼',passwordHelp:'請使用 Apple App 專用密碼。服務會驗證並安全儲存，不會傳送到 ChatGPT。',appleGuide:'建立 App 專用密碼',saveAccount:'驗證並連接帳號',cancel:'取消連線',selectedAccount:'選定的 iCloud 帳號',providerError:'無法登入 iCloud 郵件。請確認地址及 App 專用密碼後重試。',duplicateAccount:'此帳號已存在。請從上方選擇，或在私人管理頁面更新密碼。',accountUnavailable:'此帳號沒有已儲存的憑證。請在私人管理頁面更新密碼。',chooseAccount:'授權前請先選擇帳號。', scopeSend: '從你的 iCloud 信箱寄送新郵件及回覆' }, true, true);
export function authT(key: AuthCopyKey): string { return i18n.t(key, { ns: 'auth' }); }
