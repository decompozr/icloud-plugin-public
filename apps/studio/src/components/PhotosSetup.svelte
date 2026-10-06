<section class="card" id="photos-setup" aria-labelledby="photos-setup-title">
  <h2
    id="photos-setup-title"
    data-photos-en="Connect Photos"
    data-photos-zh="連接照片"
  >
    Connect Photos
  </h2>
  <p
    data-photos-en="Complete these permissions on the Mac running this service. Opening settings does not change any photos."
    data-photos-zh="請在執行此服務的 Mac 上完成權限設定。開啟設定不會修改照片。"
  >
    Complete these permissions on the Mac running this service. Opening settings
    does not change any photos.
  </p>
  <ol style="list-style:none;padding-left:0">
    <li style="margin-bottom:1rem" data-photos-step="library">
      <strong
        data-photos-en="1. Read your library"
        data-photos-zh="1. 讀取照片庫">1. Read your library</strong
      >
      <p
        data-photos-en="Allow Full Disk Access for the app running this service. If you change it, quit and reopen that app."
        data-photos-zh="允許執行此服務的 App 使用完整磁碟存取權。變更後請完全退出並重開該 App。"
      >
        Allow Full Disk Access for the app running this service. If you change
        it, quit and reopen that app.
      </p>
      <button
        type="button"
        class="secondary"
        data-photos-action="files"
        data-photos-en="Open Full Disk Access"
        data-photos-zh="開啟完整磁碟存取設定">Open Full Disk Access</button
      >
    </li>
    <li style="margin-bottom:1rem" data-photos-step="authorization">
      <strong
        data-photos-en="2. Allow Photos access"
        data-photos-zh="2. 允許照片存取">2. Allow Photos access</strong
      >
      <p
        data-photos-en="Choose full access for iCloud Photos Helper. If it is not listed yet, request access first."
        data-photos-zh="為 iCloud Photos Helper 選擇完整存取。若尚未列出，請先按要求存取。"
      >
        Choose full access for iCloud Photos Helper. If it is not listed yet,
        request access first.
      </p>
      <button
        type="button"
        class="primary"
        data-photos-action="authorize"
        data-photos-en="Request Photos Access"
        data-photos-zh="要求照片存取">Request Photos Access</button
      >
      <button
        type="button"
        class="secondary"
        data-photos-action="photos"
        data-photos-en="Open Photos Privacy Settings"
        data-photos-zh="開啟照片隱私設定">Open Photos Privacy Settings</button
      >
    </li>
    <li style="margin-bottom:1rem" data-photos-step="verify">
      <strong
        data-photos-en="3. Verify permissions"
        data-photos-zh="3. 確認權限">3. Verify permissions</strong
      >
      <p
        data-photos-en="After completing the Mac prompts, check again. Continue when both library reading and Photos access are ready."
        data-photos-zh="完成 Mac 的授權提示後，重新檢查。照片庫讀取與照片存取均就緒後才繼續。"
      >
        After completing the Mac prompts, check again. Continue when both
        library reading and Photos access are ready.
      </p>
      <p id="photos-status" role="status" aria-live="polite"></p>
      <button
        type="button"
        class="secondary"
        id="photos-recheck"
        data-photos-en="Check Permissions Again"
        data-photos-zh="重新檢查權限">Check Permissions Again</button
      >
    </li>
  </ol>
  <details>
    <summary
      data-photos-en="Metadata editing permissions and manual settings links"
      data-photos-zh="中繼資料編輯權限與設定捷徑"
      >Metadata editing permissions and manual settings links</summary
    >
    <p
      data-photos-en="Photos may also ask for Automation access when you edit titles or keywords. Allow control of Photos. These links open settings on the device viewing this page; the buttons above open them on the service Mac."
      data-photos-zh="編輯標題或關鍵字時，系統可能另外要求自動化權限，請允許控制 Photos。下方連結會開啟目前裝置的設定；上方按鈕則開啟服務所在 Mac 的設定。"
    >
      Photos may also ask for Automation access when you edit titles or
      keywords. Allow control of Photos. These links open settings on the device
      viewing this page; the buttons above open them on the service Mac.
    </p>
    <a
      href="x-apple.systempreferences:com.apple.preference.security?Privacy_Photos"
      >Photos</a
    >
    ·
    <a
      href="x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
      >Full Disk Access</a
    >
    ·
    <a
      href="x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
      >Automation</a
    >
  </details>
</section>
