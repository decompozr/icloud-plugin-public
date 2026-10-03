import type {MailOperations} from '../domain/mail.js';
import type {UnsubscribeOperations} from '../domain/unsubscribe.js';
import type {OutboundOperations} from '../domain/outbound.js';
import type {Config} from '../config.js';
import type {OperationMonitor} from '../../observability/operations.js';
import {ModuleRuntime} from '../../modules/runtime.js';
import {createServer as createHost} from '../../mcp/server.js';
import {mailRegistration} from './tools.js';
/** Mail-owned convenience composition for adapter and protocol fixtures. */
export function createServer(mail:MailOperations,config:Config,scopes:ReadonlySet<string>,unsubscribe?:UnsubscribeOperations,outbound?:OutboundOperations,monitor?:OperationMonitor){
 return createHost(new ModuleRuntime().register(mailRegistration(mail,config,unsubscribe,outbound,monitor)),config.publicUrl,scopes);
}
