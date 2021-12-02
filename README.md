# VSCode Custom Data Scanner

Visual Studio Code extension ([market place link](https://marketplace.visualstudio.com/items?itemName=Jan-Kretschmer.custom-element-scanner)) that discovers custom element definitions in your workspace and makes them available to the html-language-service of vscode.

<img src="assets/docs/demo2.gif" />

## How?

Looks for `customElements` field in all package.json files it discovers,
but can also be configured to also look for `costum-elements.json` files directly.

Supports the following formats:

- [vscode-custom-data](https://github.com/microsoft/vscode-custom-data/tree/main/samples/webcomponents)
- [custom-elements.json](https://github.com/webcomponents/custom-elements-manifest) (is auto-converted to vscode format)

Adds a Custom Elements View Container to VSCode that gives an overview of the definitions that have been discovered.

<img src="assets/docs/tree-view.png" />

## Options

### `customElementScanner.mode`

Options: `"auto", "manual" (default)`

Can be toggled using search icon in top of view.

- `"auto"`: Scans project automatically. (might become slow on large projects)
- `"manual"`: Scans project only when you hit refresh button at the top of the panel. Stores discovered `custom-element` files in workspace settings.
