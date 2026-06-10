export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

let toastId = 0;

class ToastStore {
  items = $state<Toast[]>([]);

  show(message: string, kind: Toast['kind'] = 'info', durationMs = 4000): void {
    toastId += 1;
    const id = toastId;
    this.items = [...this.items, { id, message, kind }];
    setTimeout(() => {
      this.items = this.items.filter((t) => t.id !== id);
    }, durationMs);
  }
}

export const toast = new ToastStore();
