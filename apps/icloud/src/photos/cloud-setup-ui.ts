export function photosCloudSection(){return `<section class="card" id="photos-cloud-setup" aria-labelledby="photos-cloud-title">
<h2 id="photos-cloud-title">Shared Album account connection</h2>
<p>Connect the selected Apple Account here for API access. Your password and verification code are used only for this request. No photos or invitations are sent.</p>
<label for="photos-cloud-account">Account</label><select id="photos-cloud-account" required></select>
<p id="photos-cloud-status" role="status" aria-live="polite"></p>
<button type="button" id="photos-cloud-install">Set up Shared Album connection</button>
<form id="photos-cloud-login"><fieldset id="photos-cloud-login-fields" disabled><label for="photos-cloud-password">Apple Account password</label><input id="photos-cloud-password" type="password" autocomplete="current-password" maxlength="1024" required><button type="submit">Sign in</button></fieldset></form>
<form id="photos-cloud-verify" hidden><label for="photos-cloud-code">Six-digit verification code</label><input id="photos-cloud-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button type="submit">Verify</button><button type="button" id="photos-cloud-send-code">Request a code</button></form>
<button type="button" id="photos-cloud-recheck">Check connection again</button>
<button type="button" id="photos-cloud-revoke">Disconnect Shared Album API</button>
<label><input type="checkbox" id="photos-cloud-revoke-confirm">Confirm disconnecting this account's Shared Album API session</label>
</section>`;}
