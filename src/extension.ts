
import { ExtensionContext, workspace } from 'vscode';
import { CustomDataProvider } from './cusom-data-provider';
import htmlSchema from './html.schema';
import { createScanner } from './scanner';

// virtual scheme that will map to dynamically aggregated custom-elements.json
const scheme = 'custom-data';

export function activate({ subscriptions }: ExtensionContext) {

	// scanner fires onDidDataChange with list of custom-element.json uris
	const scanner = createScanner();
	const provider = new CustomDataProvider(scanner, scheme, htmlSchema);
	subscriptions.push(workspace.registerTextDocumentContentProvider(scheme, provider));

}
