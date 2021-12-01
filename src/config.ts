import { workspace, commands, ExtensionContext, WorkspaceConfiguration, ConfigurationChangeEvent } from "vscode";
import pLimit, { LimitFunction } from 'p-limit';

//
export const configKey = 'customElementScanner';

export const CFG_MODE = 'mode';
export const CFG_MODE_AUTO = 'auto';
export const CFG_MODE_MANUAL = 'manual';

export const CFG_DISPLAY_MODE = 'displayMode';
export const CFG_DISPLAY_MODE_FILES = 'files';
export const CFG_DISPLAY_MODE_TAGS = 'tags';

export const CFG_PATHS = 'paths';

export function getConfiguration(){
    return workspace.getConfiguration(configKey);
}

export function affectsConfiguration(e:ConfigurationChangeEvent, key?:string[] | string) {
    key = typeof key === 'string' ? [key] : key
    return e.affectsConfiguration([configKey, ...(key ? key : [])].join('.'));
}

/**
 * invokes cb with max concurrency defined in config
 */ 
export function limited(cb:() => PromiseLike<any>) {
    return limit(cb);
}

let limit:LimitFunction;
function globalSetup() {
    limit = pLimit(getConfiguration().get('concurrency') as number || 4);
}

// initial setup
globalSetup();

// update when config changes
workspace.onDidChangeConfiguration((e) => {
    if(affectsConfiguration(e, 'concurrency')) {
        globalSetup();
    }
})

/**
 * syncs certain options with menu item execution context
 */
export function setupContext({ subscriptions }: ExtensionContext){

    [
        [CFG_MODE, CFG_MODE_AUTO, CFG_MODE_MANUAL],
        [CFG_DISPLAY_MODE, CFG_DISPLAY_MODE_FILES, CFG_DISPLAY_MODE_TAGS]
    ].map(([option, ...vals]) => {
        const capsOption = option.substring(0,1).toUpperCase() + option.substring(1);
        const setContext = (val:unknown) => {
            commands.executeCommand('setContext', configKey+':'+option, val);
            getConfiguration().update(option, val);
        };
        subscriptions.push(workspace.onDidChangeConfiguration((e) => {
            if(affectsConfiguration(e, option)) {
                commands.executeCommand('setContext', configKey+':'+option, getConfiguration().get(option));
            }
        }));
        vals.forEach(val => {
            const capsVal = val.substring(0,1).toUpperCase() + val.substring(1);
            subscriptions.push(
                commands.registerCommand(configKey+'.set'+capsOption+capsVal, () => {
                    setContext(val);
                })
            );
        })
        
        setContext(getConfiguration().get(option));
        
    })
   
}

