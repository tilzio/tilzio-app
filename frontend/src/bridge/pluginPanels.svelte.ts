// Runtime UI state for rendering panels: the active tab per area (not
// persisted — spec §8) + the pure core of model A (click on a plugin's icon).

export const pluginPanels = $state<{ activeBottom: string | null; activeRight: string | null }>({
  activeBottom: null,
  activeRight: null,
});

export function setActivePanel(location: 'bottom' | 'right', panelId: string | null): void {
  if (location === 'bottom') pluginPanels.activeBottom = panelId;
  else pluginPanels.activeRight = panelId;
}

export function activePanelId(location: 'bottom' | 'right'): string | null {
  return location === 'bottom' ? pluginPanels.activeBottom : pluginPanels.activeRight;
}

// The pure model-A decision: what to do with the area and the active tab when the plugin's
// icon is clicked (spec §6). isOpen — whether the target area is currently open.
export function decideActivation(
  isOpen: boolean,
  currentActive: string | null,
  panelId: string,
): { toggleArea: boolean; setActive: string | null } {
  if (isOpen && currentActive === panelId) return { toggleArea: true, setActive: null };
  if (!isOpen) return { toggleArea: true, setActive: panelId };
  return { toggleArea: false, setActive: panelId };
}

export function __resetForTests(): void {
  pluginPanels.activeBottom = null;
  pluginPanels.activeRight = null;
}
