
import vscode, { TextDocumentContentProvider, Uri, window, EventEmitter, workspace, TreeItem, TreeDataProvider, TreeItemCollapsibleState, ThemeIcon } from 'vscode';
import { ElementsWithContext, IScanner } from './scanner';
import { Schema, validate } from 'jsonschema'
import { transform } from './schema-transform';
import mergeWith from 'lodash.mergewith';
import { basename } from 'path';
import { limited } from './config'

// name of virtual file doesn't really matter
const VIRTUAL_FILENAME = 'data.json';

interface VSCodeData {
    tags: {
        name: string
    }[]
};
/**
 * validates, merges and exposes the documents
 * the data files need to be mergable json files
 * array alements will be concatinated during merge.
 */
export class CustomDataProvider implements TextDocumentContentProvider, TreeDataProvider<TreeItem> {
    // emitter and its event
    onDidChangeEmitter = new EventEmitter<Uri>();
    onDidChange = this.onDidChangeEmitter.event;
    onDidChangeTreeDataEmitter = new EventEmitter<CustomHTMLDataNode>();
    onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    // stores combined data
    private _data = {};
    private _scanning = true;
    private uri: Uri;
    private _customElementFiles: TreeItem[] = []

    constructor(private _scanner: IScanner, private scheme: string, private schema: Schema) {
        this._scanner.onDidDataChange.event((elements: ElementsWithContext[]) => this.updateData(elements));
        this._scanner.onDidStartScan.event(() => this.scanning = true);
        this.uri = Uri.parse(`${this.scheme}:/${VIRTUAL_FILENAME}`);

        this.scanning = true;
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
        elements = elements.filter((value, index, self) => self.findIndex((a) => 
            a.uri.toString() === value.uri.toString()
        ) === index)

        // parse files
        try {
            this.customElementFiles = await Promise.all(elements.map((element) => limited(async () => {
                try {
                    // parse files
                    const json = JSON.parse((await workspace.openTextDocument(element.uri)).getText());
                    // transform files to vscode format if needed
                    const data = transform(json, element.uri.toString());
                    // validate
                    const { valid, errors } = validate(data, this.schema);
                    // carry over last collapsibleState state
                    const collapsed = this.customElementFiles.find(n => n.resourceUri === element.uri)?.collapsibleState || TreeItemCollapsibleState.Collapsed;
                    const node = new CustomHTMLDataNode(element, valid ? data : undefined, errors.map(e => e.toString()), collapsed);
                    return node;
                } catch (e: any) {
                    // TODO: somehow let user know a schema file did not parse
                    return new CustomHTMLDataNode(element, undefined, e && e.toString ? [`${e.toString()}`] : ['Error: unknown'], TreeItemCollapsibleState.Collapsed);
                }
            })));

        } catch (e: any) {
            this.customElementFiles = [
                new TreeItem(`${e && e.toString ? e.toString() : 'unknown'}`)
            ]
            return;
        }

        // combined doc
        const data = {};

        // aggregate data
        (this.customElementFiles as CustomHTMLDataNode[]).forEach((node: CustomHTMLDataNode) => {
            node.data && mergeWith(data, node.data, function (objValue: unknown, srcValue: unknown) {
                if (Array.isArray(objValue)) {
                    return objValue.concat(srcValue);
                }
            });
        });

        this.data = data;
    }

     /**
     * getter and setter that will signal provider update
     */
    get scanning() {
        return this._scanning;
    }

    set scanning(scanning: boolean) {
        this._scanning = scanning;
        // signal data has changed to tree view
        this.onDidChangeTreeDataEmitter.fire(undefined)
    }


    /**
     * getter and setter that will signal provider update
     */
     get customElementFiles() {
        return [
            ...( this._scanning ? [
                (()  => {
                    const icon = new TreeItem('scanning..');
                    return icon;
                })()
            ] : []),
            ...this._customElementFiles
        ]
    }

    set customElementFiles(items: TreeItem[]) {
        this._customElementFiles = items;
        // signal data has changed to tree view
        this.onDidChangeTreeDataEmitter.fire(undefined)
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
        return JSON.stringify(this.data)
    }

    /**
     * TreeDataProvider API
     */
    getTreeItem(element: CustomHTMLDataNode): TreeItem {
        return element;
    }

    getChildren(element?: CustomHTMLDataNode): Thenable<TreeItem[] | undefined> {
        if (!workspace.workspaceFolders?.length) {
            window.showInformationMessage('No dependency in empty workspace');
            return Promise.resolve([]);
        }

        if (!element) {
            return Promise.resolve(this.customElementFiles);
        } else if (element instanceof CustomHTMLDataNode) {
            return Promise.resolve(element.tags);
        } else {
            return Promise.resolve(undefined);
        }
    };
}


export class CustomHTMLDataNode extends TreeItem {

    constructor(
        public element: ElementsWithContext,
        public data: VSCodeData | undefined,
        public errors: string[],
        public readonly collapsibleState: TreeItemCollapsibleState
    ) {
        super(basename(element.uri.path), data && data.tags ? collapsibleState : TreeItemCollapsibleState.None);
        this.iconPath = ThemeIcon.File;
        this.label = basename(element.uri.path);
        this.resourceUri = element.uri;
        this.tooltip = element.uri.path;
        this.description = element.provider ? basename(element.provider) : '';
        this.contextValue = 'file';
    }
    
    get tags() {
        if(this.errors.length > 0) {
            return this.errors.map(e => new TreeItem(e));
        }
        return this.data ? (this.data as VSCodeData).tags.map(tag => {
            const item = new TreeItem(tag.name);
            item.description = 'tag'
            item.label = tag.name;
            item.resourceUri = Uri.parse('fake/tag.html')
            return item;
        }) : undefined
    }
}
