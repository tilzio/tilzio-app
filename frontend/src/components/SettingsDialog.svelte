<script lang="ts">
  import ColorRow from './ColorRow.svelte';
  import BrandMark from './BrandMark.svelte';
  import { focusTrap } from './focusTrap';
  import { AVAILABLE_LOCALES, t } from '../i18n/index.svelte';
  import {
    FONT_PRESETS, FONT_SIZE_MIN, FONT_SIZE_MAX, clampFontSize,
    type FontKey, type ColorValue,
  } from '../state/appearance';
  let {
    activeColor, exitColor, alertColor, uiFont, uiFontSize,
    termFontSize, editorFontSize,
    onActiveColor, onExitColor, onAlertColor, onFont, onSize,
    onTermSize, onEditorSize,
    onReset, onClose,
    onOpenExtensions,
    appVersion,
    locale, onLocale,
    storeAutoUpdate = true,
    onStoreAutoUpdate = undefined,
  }: {
    activeColor: string; exitColor: string; alertColor: string;
    uiFont: FontKey; uiFontSize: number;
    termFontSize: number; editorFontSize: number;
    onActiveColor: (v: ColorValue) => void;
    onExitColor: (v: ColorValue) => void;
    onAlertColor: (v: ColorValue) => void;
    onFont: (k: FontKey) => void;
    onSize: (n: number) => void;
    onTermSize: (n: number) => void;
    onEditorSize: (n: number) => void;
    onReset: () => void;
    onClose: () => void;
    onOpenExtensions?: () => void;
    appVersion?: string;
    locale: string;
    onLocale: (l: string) => void;
    storeAutoUpdate?: boolean;
    onStoreAutoUpdate?: (on: boolean) => void;
  } = $props();

  // App version — defaults to 'dev' if the prop is not passed
  const ver = $derived(appVersion ?? 'dev');

  // Universal stepper: clamps and calls the callback
  function bumpBy(cur: number, fn: (n: number) => void, delta: number) {
    fn(clampFontSize(cur + delta));
  }

  // Active category of the left column (S7.2 scaffold; tab bodies are filled by S7.3/S7.5)
  type Category = 'appearance' | 'terminal' | 'editor' | 'keymap' | 'extensions' | 'about';
  let activeCategory = $state<Category>('appearance');
  // Section title on the right — mirror of the active category
  const categoryTitle = $derived(
    ({ appearance: t('settings.cat.appearance'), terminal: t('settings.cat.terminal'),
       editor: t('settings.cat.editor'), keymap: t('settings.cat.keymap'),
       extensions: t('settings.cat.extensions'), about: t('settings.cat.about') })[activeCategory],
  );
</script>

