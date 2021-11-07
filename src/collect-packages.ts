import { GlobPattern, Uri, workspace } from 'vscode';
import { dirname, join } from 'path';
import { limited } from './config'
import { ElementsWithContext } from './scanner';


export interface CollectOptions {
    levelsToDescend?: number,
    exclude?: GlobPattern
}

/**
 * takes package.json Uri and returs a list
 * of the package.json Uris of the corresponding deps
 * @param uri 
 */
export function collectDeps(uri:string, levelsToDescend = 1): Thenable<string[]> {
    return limited(() => workspace.openTextDocument(uri).then(async (doc) => {
        try {
            const pkg = JSON.parse(doc.getText());
            let deps = Object.keys({
                ...(pkg.dependencies || {}),
                ...(pkg.devDependencies || {})
            });
            deps = deps.map(d => join(dirname(uri), 'node_modules', d, 'package.json'));
            if(--levelsToDescend > 0 ) {
                deps = (await Promise.all(deps.map(d => collectDeps(join(dirname(uri), d), levelsToDescend)))).reduce((a, d) => [...a,...d], [])
            }
            deps = [
                ...deps,
                uri
            ]
            return deps.map(d => d);
        } catch(e) {
            return []
        }
    }));
}

/**
 * 1) takes a list of package.json files and recursively traverses them
 * via -> node_modules/[modules]/package.json -> etc..
 * recursively tracks all custom-elements fields pointed to by
 * package.json files.
 * 2) the discovered package.json files are loaded and parsed and their customElements
 * field is extracted to produce a final list of paths to customData.json files
 */
export async function collectCustomElementJsons(uris:Uri[], options: CollectOptions = {
    levelsToDescend: 1,
    exclude: ''
}): Promise<ElementsWithContext[]> {
    const {
        levelsToDescend = 1,
        exclude = ''
    } = options;
    let pkgs = await Promise.all(uris.map(uri => collectDeps(uri.fsPath, levelsToDescend)));

    // make list of package.jsons unique
    pkgs = pkgs.filter((v, i, a) => a.indexOf(v) === i)

    const pkgList = pkgs.flat();
    const fields = await Promise.all(pkgList.map((pkg) => limited(async () => {
        try {
            const file = await workspace.openTextDocument(Uri.parse(pkg));
            const json = JSON.parse(file.getText());
            return {
                provider: json.name ? json.name.split('/').join(' ') : undefined,
                uri: Uri.parse(join( dirname(pkg), json.customElements))
            }
        } catch(e) {
            return undefined;
        }
    })));
    return fields.filter(f => !!f);
}