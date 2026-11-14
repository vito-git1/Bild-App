import { Download, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface LightboxProps {
  url: string;
  alt: string;
  caption?: string;
  onDownload?: () => void;
  onClose: () => void;
}

export function Lightbox({ url, alt, caption, onDownload, onClose }: LightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vollbildansicht"
      className="fixed inset-0 z-50 flex flex-col bg-canvas/95 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3" onClick={(event) => event.stopPropagation()}>
        <p className="meta truncate">{caption}</p>
        <div className="flex gap-2">
          {onDownload && (
            <button type="button" className="btn-secondary" onClick={onDownload}>
              <Download className="size-4" aria-hidden />
              Herunterladen
            </button>
          )}
          <button ref={closeRef} type="button" className="btn-ghost" onClick={onClose} aria-label="Schließen">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
        <img
          src={url}
          alt={alt}
          className="max-h-full max-w-full object-contain"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    </div>
  );
}
