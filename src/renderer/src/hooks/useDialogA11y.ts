import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'
  );
}

type RestorableBodyChild = {
  element: HTMLElement;
  ariaHidden: string | null;
  inert: boolean;
  focusables: Array<{
    element: HTMLElement;
    tabIndex: string | null;
  }>;
};

export function useDialogA11y(onClose: (() => void) | undefined, active = true) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const portalRoot = dialog.parentElement ?? dialog;
    const restorableBodyChildren: RestorableBodyChild[] = [...document.body.children]
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => element !== portalRoot && !element.contains(portalRoot))
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: element.inert,
        focusables: focusableElements(element).map((focusable) => ({
          element: focusable,
          tabIndex: focusable.getAttribute('tabindex')
        }))
      }));

    for (const { element, focusables } of restorableBodyChildren) {
      element.setAttribute('aria-hidden', 'true');
      element.inert = true;
      for (const { element: focusable } of focusables) {
        focusable.setAttribute('tabindex', '-1');
      }
    }

    const focusables = focusableElements(dialog);
    (focusables[0] ?? dialog).focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const currentFocusables = focusableElements(dialog);
      if (currentFocusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = currentFocusables[0];
      const last = currentFocusables[currentFocusables.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      for (const { element, ariaHidden, inert, focusables } of restorableBodyChildren) {
        if (ariaHidden === null) {
          element.removeAttribute('aria-hidden');
        } else {
          element.setAttribute('aria-hidden', ariaHidden);
        }
        element.inert = inert;
        for (const { element: focusable, tabIndex } of focusables) {
          if (tabIndex === null) {
            focusable.removeAttribute('tabindex');
          } else {
            focusable.setAttribute('tabindex', tabIndex);
          }
        }
      }
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return dialogRef;
}
