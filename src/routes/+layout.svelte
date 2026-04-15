<script lang="ts">
  import '../app.css';
  import TopNav from '$lib/components/TopNav.svelte';
  let { children } = $props();
</script>

<TopNav />
{@render children()}
