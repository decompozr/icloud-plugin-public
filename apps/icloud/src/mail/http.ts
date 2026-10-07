import {createHttpApp as createHost} from '../server/http.js';
import {ModuleRuntime} from '../modules/runtime.js';
import {mailRegistration} from './mcp/tools.js';
import type {Config} from './config.js';
import type {MailOperations} from './domain/mail.js';
import type {UnsubscribeOperations} from './domain/unsubscribe.js';
import type {OutboundOperations} from './domain/outbound.js';
import {OperationMonitor} from '../observability/operations.js';
import {HttpLifecycle} from '../server/lifecycle.js';
import {createVerifier} from '../../../../modules/account/dist/index.js';
/** Mail fixture composition; production registers the complete module factory. */
export function createHttpApp(config:Config,mail:MailOperations,verify=createVerifier(config),unsubscribe?:UnsubscribeOperations,outbound?:OutboundOperations,monitor=new OperationMonitor(),lifecycle=new HttpLifecycle()){
 return createHost(config,new ModuleRuntime().register(mailRegistration(mail,config,unsubscribe,outbound,monitor)),verify,lifecycle);
}
