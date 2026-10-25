export interface NativeTrayItem {
  id: string;
  label: string;
  enabled?: boolean;
  checked?: boolean;
  items?: NativeTrayEntry[];
}

export type NativeTrayEntry = NativeTrayItem | { separator: true };

export interface NativeTrayStatus {
  supported: boolean;
  available: boolean;
  hostAvailable: boolean;
  visible: boolean;
  windowVisible: boolean;
  tooltip: string;
  icon: string;
  error: string | null;
}