<div class="overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
  <div class="window" role="dialog" aria-modal="true" aria-label={t('settings.title')} tabindex="-1" use:focusTrap>
    <!-- Left column of categories: brand lockup + 6 buttons -->
    <div class="cats">
      <div class="brand">
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="8" height="18" rx="2.2" fill="#fe8019" />
          <rect x="13" y="3" width="8" height="8" rx="2.2" fill="#665c54" />
          <rect x="13" y="13" width="8" height="8" rx="2.2" fill="#665c54" />
        </svg>
        <span class="brand-name">{t('settings.title')}</span>
      </div>
      <button class="cat" class:active={activeCategory === 'appearance'}
        aria-current={activeCategory === 'appearance' ? 'page' : undefined}
        onclick={() => (activeCategory = 'appearance')}>{t('settings.cat.appearance')}</button>
      <button class="cat" class:active={activeCategory === 'terminal'}
        aria-current={activeCategory === 'terminal' ? 'page' : undefined}
        onclick={() => (activeCategory = 'terminal')}>{t('settings.cat.terminal')}</button>
      <button class="cat" class:active={activeCategory === 'editor'}
        aria-current={activeCategory === 'editor' ? 'page' : undefined}
        onclick={() => (activeCategory = 'editor')}>{t('settings.cat.editor')}</button>
      <button class="cat" class:active={activeCategory === 'keymap'}
        aria-current={activeCategory === 'keymap' ? 'page' : undefined}
        onclick={() => (activeCategory = 'keymap')}>{t('settings.cat.keymap')}</button>
      <button class="cat" class:active={activeCategory === 'extensions'}
        aria-current={activeCategory === 'extensions' ? 'page' : undefined}
        onclick={() => (activeCategory = 'extensions')}>{t('settings.cat.extensions')}</button>
      <div class="spacer"></div>
      <button class="cat" class:active={activeCategory === 'about'}
        aria-current={activeCategory === 'about' ? 'page' : undefined}
        onclick={() => (activeCategory = 'about')}>{t('settings.cat.about')}</button>
    </div>

    <!-- Right area: scrollable body + pinned footer -->
    <div class="content">
      <div class="scroll">
        <div class="sec-head">
          <div class="sec-title">{categoryTitle}</div>
          <button class="x" aria-label={t('settings.closeAria')} onclick={onClose}>✕</button>
        </div>

        {#if activeCategory === 'appearance'}
          <!-- S7.3: LIVE PREVIEW of three tiles (active/notif/exit) — static text, colors from props -->
          <div class="preview-wrap">
            <!-- Decorative macintosh-style header with three traffic-light dots -->
            <div class="preview-head">
              <span class="traff" style="background:#fb4934"></span>
              <span class="traff" style="background:#fabd2f"></span>
              <span class="traff" style="background:#b8bb26"></span>
              <span class="preview-label">{t('settings.livePreview')}</span>
            </div>
            <!-- Three mini-tiles: active / notif (alert) / exit -->
            <div class="preview-body">
              <!-- Tile 1: active pane (orange accent) -->
              <div class="tile" data-testid="preview-active"
                style="box-shadow: inset 0 0 0 2px {activeColor}">
                <div class="tile-head">
                  <!-- Status indicator dot with data-testid for the test -->
                  <span class="tile-dot" data-testid="preview-active-dot"
                    style:background={activeColor}></span>
                  <span class="tile-title">server</span>
                </div>
                <div class="tile-body">
                  <span style="color:#b8bb26">❯ pnpm dev</span>
                  <!-- Blinking cursor → tzBlink animation (scoped in <style>) -->
                  <span class="cursor" style:background={activeColor}></span>
                </div>
              </div>
              <!-- Tile 2: notification/alert (breathing tzBreathe border) -->
              <div class="tile tile-notif" data-testid="preview-notif"
                style="box-shadow: inset 0 0 0 2px {alertColor}">
                <span class="tile-glow" aria-hidden="true"></span>
                <div class="tile-head">
                  <span class="tile-dot" style:background={alertColor}></span>
                  <span class="tile-title">tests</span>
                </div>
                <div class="tile-body">
                  <span style:color={alertColor}>⧗ waiting…</span>
                </div>
              </div>
              <!-- Tile 3: finished/exited pane -->
              <div class="tile" data-testid="preview-exit"
                style="box-shadow: inset 0 0 0 2px {exitColor}">
                <div class="tile-head">
                  <span class="tile-dot" style:background={exitColor}></span>
                  <span class="tile-title">deploy</span>
                </div>
                <div class="tile-body">
                  <span style:color={exitColor}>exit (1)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- S7.3: STATE COLORS — three ColorRow with dotColor -->
          <div class="section">{t('settings.section.stateColors')}</div>
          <ColorRow label={t('settings.color.active')} value={activeColor} dotColor={activeColor} onPick={onActiveColor} />
          <ColorRow label={t('settings.color.exit')} value={exitColor} dotColor={exitColor} onPick={onExitColor} />
          <ColorRow label={t('settings.color.notifications')} value={alertColor} dotColor={alertColor} onPick={onAlertColor} />

          <div class="hr"></div>

          <!-- S7.3: LABEL FONT — family select + size stepper -->
          <div class="section">{t('settings.section.labelFont')}</div>
          <div class="frow">
            <div class="frow-label">{t('settings.familySize')}</div>
            <div class="font-controls">
              <!-- Styled select of font presets -->
              <select class="fam-select" aria-label="label font family"
                value={uiFont}
                onchange={(e) => onFont(e.currentTarget.value as FontKey)}>
                {#each FONT_PRESETS as f (f.key)}
                  <option value={f.key}>{f.label}</option>
                {/each}
              </select>
              <!-- Size stepper: buttons − / input number / + -->
              <button class="step" aria-label="decrease size"
                onclick={() => bumpBy(uiFontSize, onSize, -1)}>−</button>
              <input class="size-input" type="number" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX}
                value={uiFontSize} aria-label="font size"
                onchange={(e) => onSize(clampFontSize(Number(e.currentTarget.value)))} />
              <button class="step" aria-label="increase size"
                onclick={() => bumpBy(uiFontSize, onSize, 1)}>+</button>
            </div>
          </div>

          <div class="hr"></div>

          <!-- Language selector -->
          <div class="section">{t('settings.section.language')}</div>
          <div class="frow">
            <div class="frow-label">{t('settings.language')}</div>
            <select class="fam-select" aria-label="language"
              value={locale}
              onchange={(e) => onLocale(e.currentTarget.value)}>
              {#each AVAILABLE_LOCALES as loc (loc.id)}
                <option value={loc.id}>{loc.label}</option>
              {/each}
            </select>
          </div>

        {:else if activeCategory === 'terminal'}
          <!-- S7.5 placeholder: Terminal — content font size (moved from Appearance) -->
          <div class="section">{t('settings.section.contentFontSize')}</div>
          <div class="frow">
            <div class="frow-label">{t('settings.field.terminal')}</div>
            <div class="stepper">
              <button class="step" aria-label="decrease terminal size"
                onclick={() => bumpBy(termFontSize, onTermSize, -1)}>−</button>
              <input class="size-input" type="number" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX}
                value={termFontSize} aria-label="terminal font size"
                onchange={(e) => onTermSize(clampFontSize(Number(e.currentTarget.value)))} />
              <button class="step" aria-label="increase terminal size"
                onclick={() => bumpBy(termFontSize, onTermSize, 1)}>+</button>
              <span class="hint">{t('settings.sizeHint', { min: FONT_SIZE_MIN, max: FONT_SIZE_MAX })}</span>
            </div>
          </div>

        {:else if activeCategory === 'editor'}
          <!-- S7.5 placeholder: Editor — content font size (moved from Appearance) -->
          <div class="section">{t('settings.section.contentFontSize')}</div>
          <div class="frow">
            <div class="frow-label">{t('settings.field.editor')}</div>
            <div class="stepper">
              <button class="step" aria-label="decrease editor size"
                onclick={() => bumpBy(editorFontSize, onEditorSize, -1)}>−</button>
              <input class="size-input" type="number" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX}
                value={editorFontSize} aria-label="editor font size"
                onchange={(e) => onEditorSize(clampFontSize(Number(e.currentTarget.value)))} />
              <button class="step" aria-label="increase editor size"
                onclick={() => bumpBy(editorFontSize, onEditorSize, 1)}>+</button>
              <span class="hint">{t('settings.sizeHint', { min: FONT_SIZE_MIN, max: FONT_SIZE_MAX })}</span>
            </div>
          </div>

        {:else if activeCategory === 'keymap'}
          <!-- S7.5: Keymap — read-only table of hotkeys (mirror of keymap.ts as text) -->
          <div class="km-note">{t('settings.keymap.readOnly')}</div>
          <div class="km-list">
            {#each [
              ['⌘T',        t('settings.km.newTab')],
              ['⌘W',        t('settings.km.closePane')],
              ['⌘D',        t('settings.km.splitRight')],
              ['⌘⇧D',       t('settings.km.splitDown')],
              ['⌘N',        t('settings.km.newSpace')],
              ['⌘R',        t('settings.km.restartPane')],
              ['⌘↵',        t('settings.km.zoomPane')],
              ['⌘O',        t('settings.km.openFile')],
              ['⌘S',        t('settings.km.save')],
              ['⌘B',        t('settings.km.toggleSidebar')],
              ['⌘J',        t('settings.km.toggleBottomPanel')],
              ['⌘⌥B',       t('settings.km.toggleRightArea')],
              ['⌘⌥.',       t('settings.km.collapseNavigator')],
              ['⌘⌥←/→/↑/↓',t('settings.km.focusNeighbor')],
              ['⌘⌃←/→',    t('settings.km.switchSpace')],
              ['⌘1…9',      t('settings.km.selectTab')],
            ] as [key, desc] (key)}
              <div class="km-row">
                <span class="km-key">{key}</span>
                <span class="km-desc">{desc}</span>
              </div>
            {/each}
          </div>

        {:else if activeCategory === 'extensions'}
          <!-- S7.5: Extensions — button to jump to the extensions panel -->
          <p class="ext-desc">{t('settings.ext.desc')}</p>
          {#if onOpenExtensions}
            <button class="ext-btn" onclick={onOpenExtensions}>{t('settings.ext.open')} →</button>
          {/if}

          <!-- Task 14: Auto-update extensions toggle -->
          <div class="frow">
            <div class="frow-label">{t('settings.ext.autoUpdate')}</div>
            <button
              class="toggle"
              class:on={storeAutoUpdate}
              role="switch"
              aria-checked={storeAutoUpdate}
              aria-label={t('settings.ext.autoUpdate')}
              onclick={() => onStoreAutoUpdate?.(!storeAutoUpdate)}
            >
              <span class="knob"></span>
            </button>
          </div>
          <p class="ext-hint">{t('settings.ext.autoUpdateHint')}</p>

        {:else if activeCategory === 'about'}
          <!-- S7.5: About — brand lockup + version + tagline -->
          <div class="about-wrap">
            <BrandMark size={36} />
            <div class="about-name">Tilzio</div>
            <div class="about-ver">{ver}</div>
            <div class="about-tagline">{t('settings.about.tagline')}</div>
          </div>
        {/if}
      </div>

      <!-- Footer (S7.6): pinned outside .scroll, direct child of .content -->
      <div class="footer">
        <!-- Left button: reset to defaults (ghost style) -->
        <button class="reset" onclick={onReset}>{t('settings.reset')}</button>
        <!-- Right button: Done (primary orange) -->
        <button class="done" onclick={onClose}>{t('settings.done')}</button>
      </div>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: #000a; }
  /* Settings window 760×520 (S7.2): left column of categories + right area */
  .window { width: 760px; max-width: 100%; background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-xl); overflow: hidden; box-shadow: 0 22px 60px #000a; display: flex; height: 520px; font: 13px var(--ui-font); animation: tzPop .18s ease-out; }

  /* Left column of categories */
  .cats { width: 194px; flex: none; background: var(--sidebar); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 10px; }
  .brand { display: flex; align-items: center; gap: 8px; padding: 4px 8px 12px; }
  .brand-name { font-weight: 700; font-size: 13px; }
  /* S7.2: category item — orange inset bar + tint + weight when active (per the mockup) */
  .cat { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; padding: 8px 9px; border: none; border-radius: var(--radius-lg); background: none; color: var(--text-dim); font: inherit; font-size: 12.5px; cursor: pointer; transition: background .1s, color .1s; }
  .cat:hover:not(.active) { background: rgba(235, 219, 178, .06); color: var(--text); }
  .cat.active { background: rgba(254, 128, 25, .1); box-shadow: inset 2px 0 0 var(--accent); color: var(--text); font-weight: 500; }
  .spacer { flex: 1; }

  /* Right area */
  .content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .scroll { flex: 1; overflow: auto; padding: 20px 22px; }
  .sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .sec-title { font-weight: 600; font-size: 15px; }
  .x { color: var(--text-faint); background: none; border: none; cursor: pointer; font-size: 14px; }

  .section { font-size: 10px; letter-spacing: 1.2px; color: var(--text-faint); margin-bottom: 12px; }
  .hr { height: 1px; background: var(--border); margin: 16px 0; }
  .frow { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .frow-label { width: 118px; font-size: 12.5px; flex: none; }
  .stepper { display: flex; align-items: center; gap: 8px; }
  .step { width: 27px; height: 27px; border: 1px solid var(--border); border-radius: 5px; background: none; color: var(--text); font-size: 14px; cursor: pointer; }
  .size-input { width: 42px; text-align: center; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; color: var(--text); font: 13px var(--ui-font); padding: 4px; }
  .hint { font-size: 11px; color: var(--text-dim); }

  /* LIVE PREVIEW wrapper */
  .preview-wrap { border: 1px solid var(--border); border-radius: 7px; overflow: hidden; margin-bottom: 20px; }
  /* Preview header: three traffic-light dots + LIVE PREVIEW label */
  .preview-head { height: 20px; background: var(--sidebar); display: flex; align-items: center; gap: 6px; padding: 0 9px; }
  .traff { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .preview-label { font-size: 9px; color: var(--text-faint); letter-spacing: .08em; margin-left: 6px; }
  /* Preview body: three tiles in a row */
  .preview-body { display: flex; height: 92px; background: var(--bg); padding: 6px; gap: 6px; }
  /* A single tile */
  .tile { flex: 1; position: relative; background: #000; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; }
  .tile-head { display: flex; align-items: center; gap: 5px; padding: 5px 7px 3px; }
  .tile-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .tile-title { font-size: 9px; color: var(--text-dim); }
  .tile-body { padding: 2px 7px; font-size: 9px; display: flex; align-items: center; gap: 3px; }
  /* Blinking cursor in the preview-active tile */
  .cursor { width: 5px; height: 10px; display: inline-block; animation: tzBlink 1.1s steps(1) infinite; }
  /* Breathing teal glow of the notif tile: a separate overlay layer (as in the mockup — the static ring
     stays on the tile via inline box-shadow, the glow breathes on top). tzBreathe scoped in <style>. */
  .tile-glow { position: absolute; inset: 0; border-radius: 4px; pointer-events: none; animation: tzBreathe 2.6s ease-in-out infinite; }

  /* LABEL FONT controls: select + stepper */
  .font-controls { display: flex; gap: 6px; align-items: center; }
  .fam-select { border: 1px solid var(--accent); border-radius: 5px; background: var(--header-active); color: var(--text); padding: 5px 12px; font-size: 12px; cursor: pointer; }

  /* Footer (S7.6): pinned, outside .scroll, direct child of .content */
  .footer { border-top: 1px solid var(--border); padding: 13px 22px; display: flex; justify-content: space-between; align-items: center; flex: none; }
  /* Reset button: ghost style (transparent background, border) */
  .reset { background: none; color: var(--text-dim); border: 1px solid var(--border); border-radius: 5px; padding: 7px 14px; cursor: pointer; font: inherit; }
  .reset:hover { background: var(--active-row); }
  /* Done button: primary orange accent */
  .done { background: var(--accent); color: #1a1a1a; border: none; border-radius: 5px; padding: 7px 20px; font-weight: 600; cursor: pointer; font: inherit; }
  .done:hover { filter: brightness(1.06); }

  /* S7.5: Keymap tab */
  .km-note { font-size: 11px; color: var(--text-faint); margin-bottom: 10px; }
  .km-list { display: flex; flex-direction: column; gap: 0; }
  .km-row { display: flex; align-items: center; gap: 12px; padding: 5px 0; font-size: 12.5px; border-bottom: 1px solid var(--border); }
  .km-row:last-child { border-bottom: none; }
  .km-key { min-width: 88px; color: var(--text); font-weight: 500; flex: none; }
  .km-desc { color: var(--text-dim); }

  /* S7.5: Extensions tab */
  .ext-desc { font-size: 12.5px; color: var(--text-dim); margin: 0 0 14px; }
  .ext-btn { background: var(--bg); border: 1px solid var(--border); color: var(--accent); border-radius: 5px; padding: 7px 14px; cursor: pointer; font: inherit; font-size: 13px; }
  .ext-btn:hover { background: var(--active-row); }

  /* Task 14: Auto-update extensions toggle — mirrors the ExtensionsScreen switch pattern */
  .toggle { width: 34px; height: 18px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); position: relative; cursor: pointer; padding: 0; }
  .toggle .knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--text-dim); transition: left 0.15s ease; }
  .toggle.on { background: var(--accent); border-color: var(--accent); }
  .toggle.on .knob { left: 18px; background: var(--bg); }
  .ext-hint { color: var(--text-faint); font-size: 11px; margin: 6px 0 0; }

  /* S7.5: About tab */
  .about-wrap { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-top: 28px; }
  .about-name { font-weight: 700; font-size: 17px; }
  .about-ver { color: var(--text-faint); font-size: 12px; }
  .about-tagline { color: var(--text-dim); font-size: 12.5px; margin-top: 4px; }

  /* Local animations (scoped — token ownership is not in theme.css):
     tzPop — modal entrance; tzBlink — cursor in LIVE PREVIEW; tzBreathe — breathing preview border */
  @keyframes tzPop { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes tzBlink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }
  /* S7.3: breathing teal inner-glow of the notif tile (per the mockup) instead of opacity blinking */
  @keyframes tzBreathe { 0%, 100% { box-shadow: inset 0 0 4px 0 rgba(43, 217, 196, .35); } 50% { box-shadow: inset 0 0 18px 2px rgba(43, 217, 196, .8); } }
</style>
