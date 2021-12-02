import { ExtensionContext, workspace, window, commands } from "vscode";
import { CustomDataProvider, CustomHTMLDataNode } from "./cusom-data-provider";
import htmlSchema from "./html.schema";
import { createScanner } from "./scanner";
import { setupContext, configKey, setWebMode } from "./config";

// virtual scheme that will map to dynamically aggregated custom-elements.json
const scheme = configKey;

export function activate(context: ExtensionContext) {
  const { subscriptions } = context;

  setupContext(context);

  // scanner fires onDidDataChange with list of custom-element.json uris
  const scanner = createScanner();
  const provider = new CustomDataProvider(scanner, scheme, htmlSchema);

  // provide the merged custom data via customElementScanner:/data.json
  subscriptions.push(
    workspace.registerTextDocumentContentProvider(scheme, provider)
  );

  // provides the tree view in the files tab
  window.createTreeView(scheme, {
    treeDataProvider: provider,
  });

  subscriptions.push(
    commands.registerCommand(`${configKey}.refresh`, () => scanner.refresh())
  );

  subscriptions.push(
    commands.registerCommand(
      `${configKey}.open`,
      async (item: CustomHTMLDataNode) => {
        if (item.resourceUri) {
          const doc = await workspace.openTextDocument(item.resourceUri);
          window.showTextDocument(doc);
        }
      }
    )
  );
}
