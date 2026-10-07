export {ToastCenter,type ToastTone} from '../../../../packages/ui/src/toast-state.svelte.js';
export {DialogCenter,type CredentialOptions,type AppPasswordInput} from '../../../../modules/account/ui/dialog-state.svelte.js';
export interface LocaleControl {
  current: "en" | "zh-TW";
  set(value: "en" | "zh-TW"): void;
}

export interface NavigationControl{push(href:string):void;replace(href:string):void}
