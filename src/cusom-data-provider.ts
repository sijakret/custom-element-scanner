import {
  TextDocumentContentProvider,
  Uri,
  window,
  EventEmitter,
  workspace,
  TreeItem,
  TreeDataProvider,
  TreeItemCollapsibleState,
  ThemeIcon,
  FileStat,
  MarkdownString,
} from "vscode";
import { ElementsWithContext, IScanner } from "./scanner";
import { Schema, validate } from "jsonschema";
import { transform } from "./schema-transform";
import mergeWith from "lodash.mergewith";
import { basename } from "path";
import { limited } from "./config";
import { fsStat, isSameFile } from "./utils";

// name of virtual file doesn't really matter
const VIRTUAL_FILENAME = "data.json";

const decoder = new TextDecoder("utf-8");

interface VSCodeData {
  tags: {
    name: string;
    description: string;
  }[];
}
interface ElementsWithContextAndStats extends ElementsWithContext {
  stats?: FileStat;
}
/**
 * validates, merges and exposes the documents
 * the data files need to be mergable json files
 * array alements will be concatinated during merge.
 */
export class CustomDataProvider
  implements TextDocumentContentProvider, TreeDataProvider<TreeItem>
{
  // emitter and its event
  onDidChangeEmitter = new EventEmitter<Uri>();
  onDidChange = this.onDidChangeEmitter.event;
  onDidChangeTreeDataEmitter = new EventEmitter<TreeItem | undefined>();
  onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  // stores combined data
  private _data = {};
  private _scanning: boolean | undefined = undefined;
  private uri: Uri;
  private _customElements: TreeItem[] = [];

  constructor(
    private _scanner: IScanner,
    private scheme: string,
    private schema: Schema
  ) {
    this._scanner.onDidDataChange.event((elements: ElementsWithContext[]) =>
      this.updateData(elements)
    );
    this._scanner.onDidStartScan.event(() => (this.scanning = true));
    this.uri = Uri.parse(`${this.scheme}:/${VIRTUAL_FILENAME}`);
  }

  /**
   * merges schemas, stores them in temp doc
   * which is kept in memory and served via provideTextDocumentContent
   */
  async updateData(elements: ElementsWithContext[]) {
    this.scanning = true;

    // combines doc, updates this.customElementFiles and this.data
    await this.mergeCustomElementsJson(elements);

    this.scanning = false;
  }

  /**
   * merges several custom element schemas
   * @param uris
   */
  async mergeCustomElementsJson(elements: ElementsWithContext[]) {
    // make uris unique

    let elementsWithStats = await Promise.all(
      elements.map((e) =>
        limited(async () => {
          let stats;
          try {
            stats = await fsStat(e.uri);
          } catch (e) {
            stats = undefined;
          }
          return {
            ...e,
            stats,
          } as ElementsWithContextAndStats;
        })
      )
    );
    elementsWithStats = elementsWithStats.filter((el) => el.stats);
    elementsWithStats = elementsWithStats.filter(
      (el, index, self) =>
        self.findIndex(
          (a) =>
            a.uri.toString() === el.uri.toString() ||
            isSameFile(a.stats, el.stats)
        ) === index
    );

    // combined final schema
    const allData = {};

    // parse files
    try {
      this.customElements = await Promise.all(
        elementsWithStats.map((element) =>
          limited(async () => {
            try {
              // parse files
              const bytes = await workspace.fs.readFile(element.uri);
              const json = JSON.parse(decoder.decode(bytes));
              // transform files to vscode format if needed
              const data = transform(json);
              // validate
              const { valid, errors } = validate(data, this.schema);
              // aggregate data
              if (data && valid) {
                mergeWith(
                  allData,
                  data,
                  function (objValue: unknown, srcValue: unknown) {
                    if (Array.isArray(objValue)) {
                      return objValue.concat(srcValue);
                    }
                  }
                );
              }
              // carry over last collapsibleState state
              const collapsed =
                this.customElements.find((n) => n.resourceUri === element.uri)
                  ?.collapsibleState || TreeItemCollapsibleState.Collapsed;
              const node = new CustomHTMLDataNode(
                element,
                valid ? data : undefined,
                errors.map((e) => e.toString()),
                collapsed
              );
              return node;
            } catch (e: any) {
              // TODO: somehow let user know a schema file did not parse
              return new CustomHTMLDataNode(
                element,
                undefined,
                e && e.toString ? [`${e.toString()}`] : ["Error: unknown"],
                TreeItemCollapsibleState.Collapsed
              );
            }
          })
        )
      );
    } catch (e: any) {
      this.customElements = [
        new TreeItem(`${e && e.toString ? e.toString() : "unknown"}`),
      ];
      return;
    }

    // implicitly signals update
    this.data = allData;
  }

  /**
   * getter and setter that will signal provider update
   */
  get scanning() {
    return !!this._scanning;
  }

  set scanning(scanning: boolean) {
    this._scanning = scanning;
    // signal data has changed to tree view
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  /**
   * getter and setter that will signal provider update
   */
  get customElements() {
    return [
      ...(this._scanning
        ? [
            (() => {
              const icon = new TreeItem("scanning..");
              return icon;
            })(),
          ]
        : []),
      ...this._customElements,
    ];
  }

  set customElements(items: TreeItem[]) {
    this._customElements = items;
    // signal data has changed to tree view
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  /**
   * getter and setter that will signal provider update
   */
  get data() {
    return this._data;
  }

  set data(data: any) {
    this._data = data;
    // signal the data has changed to html-language-service
    this.onDidChangeEmitter.fire(this.uri);
  }

  /**
   * TextDocumentContentProvider API
   * serve merged custom elements schema
   */
  provideTextDocumentContent(uri: Uri): string {
    if (uri.toString() !== this.uri.toString()) {
      throw new Error(`unknown document ${uri.toString()}`);
    }
    // provide joint custom element data
    return JSON.stringify(this.data);
  }

  /**
   * TreeDataProvider API
   */
  getTreeItem(element: CustomHTMLDataNode): TreeItem {
    return element;
  }

  getChildren(element?: CustomHTMLDataNode): Thenable<TreeItem[] | undefined> {
    if (!workspace.workspaceFolders?.length) {
      window.showInformationMessage("No dependency in empty workspace");
      return Promise.resolve([]);
    }

    if (!element) {
      if (this.scanning === undefined) {
        // not initialized!
        return Promise.resolve(undefined);
      }
      return Promise.resolve(this.customElements);
    } else if (element instanceof CustomHTMLDataNode) {
      return Promise.resolve(element.children);
    } else {
      return Promise.resolve(undefined);
    }
  }
}

export class CustomHTMLDataNode extends TreeItem {
  children: TreeItem[] | undefined;

  constructor(
    element: ElementsWithContext,
    data: VSCodeData | undefined,
    errors: string[],
    collapsibleState: TreeItemCollapsibleState
  ) {
    super(
      basename(element.uri.path),
      data && data.tags ? collapsibleState : TreeItemCollapsibleState.None
    );
    this.iconPath = ThemeIcon.File;
    this.label = basename(element.uri.path);
    this.resourceUri = element.uri;
    this.tooltip = element.uri.path;
    this.description = element.provider ? basename(element.provider) : "";
    this.contextValue = "file";

    if (errors.length > 0) {
      this.children = errors.map((e) => new TreeItem(e));
    } else {
      this.children = data
        ? (data as VSCodeData).tags.map((tag) => {
            const item = new TreeItem(tag.name);
            item.description = "tag";
            item.label = tag.name;
            item.resourceUri = Uri.parse("tag.html");
            item.tooltip = new MarkdownString(tag.description);
            return item;
          })
        : undefined;
    }
  }
}
