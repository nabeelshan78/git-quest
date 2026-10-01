/**
 * Accessible dialog: focus moves inside on open, Tab is trapped, focus
 * returns to the previous element on close. Esc calls `onEscape` when given.
 */
import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
}

export interface ModalProps {
  title: ReactNode;
  children: ReactNode;
  onEscape?: () => void;
  /** Element to focus first (CSS selector inside the dialog). */
  initialFocus?: string;
  className?: string;
  testId?: string;
  /** "center" dialog or a "side" sheet sliding from the right. */
  placement?: 'center' | 'side';
  describedBy?: string;
  /** Extra attributes for the dialog element (data-*). */
  dataAttrs?: Record<string, string>;
}

export function Modal({ title, children, onEscape, initialFocus, className, testId, placement = 'center', describedBy, dataAttrs }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (root) {
      const first = (initialFocus ? root.querySelector<HTMLElement>(initialFocus) : null) ?? focusableIn(root)[0] ?? root;
      first.focus();
    }
    return () => {
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) previous.focus();
    };
    // Focus only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && onEscapeRef.current) {
      e.stopPropagation();
      e.preventDefault();
      onEscapeRef.current();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = focusableIn(ref.current);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !ref.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={`gq-modal-backdrop gq-modal-${placement}`}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`gq-modal ${className ?? ''}`}
        data-testid={testId}
        onKeyDown={onKeyDown}
        {...dataAttrs}
      >
        <h2 id={titleId} className="gq-modal-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
