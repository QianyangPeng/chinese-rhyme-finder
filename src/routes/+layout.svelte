<script lang="ts">
  import '../app.css';
  import TopNav from '$lib/components/TopNav.svelte';
  import GlobalKeyboard from '$lib/components/GlobalKeyboard.svelte';
  import KeyboardHelp from '$lib/components/KeyboardHelp.svelte';
  let { children } = $props();
</script>

<GlobalKeyboard />
<KeyboardHelp />
<TopNav />
{@render children()}
