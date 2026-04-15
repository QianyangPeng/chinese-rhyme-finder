<script lang="ts">
  import '../app.css';
  import TopNav from '$lib/components/TopNav.svelte';
  import GlobalKeyboard from '$lib/components/GlobalKeyboard.svelte';
  let { children } = $props();
</script>

<GlobalKeyboard />
<TopNav />
{@render children()}
