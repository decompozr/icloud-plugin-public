import {createCalendarModule as createBackend,type CalendarModuleDependencies} from '@decompozr/calendar/server';
import {invocationContext} from '../modules/context.js';
import type {AppSettings} from '../server/settings.js';
export type {CalendarCredential,CalendarModuleDependencies} from '@decompozr/calendar/server';
export function createCalendarModule(settings:AppSettings,deps:Omit<CalendarModuleDependencies,'invocationContext'>){return createBackend(settings,{...deps,invocationContext});}
