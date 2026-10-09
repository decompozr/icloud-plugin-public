import type {MailOperations} from '@decompozr/mail/server/domain/mail.js';
import type {UnsubscribeOperations} from '@decompozr/mail/server/domain/unsubscribe.js';
import type {OutboundOperations} from '@decompozr/mail/server/domain/outbound.js';
import type {Config} from '@decompozr/mail/server/config.js';
import type {OperationMonitor} from '../../observability/operations.js';
import {ModuleRuntime} from '../../modules/runtime.js';
import {createServer as createHost} from '../../mcp/server.js';
import {mailRegistration} from '@decompozr/mail/server/mcp/tools.js';
/** Mail-owned convenience composition for adapter and protocol fixtures. */
export function createServer(mail:MailOperations,config:Config,scopes:ReadonlySet<string>,unsubscribe?:UnsubscribeOperations,outbound?:OutboundOperations,monitor?:OperationMonitor){
 return createHost(new ModuleRuntime().register(mailRegistration(mail,config,unsubscribe,outbound,monitor)),config.publicUrl,scopes);
}
