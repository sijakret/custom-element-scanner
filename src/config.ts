import { workspace } from "vscode";
import pLimit, { LimitFunction } from 'p-limit';

export const configKey = 'custom-data-scan';

/**
 * invokes cb with max concurrency defined in config
 */ 
export function limited(cb:() => any) {
    return limit(cb);
}

let limit:LimitFunction;
function globalSetup() {
    limit = pLimit(workspace.getConfiguration().get([configKey, 'concurrency'].join('.')) as number);
}
workspace.onDidChangeConfiguration((e) => {
    if(e.affectsConfiguration([configKey, 'concurrency'].join('.'))) {
        globalSetup();
    }
})
