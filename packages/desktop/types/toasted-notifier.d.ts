declare module "toasted-notifier" {
  export interface NotificationOptions {
    title: string;
    message: string;
    sound: boolean;
    timeout: number;
    actions?: string[];
    appID?: string;
    "app-name"?: string;
  }
  export interface Notifier {
    notify(
      options: NotificationOptions,
      callback: (error: unknown, response?: string, metadata?: Record<string, unknown>) => void,
    ): void;
  }
  const notifier: {
    Notification: new (options: { withFallback: boolean; customPath?: string }) => Notifier;
    NotifySend: new (options: { withFallback: boolean; customPath?: string }) => Notifier;
  };
  export default notifier;
}
