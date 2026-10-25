export interface NativePaths {
  data: string;
  config: string;
  cache: string;
  log: string;
  temp: string;
  home: string;
  documents: string;
  downloads: string;
  desktop: string;
}

export type NativePathName = keyof NativePaths;
