import { Uri, EventEmitter, workspace, FileSystemWatcher, Disposable} from "vscode";
import { collectCustomElementJsons } from "./collect-packages";
import { configKey } from './config';

export interface ElementsWithContext {
    uri: Uri,
    provider?: string
}
export interface IScanner {
    onDidDataChange: EventEmitter<ElementsWithContext[]>
    onDidStartScan: EventEmitter<void>
    refresh: () => void
}

/**
 * jam on this: https://github.com/zignd/HTML-CSS-Class-Completion/blob/master/src/fetcher.ts
 */
class Scanner implements IScanner {

    private _watcher?: FileSystemWatcher
    onDidDataChange = new EventEmitter<ElementsWithContext[]> ();
    onDidStartScan = new EventEmitter<void>();
    private uris: ElementsWithContext[] = [];

    constructor(private _rootConfigKey:string) {
        this.setup();
        workspace.onDidChangeConfiguration((e) => {
            if(e.affectsConfiguration(this._rootConfigKey)) {
                this.setup();
            }
        })
    }

    get config() {
        const configuration = workspace.getConfiguration();
        return  {
            enabled: configuration.get(`${this._rootConfigKey}.enabled`) as string,
            include: configuration.get(`${this._rootConfigKey}.include`) as string,
            exclude: configuration.get(`${this._rootConfigKey}.exclude`) as string
        } 
    }

    refresh() {
        this.setup();
    }

    async setup() {
        if(!this.config.enabled) {
            return;
        }
        this.onDidStartScan.fire();
        this._watcher?.dispose();
        /**
         * This is not neccessarily very correct.
         * The thinking is: we use changes to the package.json
         * to trigger a rescan for custom elements.json
         */
        this.uris = (await workspace.findFiles(`${this.config.include}`, `${this.config.exclude}`)).map(uri => ({uri}));
        this._watcher = workspace.createFileSystemWatcher(`${this.config.include}`);
        this._watcher.onDidChange(() => this.update());
        this._watcher.onDidCreate((uri:Uri) => {
            this.uris.push({uri});
            this.update();
        });
        this._watcher.onDidDelete((e:Uri) => {
            const str = e.toString();
            this.uris = this.uris.filter(u => u.toString() !== str);
            this.update();
        });

        this.update();
    }

    async update() {
        this.onDidDataChange.fire(this.uris);
    }

    dispose() {
        this._watcher?.dispose();
    }
}


/**
 * creates composed scanner
 * based on configuration it will scan for package.json files and extract
 * the corresponding customElements fields AND/OR for customElements.json files
 */

export function createScanner(): IScanner {
    const watching: Disposable[] = []
    const dispose = () => {
        watching.forEach(w => w.dispose())
    }
    const scanner = {
        onDidDataChange: new EventEmitter<ElementsWithContext[]> (),
        onDidStartScan: new EventEmitter<void>(),
        dispose() {
            dispose();
        },
        refresh() {
            pkgScanner.refresh();
            elementsScanner.refresh();
        }
    }
    // composed scanner that will detecte element.json files
    // either directly or via package.json files
    const pkgScanner = new Scanner([configKey, 'package-json'].join('.'));
    const elementsScanner = new Scanner([configKey, 'custom-elements'].join('.'));

    let paths:ElementsWithContext[];
    const update = () => scanner.onDidDataChange.fire(paths);
    pkgScanner.onDidDataChange.event(async (elements:ElementsWithContext[]) => {
        // dispose old stuff
        dispose();
        // at this point we have all package.json files that were
        // discovered by the vscode apis via findFiles/watch
        // map package.json files to custom-elements fields
        paths = await collectCustomElementJsons(elements.map(e => e.uri), {
            exclude: pkgScanner.config.exclude
        });
        // watch all the custom elements files explicitly
        paths.map(({uri}) => {
            const watcher = workspace.createFileSystemWatcher(uri.toString());
            watching.push(watcher.onDidChange(() => update()));
            watching.push(watcher.onDidDelete((e:Uri) => update()));
            watching.push(watcher);
        })
        update();
    })
    elementsScanner.onDidDataChange.event((elements) => scanner.onDidDataChange.fire(elements));
    pkgScanner.onDidStartScan.event(() => scanner.onDidStartScan.fire());
    elementsScanner.onDidStartScan.event(() => scanner.onDidStartScan.fire());
    
    return scanner;
}

