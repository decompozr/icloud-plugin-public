// Trusted bundled UI composition. Disabled policy never removes setup components.
import{moduleUi as mail}from'../../../../modules/mail/ui/index.js';
import{moduleUi as calendar}from'../../../../modules/calendar/ui/index.js';
import{moduleUi as photos}from'../../../../modules/photos/ui/index.js';
import{moduleUi as homekit}from'../../../../modules/homekit/ui/index.js';
export const bundledModules=[mail,calendar,photos,homekit] as const;
export const scopeCopy=Object.assign({},...bundledModules.map(module=>module.scopeCopy)) as Record<string,string>;
