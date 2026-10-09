import type {AdminPresentation} from '../admin/page.js';
import {renderCredential} from '../../dist/ui/index.js';
import {studioCopy} from '../ui/studio.js';
export const mailAdminPresentation:AdminPresentation={
 capabilities: [{id:'read',copyKey:'capabilityRead'},{id:'write',copyKey:'capabilityWrite'},{id:'send',copyKey:'capabilitySend'},{id:'unsubscribe',copyKey:'capabilityUnsubscribe'}],
 credentialStepLabel:'stepMail',
 credentialSection:admin=>renderCredential(admin,studioCopy)
};
