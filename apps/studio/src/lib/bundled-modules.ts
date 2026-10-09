// Trusted bundled UI composition. Disabled policy never removes setup components.
import{moduleUi as mail}from'@decompozr/mail/ui';
import{moduleUi as calendar}from'@decompozr/calendar/ui';
import{moduleUi as photos}from'@decompozr/photos/ui';
import{moduleUi as homekit}from'@decompozr/homekit/ui';
export const bundledModules=[mail,calendar,photos,homekit] as const;
export const scopeCopy=Object.assign({},...bundledModules.map(module=>module.scopeCopy)) as Record<string,string>;

import{registeredModulePages}from'@decompozr/ui/module-host.js';
export const modulePages=registeredModulePages(bundledModules);
export function modulePageExists(path:string){return modulePages.some(page=>page.path===path)}
