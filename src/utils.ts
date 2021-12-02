import { FileStat, FileType, Uri, workspace } from "vscode";
import { webMode } from "./config";
import { relative, sep } from "path";

export function isSameFile(a?: FileStat, b?: FileStat) {
  if (webMode()) {
    return false;
  } else {
    return (
      !!a &&
      !!b &&
      a.ctime === b.ctime &&
      a.mtime === b.mtime &&
      a.size === b.size &&
      a.permissions === b.permissions
    );
  }
}

export function fsStat(uri: Uri): Thenable<FileStat> {
  if (webMode()) {
    return Promise.resolve<FileStat>({
      type: FileType.Unknown,
      size: 0,
      permissions: undefined,
      ctime: 0,
      mtime: 0,
    });
  } else {
    return workspace.fs.stat(uri);
  }
}

export function normalizePath(path: string) {
  if (
    webMode() &&
    workspace.workspaceFolders &&
    !path.startsWith("vscode-vfs:")
  ) {
    const folder = workspace.workspaceFolders[0];
    const relativePath = relative(folder.uri.path, path);
    const wsUri = `${folder.uri.toString()}/${relativePath}`;
    return wsUri;
  }
  return path;
}

export function normalizeUri(uri: Uri) {
  return Uri.parse(normalizePath(uri.toString()));
}

function workspacePath() {
  if (!workspace.workspaceFolders) {
    return "";
  }
  return workspace.workspaceFolders[0].uri.toString();
}

export function relativeWorkspacePath(path: string) {
  const w = workspacePath();
  if (path.startsWith(w)) {
    return path.substring(w.length);
  }
  return path;
}

export function workspacePathToPath(path: string) {
  const w = workspacePath();
  const segments = w.split(sep);
  return [...segments, path].join(sep);
}
