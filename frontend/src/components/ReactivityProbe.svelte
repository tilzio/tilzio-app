<script lang="ts">
  // Diagnostic harness that mirrors App.svelte's center composition exactly:
  // store → $derived tab → {#key tabKey} → SplitContainer node={tab.root}.
  // Used to reproduce the "split doesn't divide" bug (#3) in a unit test.
  import SplitContainer from './SplitContainer.svelte';
  import { store, actions } from '../state/store.svelte';
  import { activeTab } from '../state/selectors';

  const tab = $derived(activeTab(store.app));
  const tabKey = $derived(`${store.app.activeSpaceId}:${tab?.id ?? ''}`);
</script>

{#if tab}
  {#key tabKey}
    <SplitContainer
      node={tab.root}
      activePaneId={tab.activePaneId}
      zoomedPaneId={tab.zoomedPaneId}
      onFocus={actions.focusPane}
      onSplit={(paneId, dir) => actions.splitPane(paneId, dir)}
      onClose={actions.closePane}
      onZoom={() => {}}
      onResize={actions.setRatio}
      onRename={actions.setPaneTitle}
      onModeChange={actions.setEditorMode}
      onMovePane={actions.movePane}
    />
  {/key}
{/if}
