
import { ExtensionContext, workspace, window, commands } from 'vscode';
import { CustomDataProvider } from './cusom-data-provider';
import htmlSchema from './html.schema';
import { createScanner, ElementsWithContext } from './scanner';
import { relative } from 'path';
import { setupContext } from './config';

// virtual scheme that will map to dynamically aggregated custom-elements.json
const scheme = 'customData';

export function activate(context: ExtensionContext) {
	const { subscriptions } = context;

	setupContext(context);

	// scanner fires onDidDataChange with list of custom-element.json uris
	const scanner = createScanner();
	const provider = new CustomDataProvider(scanner, scheme, htmlSchema);
	// this will provide the customData:/data.json schema
	// subscriptions.push(workspace.registerTextDocumentContentProvider(scheme, provider));
	// this will provide the tree view in the files tap
	window.createTreeView(scheme, {
		treeDataProvider: provider
	});

	subscriptions.push(commands.registerCommand('customData.refresh', () =>
		scanner.refresh()
	));

	subscriptions.push(commands.registerCommand('customData.open', async (item:CustomHTMLDataNode) => {
		const doc = await workspace.openTextDocument(item.element.uri);
		window.showTextDocument(doc);
	}));

	subscriptions.push(scanner.onDidDataChange.event((elements:ElementsWithContext[]) => {
		const ws = workspace.workspaceFolders && workspace.workspaceFolders[0].uri.path;
		if(ws) {
			workspace.getConfiguration('html').update('customData',
				elements.map(e => relative(ws, e.uri.path))
			)
		}
	}));
}
