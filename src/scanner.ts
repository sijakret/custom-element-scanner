import {
  Uri,
  EventEmitter,
  workspace,
  FileSystemWatcher,
  Disposable,
} from "vscode";
import { collectCustomElementJsons, CollectOptions } from "./collect-packages";
import {
  CFG_MODE,
  CFG_MODE_AUTO,
  CFG_PATHS,
  getConfiguration,
  affectsConfiguration,
  CFG_MODE_MANUAL,
} from "./config";
import {
  normalizePath,
  normalizeUri,
  relativeWorkspacePath,
  workspacePathToPath,
} from "./utils";

export interface ElementsWithContext {
  uri: Uri;
  provider?: string;
}
export interface IScanner {
  onDidDataChange: EventEmitter<ElementsWithContext[]>;
  onDidStartScan: EventEmitter<void>;
  onSubscribed?: () => void;
  refresh: () => void;
}

function serializeElementsWithContext(e: ElementsWithContext): string {
  return `${e.provider || ""}:/${relativeWorkspacePath(e.uri.toString())}`;
}
function deserializeElementsWithContext(e: string): ElementsWithContext {
  const split = e.split(":/");
  return {
    provider: split[0] || undefined,
    uri: Uri.parse(workspacePathToPath(split.slice(1).join(":/"))),
  };
}

/**
 * jam on this: https://github.com/zignd/HTML-CSS-Class-Completion/blob/master/src/fetcher.ts
 */
class Scanner implements IScanner {
  private _watcher?: FileSystemWatcher;
  onDidDataChange = new EventEmitter<ElementsWithContext[]>();
  onDidStartScan = new EventEmitter<void>();
  private uris: ElementsWithContext[] = [];

  constructor(private _rootConfigKey: string) {
    workspace.onDidChangeConfiguration((e) => {
      // will not fire on this.config.mode!!
      if (affectsConfiguration(e)) {
        this.setup();
      }
    });
  }

  get config() {
    const configuration = workspace.getConfiguration();
    return {
      mode: getConfiguration().get(CFG_MODE),
      enabled: getConfiguration().get(
        `${this._rootConfigKey}.enabled`
      ) as string,
      include: getConfiguration().get(
        `${this._rootConfigKey}.include`
      ) as string,
      exclude: getConfiguration().get(
        `${this._rootConfigKey}.exclude`
      ) as string,
    };
  }

  refresh() {
    this.setup(true);
  }

  async setup(force: boolean = false) {
    if (!this.config.enabled) {
      return;
    }
    if (!force && this.config.mode !== CFG_MODE_AUTO) {
      return;
    }
    this.onDidStartScan.fire();
    this._watcher?.dispose();
    /**
     * This is not neccessarily very correct.
     * also probably leads to excessive scanning!
     */
    this.uris = (
      await workspace.findFiles(
        `${this.config.include}`,
        `${this.config.exclude}`
      )
    ).map((uri) => ({ uri: normalizeUri(uri) }));
    this._watcher = workspace.createFileSystemWatcher(`${this.config.include}`);
    this._watcher.onDidChange(() => this.update());
    this._watcher.onDidCreate((uri: Uri) => {
      this.uris.push({ uri: normalizeUri(uri) });
      this.update();
    });
    this._watcher.onDidDelete((e: Uri) => {
      const str = normalizePath(e.toString());
      this.uris = this.uris.filter((u) => u.toString() !== str);
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
  const watching: Disposable[] = [];
  let options: CollectOptions | undefined;

  const dispose = () => {
    watching.forEach((w) => w.dispose());
  };
  const scanner = {
    onDidDataChange: new EventEmitter<ElementsWithContext[]>(),
    onDidStartScan: new EventEmitter<void>(),
    dispose() {
      dispose();
    },
    refresh() {
      pkgScanner.refresh();
      elementsScanner.refresh();
    },
  } as IScanner;

  const store = (force = false) => {
    if (force || getConfiguration().get(CFG_MODE) === CFG_MODE_MANUAL) {
      const paths = [...pkgPaths, ...elemPaths].map((p) =>
        serializeElementsWithContext(p)
      );
      const unique = paths.filter((p, i, a) => a.indexOf(p) === i);
      if (!unique.length) {
        getConfiguration().update(CFG_PATHS, undefined);
      } else {
        getConfiguration().update(CFG_PATHS, unique);
      }
    }
  };
  const load = () => {
    // get stored elemPaths from config
    elemPaths = (getConfiguration().get<string[]>(CFG_PATHS) || []).map((p) =>
      deserializeElementsWithContext(p)
    );
    pkgPaths = []; // only storing custom-elements.json files for now
  };

  workspace.onDidChangeConfiguration((e) => {
    if (affectsConfiguration(e, CFG_MODE)) {
      if (pkgScanner.config.mode === CFG_MODE_AUTO) {
        scanner.refresh();
      }
      if (pkgScanner.config.mode === CFG_MODE_MANUAL) {
        // switching to manual mode
        // salvage what has been discovered in automatic mode
        store(true);
      }
    }
    if (
      affectsConfiguration(e, CFG_PATHS) &&
      pkgScanner.config.mode === CFG_MODE_MANUAL
    ) {
      load();
      update(false);
    }
  });

  // composed scanner that will detect element.json files
  // either directly or via package.json files
  let pkgPaths: ElementsWithContext[] = [];
  let elemPaths: ElementsWithContext[] = [];
  load();

  const pkgScanner = new Scanner("package-json");
  const elementsScanner = new Scanner("custom-elements");

  // emit merged customElement files discovered via filesystem directly
  // and via customElements fields in package.json files
  const update = async (updateConfig = true) => {
    updateConfig && store();
    scanner.onDidDataChange.fire([...pkgPaths, ...elemPaths]);
  };

  const scan = async (elements: ElementsWithContext[]) => {
    // cancels last request
    options && (options.cancelled = true);
    // new request
    (async (options: CollectOptions) => {
      // dispose old stuff
      dispose();
      scanner.onDidStartScan.fire();
      // at this point we have all package.json files that were
      // discovered by the vscode apis via findFiles/watch
      // map package.json files to custom-elements fields
      pkgPaths = await collectCustomElementJsons(
        elements.map((e) => e.uri),
        options
      );
      // watch all the custom elements files explicitly
      if (!options.cancelled) {
        // pkgPaths.forEach(({uri}) => {
        //     const ws = workspace.workspaceFolders && workspace.workspaceFolders[0].uri.path;
        //     const wsPath = relative(ws || '', uri.path);
        //     const watcher = workspace.createFileSystemWatcher(uri.path);
        //     watching.push(watcher.onDidChange(() => update()));
        //     watching.push(watcher.onDidDelete((e:Uri) => update()));
        //     watching.push(watcher);
        // });
        update();
      }
    })(
      (options = {
        exclude: pkgScanner.config.exclude,
      })
    );
  };
  pkgScanner.onDidDataChange.event(scan);
  pkgScanner.onDidStartScan.event(() => scanner.onDidStartScan.fire());

  elementsScanner.onDidDataChange.event((elements) => {
    elemPaths = elements;
    update();
  });
  elementsScanner.onDidStartScan.event(() => scanner.onDidStartScan.fire());
  if (elemPaths.length) {
    // will be called by scanner first thing
    scanner.onSubscribed = () => {
      update(false);
    };
  }
  // initial refresh in auto mode
  if (getConfiguration().get(CFG_MODE) === CFG_MODE_AUTO) {
    scanner.refresh();
  }
  return scanner;
}
