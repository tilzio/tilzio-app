// Parse activityBar.opens: "view:<id>" → open a tile view; otherwise it is a widget-panel id
// (backward compatibility with older plugins). Pure function.
export function parseOpens(opens: string): { kind: 'view' | 'panel'; target: string } {
  return opens.startsWith('view:') ? { kind: 'view', target: opens.slice('view:'.length) } : { kind: 'panel', target: opens };
}
