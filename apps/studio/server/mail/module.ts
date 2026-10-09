import {createMailModule as createBackend,type MailModuleDependencies} from '@decompozr/mail/server';
import {invocationContext} from '../modules/context.js';
import {mailAdminPresentation} from './admin.js';
import type {AppSettings} from '../server/settings.js';
export type {AppleCredential,MailModuleDependencies} from '@decompozr/mail/server';
export function createMailModule(settings:AppSettings,deps:Omit<MailModuleDependencies,'invocationContext'>){const module=createBackend(settings,{...deps,invocationContext});return{...module,admin:{...module.admin,presentation:mailAdminPresentation}};}
