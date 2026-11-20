type NameDialogOptions = {
  title: string;
  message?: string;
  defaultValue: string;
  confirmText?: string;
  cancelText?: string;
};

export type NameDialogRequest = NameDialogOptions & {
  open: boolean;
};

type Listener = (request: NameDialogRequest | null) => void;

let currentRequest: NameDialogRequest | null = null;
let currentResolver: ((value: string | null) => void) | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener(currentRequest));
}

function close(value: string | null) {
  currentRequest = null;
  const resolver = currentResolver;
  currentResolver = null;
  notify();
  resolver?.(value);
}

export const nameDialogService = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    listener(currentRequest);
    return () => listeners.delete(listener);
  },

  async open(options: NameDialogOptions) {
    if (currentResolver) {
      close(null);
    }

    currentRequest = {
      ...options,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      open: true
    };
    notify();

    return await new Promise<string | null>((resolve) => {
      currentResolver = resolve;
    });
  },

  confirm(value: string) {
    close(value);
  },

  cancel() {
    close(null);
  }
};
