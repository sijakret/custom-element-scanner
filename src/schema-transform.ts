import * as schema from 'custom-elements-manifest/schema';
import { Package, CustomElement } from 'custom-elements-manifest/schema';
import { validate } from 'jsonschema'
import { join } from 'path';

const supportedVersions = ['1.0.0'];
/**
 * transform this: https://github.com/webcomponents/custom-elements-manifest
 * to this: https://github.com/microsoft/vscode-custom-data/tree/main/samples/webcomponents
 */
export function transform(json:any, path:string):any {
    const {valid:isManifest} = validate(json, schema);
    if(isManifest && supportedVersions.indexOf((json as Package).schemaVersion) !== -1) {
        const m = json as Package;
        const vscode = {
            version: 1.1,
            tags: [] as any
        };
        m.modules.forEach(module => {
            const elements = (module.declarations as CustomElement[])?.filter(decl => decl.customElement);
            elements.forEach((element) => {
                vscode.tags.push({
                    name: element.tagName,
                    description: element.description || '',
                    // references: [
                    //     {
                    //         name: `Source: ${module.path}`,
                    //         url: join(path, module.path)
                    //     }
                    // ],
                    attributes: element.attributes?.map(a => {
                        return {
                            name: a.name,
                            description: a.description,
                            type: a.type?.text,
                            ...(a.type?.text.match(/|/) ? {
                                values: a.type?.text.split('|').map(v => ({
                                    // this is kind of a hack for "enums"
                                    name: v.trim().split('\'').join('')
                                }))
                            } : {})
                        }
                    }),
                    events: element.events?.map(e => {
                        return  {
                            nane: e.name,
                            description: e.description,
                        }
                    }),
                    slots: element.slots?.map(e => {
                        return  {
                            nane: e.name,
                            description: e.description,
                        }
                    })
                });
            })
        })
        return vscode;
    }

    return json;
}