import { FileStat } from "vscode";

export function isSameFile(a?:FileStat,b?:FileStat) {
    return !!a && !!b && a.ctime === b.ctime && a.mtime === b.mtime && a.size === b.size && a.permissions === b.permissions
}