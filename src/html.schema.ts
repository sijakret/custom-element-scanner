import { Schema } from 'jsonschema'

export default {
    "$schema": "http://json-schema.org/draft-07/schema",
    "$id": "vscode-html-customdata",
    "version": 1.1,
    "title": "VS Code HTML Custom Data format",
    "description": "Format for loading Custom Data in VS Code's HTML support",
    "type": "object",
    "required": ["version"],
    "definitions": {
      "references": {
        "type": "object",
        "required": ["name", "url"],
        "properties": {
          "name": {
            "type": "string",
            "description": "The name of the reference."
          },
          "url": {
            "type": "string",
            "description": "The URL of the reference.",
            "pattern": "https?:\/\/",
            "patternErrorMessage": "URL should start with http:// or https://"
          }
        }
      },
      "markupDescription": {
        "type": "object",
        "required": ["kind", "value"],
        "properties": {
          "kind": {
            "type": "string",
            "description": "Whether `description.value` should be rendered as plaintext or markdown",
            "enum": [
              "plaintext",
              "markdown"
            ]
          },
          "value": {
            "type": "string",
            "description": "Description shown in completion and hover"
          }
        }
      }
    },
    "properties": {
      "version": {
        "const": 1.1,
        "description": "The custom data version",
        "type": "number"
      },
      "tags": {
        "description": "Custom HTML tags",
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name"],
          "defaultSnippets": [
            {
              "body": {
                "name": "$1",
                "description": "",
                "attributes": []
              }
            }
          ],
          "properties": {
            "name": {
              "type": "string",
              "description": "Name of tag"
            },
            "description": {
              "description": "Description of tag shown in completion and hover",
              "anyOf": [
                {
                  "type": "string"
                },
                { "$ref": "#/definitions/markupDescription" }
              ]
            },
            "attributes": {
              "type": "array",
              "description": "A list of possible attributes for the tag",
              "items": {
                "type": "object",
                "required": ["name"],
                "defaultSnippets": [
                  {
                    "body": {
                      "name": "$1",
                      "description": "",
                      "values": []
                    }
                  }
                ],
                "properties": {
                  "name": {
                    "type": "string",
                    "description": "Name of attribute"
                  },
                  "description": {
                    "description": "Description of attribute shown in completion and hover",
                    "anyOf": [
                      {
                        "type": "string"
                      },
                      { "$ref": "#/definitions/markupDescription" }
                    ]
                  },
                  "valueSet": {
                    "type": "string",
                    "description": "Name of the matching attribute value set"
                  },
                  "values": {
                    "type": "array",
                    "description": "A list of possible values for the attribute",
                    "items": {
                      "type": "object",
                      "required": ["name"],
                      "defaultSnippets": [
                        {
                          "body": {
                            "name": "$1",
                            "description": ""
                          }
                        }
                      ],
                      "properties": {
                        "name": {
                          "type": "string",
                          "description": "Name of attribute value"
                        },
                        "description": {
                          "description": "Description of attribute value shown in completion and hover",
                          "anyOf": [
                            {
                              "type": "string"
                            },
                            { "$ref": "#/definitions/markupDescription" }
                          ]
                        },
                        "references": {
                          "type": "array",
                          "description": "A list of references for the attribute value shown in completion and hover",
                          "items": {
                            "$ref": "#/definitions/references"
                          }
                        }
                      }
                    }
                  },
                  "references": {
                    "type": "array",
                    "description": "A list of references for the attribute shown in completion and hover",
                    "items": {
                      "$ref": "#/definitions/references"
                    }
                  }
                }
              }
            },
            "references": {
              "type": "array",
              "description": "A list of references for the tag shown in completion and hover",
              "items": {
                "$ref": "#/definitions/references"
              }
            }
          }
        }
      },
      "globalAttributes": {
        "description": "Custom HTML global attributes",
        "type": "array",
        "items": {
          "$ref": "#/properties/tags/items/properties/attributes/items"
        }
      },
      "valueSets": {
        "description": "A set of attribute value. When an attribute refers to an attribute set, its value completion will use value from that set",
        "type": "array",
        "items": {
          "type": "object",
          "required": ["name"],
          "defaultSnippets": [
            {
              "body": {
                "name": "$1",
                "description": "",
                "values": []
              }
            }
          ],
          "properties": {
            "name": {
              "type": "string",
              "description": "Name of attribute value in value set"
            },
            "values": {
              "$ref": "#/properties/tags/items/properties/attributes/items/properties/values"
            }
          }
        }
      }
    }
  } as Schema