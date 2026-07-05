import type { PluginManifest } from '../bridge/plugins';
import { t } from '../i18n/index.svelte';

// Human-readable form of a single declared permission. The single source
// of wording — both the list row (badge) and consent (title/detail) draw from here.
// The tone/color/bg fields (S9.6) — for colored permission chips in the consent dialog (S9.5).
// The icon/title/detail/badge fields — byte-identical (extension lists consume them).
export interface PermLabel {
  icon: string;
  title: string;
  detail: string;
  badge: string;
  // S9.6: permission chip color; hex constants from the Gruvbox palette (data map, not CSS tokens)
  tone: string;
  color: string;
  // ready-made rgba with 14% opacity for the chip background — S9.5 does not parse hex by hand
  bg: string;
}

// Resolves a permission into a human-readable form (MVP profile §6 design overview).
// We don't drop unknown permissions (permissions are opaque) — we show the raw id.
export function resolvePermission(perm: string, execList: string[]): PermLabel {
  switch (perm) {
    case 'exec': {
      const bins = execList.length ? execList.join(', ') : t('perm.exec.noBinary');
      return {
        icon: '⚡', title: t('perm.exec.title'), detail: t('perm.exec.detail', { bins }), badge: t('perm.exec.badge', { bins }),
        // exec — yellow (dangerous: command execution)
        tone: 'exec', color: '#fabd2f', bg: 'rgba(250,189,47,.14)',
      };
    }
    case 'state:read':
      return {
        icon: '👁', title: t('perm.state:read.title'), detail: t('perm.state:read.detail'), badge: t('perm.state:read.badge'),
        // state:read — neutral (read-only, harmless)
        tone: 'state', color: '#a89984', bg: 'rgba(168,153,132,.14)',
      };
    case 'terminal:write':
      return {
        icon: '⌨', title: t('perm.terminal:write.title'), detail: t('perm.terminal:write.detail'), badge: t('perm.terminal:write.badge'),
        // terminal:write — orange (inserts text into the console)
        tone: 'terminal-write', color: '#fe8019', bg: 'rgba(254,128,25,.14)',
      };
    case 'terminal:read':
      return {
        icon: '🔓', title: t('perm.terminal:read.title'), detail: t('perm.terminal:read.detail'), badge: t('perm.terminal:read.badge'),
        // terminal:read — red (can read passwords/tokens)
        tone: 'terminal-read', color: '#fb4934', bg: 'rgba(251,73,52,.14)',
      };
    case 'network':
      return {
        icon: '🌐', title: t('perm.network.title'), detail: t('perm.network.detail'), badge: t('perm.network.badge'),
        // network — aqua (#83a598, spec §6.2 default — not pink)
        tone: 'network', color: '#83a598', bg: 'rgba(131,165,152,.14)',
      };
    default:
      // unknown permission → neutral gray, does not throw
      return {
        icon: '•', title: perm, detail: t('perm.unknown.detail'), badge: perm,
        tone: 'unknown', color: '#a89984', bg: 'rgba(168,153,132,.14)',
      };
  }
}

export function declaredPermissions(manifest: PluginManifest | null): string[] {
  return manifest?.permissions ?? [];
}

// We show consent when enabling a plugin that has declared permissions.
export function needsConsent(manifest: PluginManifest | null): boolean {
  return declaredPermissions(manifest).length > 0;
}
