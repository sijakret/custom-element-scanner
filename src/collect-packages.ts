import { Uri, workspace } from 'vscode';
import { dirname, join } from 'path';

/**
 * takes package.json Uri and returs a list
 * of the package.json Uris of the corresponding deps
 * @param uri 
 */
export function collectDeps(uri:string, levelsToDescend = 1): Thenable<string[]> {
    return workspace.openTextDocument(uri).then(async (doc) => {
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
    });
}


/**
 * recursively tracks all custom-elements fields pointed to by
 * package.json files.
 */
export async function collectCustomElementJsons(uris:Uri[], levelsToDescend = 1): Promise<string[]> {
    let pkgs = await Promise.all(uris.map(uri => collectDeps(uri.fsPath, levelsToDescend)));

    // make list of package.jsons unique
    pkgs = pkgs.filter((v, i, a) => a.indexOf(v) === i)

    const fields = await Promise.all(pkgs.flat().map(async (pkg) => {
        try {
            const file = await workspace.openTextDocument(Uri.parse(pkg));
            return join( dirname(pkg), JSON.parse(file.getText()).customElements);
        } catch(e) {
            return '';
        }
    }));
    return fields.filter(f => !!f);
}