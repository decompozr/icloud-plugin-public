<script lang="ts">
  import Copy from "./Copy.svelte";
  let { admin }: { admin: boolean } = $props();
</script>

<section data-step="2" hidden={!admin}>
  <h2 tabindex="-1">
    <Copy copyKey={admin ? "mailAdminTitle" : "mailTitle"} />
  </h2>
  <p><Copy copyKey={"mailIntro"} /></p>
  {#if admin}<p class="note"><Copy copyKey={"replaceNote"} /></p>{:else}{/if}
  <div class="note">
    <a href="https://support.apple.com/102654" target="_blank" rel="noreferrer"
      ><Copy copyKey={"appleGuide"} /></a
    ><br /><Copy copyKey={"appleGuideHelp"} />
  </div>
  <form id="credentials" data-admin={admin}>
    <label for="account"><Copy copyKey={"accountsTitle"} /></label><select
      id="account"
      required
    ></select><label for="password"><Copy copyKey={"password"} /></label><input
      id="password"
      name="password"
      type="password"
      required
      autocomplete="new-password"
      maxlength="256"
    /><small><Copy copyKey={"passwordHelp"} /></small>
    <div class="actions">
      <button id="save" class="primary" type="submit"
        ><Copy copyKey={admin ? "saveAdmin" : "save"} /></button
      >{#if admin}{:else}<button type="button" class="secondary" data-back="1"
          ><Copy copyKey={"back"} /></button
        >{/if}
    </div>
  </form>
  {#if admin}<div class="section-divider">
      <h2><Copy copyKey={"revokeTitle"} /></h2>
      <p class="muted"><Copy copyKey={"revokeIntro"} /></p>
      <button id="revoke" class="danger"><Copy copyKey={"revoke"} /></button>
      <div id="revoke-confirm" hidden class="note">
        <p id="revoke-account"></p>
        <p><Copy copyKey={"revokeConfirm"} /></p>
        <button id="revoke-yes" class="danger"
          ><Copy copyKey={"revokeYes"} /></button
        >
        <button id="revoke-cancel" class="secondary"
          ><Copy copyKey={"cancel"} /></button
        >
      </div>
    </div>{:else}{/if}
</section>
