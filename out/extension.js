"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const vscode_1 = require("vscode");
const cusom_data_provider_1 = require("./cusom-data-provider");
const html_schema_1 = __importDefault(require("./html.schema"));
const scanner_1 = require("./scanner");
const config_1 = require("./config");
// virtual scheme that will map to dynamically aggregated custom-elements.json
const scheme = config_1.configKey;
function activate(context) {
    const { subscriptions } = context;
    (0, config_1.setupContext)(context);
    // scanner fires onDidDataChange with list of custom-element.json uris
    const scanner = (0, scanner_1.createScanner)();
    const provider = new cusom_data_provider_1.CustomDataProvider(scanner, scheme, html_schema_1.default);
    // provide the merged custom data via customElementScanner:/data.json
    subscriptions.push(vscode_1.workspace.registerTextDocumentContentProvider(scheme, provider));
    // provides the tree view in the files tab
    vscode_1.window.createTreeView(scheme, {
        treeDataProvider: provider,
    });
    subscriptions.push(vscode_1.commands.registerCommand(`${config_1.configKey}.refresh`, () => scanner.refresh()));
    subscriptions.push(vscode_1.commands.registerCommand(`${config_1.configKey}.open`, (item) => __awaiter(this, void 0, void 0, function* () {
        if (item.resourceUri) {
            const doc = yield vscode_1.workspace.openTextDocument(item.resourceUri);
            vscode_1.window.showTextDocument(doc);
        }
    })));
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map