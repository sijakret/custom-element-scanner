
import { TextDocumentContentProvider, Uri, EventEmitter, workspace } from 'vscode';
import { IScanner } from './scanner';
import { Schema, validate } from 'jsonschema'
import { transform } from './schema-transform';
import mergeWith from 'lodash.mergewith';

// name of virtual file doesn't really matter
const VIRTUAL_FILENAME = 'data.json';

/**
 * validates, merges and exposes the documents
 * the data files need to be mergable json files
 * array alements will be concatinated during merge.
 */
export class CustomDataProvider implements TextDocumentContentProvider {
    // emitter and its event
    onDidChangeEmitter = new EventEmitter<Uri>();
    onDidChange = this.onDidChangeEmitter.event;

    // stores combined data
    private data = {}
    private uri: Uri;
    
    constructor(private _scanner: IScanner, private scheme:string, private schema: Schema) {
        this._scanner.onDidDataChange.event((uris:Uri[]) => this.updateData(uris));
        this.uri = Uri.parse(`${this.scheme}:/${VIRTUAL_FILENAME}`);
    }

    /**
     * merges schemas, stores them in temp doc
     * which is kept in memory and served via provideTextDocumentContent
     */
    async updateData(uris:Uri[]) {
        // combined doc
        this.data = await this.mergeCustomElementsJson(uris);

        // signal the data has changed
        this.onDidChangeEmitter.fire(this.uri);
    }

    /**
     * merges several custom element schemas
     * @param uris 
     */
    async mergeCustomElementsJson(uris:Uri[]) {
        // make uris unique
        uris = [...new Set(uris.map(u => u.toString()))].map(u => Uri.parse(u));

        // parse files
        let docs = await Promise.all(uris.map(async (uri) => {
            try {
                const str = (await workspace.openTextDocument(uri)).getText();
                return transform(JSON.parse(str), uri.toString());
            } catch(e) {
                // TODO: somehow let user know a schema file did not parse
                return undefined
            }
        }));

        // filter out empty files
        docs = docs.filter(doc => !!doc);
        
        // validate files
        docs = docs.filter(doc => {
            const result = validate(doc, this.schema);
            // TODO: somehow let user know a schema file did not validate
            return result.valid;
        });
        
        // combined doc
        const data = {} 
        
        // aggregate data
        docs.forEach(doc => {
            mergeWith(data, doc, function (objValue: unknown, srcValue: unknown) {
                if (Array.isArray(objValue)) {
                    return objValue.concat(srcValue);
                }
            });
        });
        return data;
    }

    
    /**
     * serve merged custom elements schema
     */
    provideTextDocumentContent(uri: Uri): string {
        if(uri.toString() !== this.uri.toString()) {
            throw new Error(`unknown document ${uri.toString()}`);
        }
        // provide joint custom element data
        return JSON.stringify(this.data)
    }
};

