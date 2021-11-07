import { workspace, commands, ExtensionContext } from "vscode";
import pLimit, { LimitFunction } from 'p-limit';

export const configKey = 'customData';

/**
 * invokes cb with max concurrency defined in config
 */ 
export function limited(cb:() => PromiseLike<any>) {
    return limit(cb);
}

let limit:LimitFunction;
function globalSetup() {
    limit = pLimit(workspace.getConfiguration().get([configKey, 'concurrency'].join('.')) as number || 4);
}

// initial setup
globalSetup();

// update when config changes
workspace.onDidChangeConfiguration((e) => {
    if(e.affectsConfiguration([configKey, 'concurrency'].join('.'))) {
        globalSetup();
    }
})

/**
 * syncs certain options with menu item execution context
 */
export function setupContext({ subscriptions }: ExtensionContext){

    [
        ['mode','auto', 'manual']
    ].map(([option, ...vals]) => {
        const capsOption = option.substring(0,1).toUpperCase() + option.substring(1);
        const setContext = (val:unknown) => {
            commands.executeCommand('setContext', configKey+':'+option, val);
            workspace.getConfiguration(configKey).update(option, val);
        };
        vals.forEach(val => {
            const capsVal = val.substring(0,1).toUpperCase() + val.substring(1);
            subscriptions.push(
                commands.registerCommand(configKey+'.set'+capsOption+capsVal, () => {
                    setContext(val);
                })
            );
        })
        
        setContext(workspace.getConfiguration(configKey).get(option));
        
    })
   
}

