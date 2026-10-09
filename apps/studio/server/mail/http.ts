import {createHttpApp as createHost} from '../server/http.js';
import {ModuleRuntime} from '../modules/runtime.js';
import {mailRegistration} from '@decompozr/mail/server/mcp/tools.js';
import type {Config} from '@decompozr/mail/server/config.js';
import type {MailOperations} from '@decompozr/mail/server/domain/mail.js';
import type {UnsubscribeOperations} from '@decompozr/mail/server/domain/unsubscribe.js';
import type {OutboundOperations} from '@decompozr/mail/server/domain/outbound.js';
import {OperationMonitor} from '../observability/operations.js';
import {HttpLifecycle} from '../server/lifecycle.js';
import {createVerifier} from '@decompozr/account/server';
/** Mail fixture composition; production registers the complete module factory. */
export function createHttpApp(config:Config,mail:MailOperations,verify=createVerifier(config),unsubscribe?:UnsubscribeOperations,outbound?:OutboundOperations,monitor=new OperationMonitor(),lifecycle=new HttpLifecycle()){
 return createHost(config,new ModuleRuntime().register(mailRegistration(mail,config,unsubscribe,outbound,monitor)),verify,lifecycle);
}
