/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TextEncoder } from 'util';
import { IScanner } from './scanner';
import { Schema, validate } from 'jsonschema';
import mergeWith from 'lodash.mergewith';

export class File implements vscode.FileStat {

    type: vscode.FileType;
    ctime: number;
    mtime: number;
    size: number;

    constructor(data:Uint8Array) {
        this.type = vscode.FileType.File;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = data.length;
    }
}

export class MemFS implements vscode.FileSystemProvider {

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

  private static filename = 'data.json';
  private uri = vscode.Uri.parse(`${this.scheme}:${MemFS.filename}`);
  private watcher = vscode.workspace.createFileSystemWatcher(this.uri.toString());
  private data = new Uint8Array();

  constructor(private _scanner: IScanner, private scheme:string, private schema: Schema) {
    this._scanner.onDidDataChange.event((uris:vscode.Uri[]) => this.mergeAndSignal(uris));
  }

  async mergeAndSignal(uris:vscode.Uri[]) {
    // parse files
    let docs = await Promise.all(uris.map(async (uri) => {
        try {
            const str = (await vscode.workspace.openTextDocument(uri)).getText();
            return JSON.parse(str);
        } catch(e) {
            return undefined
        }
    }));
    
    // validate files
    docs = docs.filter(doc => {
        const result = validate(doc, this.schema);
        // TODO: somehow let user know a data file did not validate
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

    // convert to buffer
    this.data = new TextEncoder().encode(JSON.stringify(data));

    // signal the data has changed
    setTimeout(() => {
      this._emitter.fire([{
        type: vscode.FileChangeType.Changed,
        uri: this.uri
      }]);
    }, 5);
  }

  // returns fs info for buffer
  stat(_uri: vscode.Uri): vscode.FileStat {
    return new File(this.data);
  }

  // returns actual data
  readFile(_uri: vscode.Uri): Uint8Array {
    return this.data;
  }

  // everything below is pretty much non functional
  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    throw vscode.FileSystemError.FileNotFound(uri);
  }
  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void {
    throw vscode.FileSystemError.FileNotFound(uri);
  }
  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
    throw vscode.FileSystemError.FileNotFound(oldUri);
  }
  delete(uri: vscode.Uri): void {
    throw vscode.FileSystemError.FileNotFound(uri);
  }
  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.FileNotFound(uri);
  }
  watch(_resource: vscode.Uri): vscode.Disposable {
    // ignore, fires for all changes...
    return new vscode.Disposable(() => { });
  }
}
