<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';

  /** Return true if the event originated from an input-ish control, so
   *  single-key shortcuts don't steal keystrokes while typing. */
  function isTypingContext(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target.isContentEditable
    );
  }

  function handleKeydown(e: KeyboardEvent) {
    // Allow browser/OS combos (Cmd/Ctrl/Alt) to pass.
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // "/" focuses the first text input on the page (typically the search
    // query or the analyze textarea), even from inside a non-text control.
    if (e.key === '/' && !isTypingContext(e.target)) {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input[type=text], textarea'
      );
      if (input) {
        e.preventDefault();
        input.focus();
        input.select?.();
        return;
      }
    }

    // Nav shortcuts only when NOT typing, to avoid hijacking letters in text.
    if (isTypingContext(e.target)) return;

    switch (e.key) {
      case 'h':
        e.preventDefault();
        goto(`${base}/`);
        break;
      case 'd':
        e.preventDefault();
        goto(`${base}/discover/`);
        break;
      case 's':
        e.preventDefault();
        goto(`${base}/search/`);
        break;
      case 'a':
        e.preventDefault();
        goto(`${base}/analyze/`);
        break;
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>
