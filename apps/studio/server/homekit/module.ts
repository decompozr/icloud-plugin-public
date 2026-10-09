import {createHomeKitModule as createBackend,type HomeKitConfiguration,type HomeKitDependencies} from '@decompozr/homekit/server';
import {invocationContext,withInvocationContext} from '../modules/context.js';
export type {HomeKitConfiguration,HomeKitDependencies} from '@decompozr/homekit/server';
export function createHomeKitModule(config:HomeKitConfiguration,deps:Omit<HomeKitDependencies,'context'>){return createBackend(config,{...deps,context:{invocationContext,withInvocationContext}});}
