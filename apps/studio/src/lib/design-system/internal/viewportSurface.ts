/** Private same-node top-layer lifecycle shared by descriptive and action overlays. */
export function viewportSurface(element: HTMLElement, initial: { floating: boolean; open: boolean }) {
    const native = typeof element.showPopover === 'function' && typeof element.hidePopover === 'function';
    let anchor: Comment | undefined;
    let disposed = false;
    let revision = 0;
    function hideNative() {
      if (native && element.matches(':popover-open')) element.hidePopover();
    }
    function update(state: { floating: boolean; open: boolean }) {
      const current = ++revision;
      if (!state.floating) {
        hideNative(); element.removeAttribute('popover');
        if (anchor) { anchor.after(element); anchor.remove(); anchor = undefined; }
        return;
      }
      if (native) {
        element.setAttribute('popover', 'manual');
        // Run after Svelte updates hidden/text/style for this state. The same
        // element stays in its DOM ancestry, including native modal dialogs.
        queueMicrotask(() => {
          if (disposed || revision !== current || !element.isConnected) return;
          if (state.open) { if (!element.matches(':popover-open')) element.showPopover(); }
          else hideNative();
        });
      } else if (!anchor) {
        anchor = element.ownerDocument.createComment('overlay position');
        element.before(anchor);
        element.ownerDocument.body.append(element);
      }
    }
    update(initial);
    return {
      update,
      destroy() {
        disposed = true; revision++;
        hideNative();
        if (anchor) { element.remove(); anchor.remove(); }
      }
    };
  }
