/** A form field as far as edit tracking cares (an input, textarea or select). */
export interface Campo {
  readonly isConnected: boolean;
  readonly value: string;
}

/**
 * Remembers which fields the user typed into, and their value before that, to tell whether
 * there is unsaved input on the page. Errs on the side of "pending": a field saved on change
 * that stays on screen with its new value still counts, which only costs an extra confirm.
 */
export class Ediciones {
  #antes = new Map<Campo, string>();
  #tocados = new Set<Campo>();

  /** Field got focus: snapshot its value unless it already has pending edits. */
  foco(c: Campo) {
    if (!this.#tocados.has(c)) this.#antes.set(c, c.value);
  }

  /** User changed the field. */
  input(c: Campo) {
    if (!this.#antes.has(c)) this.#antes.set(c, '');
    this.#tocados.add(c);
  }

  /** True if some field still on screen differs from its value before the user touched it. */
  pendientes(): boolean {
    for (const c of this.#tocados) {
      if (c.isConnected && c.value !== this.#antes.get(c)) return true;
      this.#tocados.delete(c);
      this.#antes.delete(c);
    }
    return false;
  }
}

const esCampo = (t: EventTarget | null): t is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
  (t instanceof HTMLInputElement && !['checkbox', 'radio', 'file', 'button', 'submit'].includes(t.type)) ||
  t instanceof HTMLTextAreaElement ||
  t instanceof HTMLSelectElement;

/** Browser wiring: tracks edits in the whole document. */
export function seguirEdiciones(doc: Document = document): Ediciones {
  const e = new Ediciones();
  doc.addEventListener('focusin', (ev) => esCampo(ev.target) && e.foco(ev.target), true);
  doc.addEventListener('input', (ev) => esCampo(ev.target) && e.input(ev.target), true);
  return e;
}
