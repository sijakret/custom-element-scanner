import { Uri, EventEmitter, workspace, FileSystemWatcher} from "vscode";
import { collectCustomElementJsons } from "./collect-packages";
import { configKey } from './config';

export interface IScanner {
    onDidDataChange: EventEmitter<Uri[]>
}

/**
 * jam on this: https://github.com/zignd/HTML-CSS-Class-Completion/blob/master/src/fetcher.ts
 */
class Scanner implements IScanner {

    private _watcher?: FileSystemWatcher
    onDidDataChange = new EventEmitter<Uri[]> ();
    private uris: Uri[] = [];

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

    async setup() {
        if(!this.config.enabled) {
            return;
        }
        this._watcher?.dispose();
        /**
         * This is not neccessarily very correct.
         * The thinking is: we use changes to the package.json
         * to trigger a rescan for custom elements.json
         */
        this.uris = await workspace.findFiles(`${this.config.include}`, `${this.config.exclude}`);
        this._watcher = workspace.createFileSystemWatcher(`${this.config.include}`);
        this._watcher.onDidChange(() => this.update());
        this._watcher.onDidCreate((e:Uri) => {
            this.uris.push(e);
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
    const scanner = {
        onDidDataChange: new EventEmitter<Uri[]> ()
    }
    // composed scanner that will detecte element.json files
    // either directly or via package.json files
    {
        const pkgScanner = new Scanner([configKey, 'package-json'].join('.'));
        const elementsScanner = new Scanner([configKey, 'custom-elements'].join('.'));

        pkgScanner.onDidDataChange.event(async (uris:Uri[]) => {
            // at this point we have all package.json files that were
            // discovered by the vscode apis via findFiles/watch
            // map package.json files to custom-elements fields
            const paths = await collectCustomElementJsons(uris, {
                exclude: pkgScanner.config.exclude
            });
            scanner.onDidDataChange.fire(paths.map(p => Uri.parse(p)));
        })
        elementsScanner.onDidDataChange.event((uris) => scanner.onDidDataChange.fire(uris));
    }
    return scanner;
}

