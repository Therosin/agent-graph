/** Serializable options for native file dialogs. Extensions omit the dot. */
export interface NativeFileFilter {
  name: string;
  extensions: string[];
}

export interface NativeFileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: NativeFileFilter[];
}

export interface NativeSaveFileOptions extends NativeFileDialogOptions {
  defaultName?: string;
}
