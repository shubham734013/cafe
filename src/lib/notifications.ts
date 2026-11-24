type NotificationLevel = 'success' | 'error';

/** Load notification UI only when an interaction needs it. */
export function notify(level: NotificationLevel, message: string): void {
  void import('sonner').then(({ toast }) => {
    toast[level](message);
  });
}
