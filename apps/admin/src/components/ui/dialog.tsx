import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode
} from 'react';

import { cn } from '@/lib/utils';

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DialogContext = createContext<DialogContextValue>({
  open: false,
  setOpen: () => {}
});

export function Dialog({
  children,
  open: controlledOpen,
  onOpenChange
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <DialogContext.Provider value={{ open, setOpen }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogTrigger({
  children,
  asChild: _asChild,
  ...props
}: {
  children: ReactNode;
  asChild?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useContext(DialogContext);
  return (
    <button type="button" onClick={() => setOpen(true)} {...props}>
      {children}
    </button>
  );
}

export function DialogContent({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  const { open, setOpen } = useContext(DialogContext);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback(
    (e: MouseEvent) => {
      if (e.target === overlayRef.current) {
        setOpen(false);
      }
    },
    [setOpen]
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={handleOverlayClick}
    >
      <div
        className={cn(
          'relative w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg',
          className
        )}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
          onClick={() => setOpen(false)}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path
              d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
            />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5 text-center sm:text-left',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DialogTitle({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        'text-lg font-semibold leading-none tracking-tight',
        className
      )}
    >
      {children}
    </h2>
  );
}

export function DialogDescription({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
  );
}

export function DialogFooter({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        className
      )}
    >
      {children}
    </div>
  );
}
