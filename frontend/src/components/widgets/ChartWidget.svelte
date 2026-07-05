<script lang="ts">
  import type { ChartWidget, Tone } from '../../state/widgets';
  import { toneColor } from '../../state/widgets';
  let { w }: { w: ChartWidget } = $props();

  // line: normalize values into polyline points (viewBox 100x32).
  function linePoints(values: number[]): string {
    if (values.length === 0) return '';
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const span = max - min || 1;
    const step = values.length > 1 ? 100 / (values.length - 1) : 0;
    return values.map((v, i) => `${(i * step).toFixed(1)},${(32 - ((v - min) / span) * 32).toFixed(1)}`).join(' ');
  }

  // ring: segments to arcs via stroke-dasharray on a circle r=30 (C≈188.5).
  const R = 30, C = 2 * Math.PI * 30;
  function ringTotal(segs: { label: string; value: number }[], max?: number): number {
    return max && max > 0 ? max : segs.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  }
  function rings(segs: { label: string; value: number; tone?: Tone }[], max?: number) {
    const total = ringTotal(segs, max);
    let offset = 0;
    return segs.map((s) => {
      const frac = Math.max(0, s.value) / total;
      const dash = frac * C;
      const seg = { dash, gap: C - dash, offset: -offset, tone: s.tone };
      offset += dash;
      return seg;
    });
  }

  // Center label of the ring: for a single segment (gauge) — % of max (or the raw
  // value if max is not set); for multiple segments (donut) — empty.
  function ringCenter(segs: { label: string; value: number }[], max?: number): string {
    if (segs.length !== 1) return '';
    const v = Math.max(0, segs[0].value);
    return max && max > 0 ? `${Math.round((v / max) * 100)}%` : String(Math.round(v));
  }

  const RING_COLORS = ['var(--accent)', 'var(--amber)', 'var(--green)', '#83a598', 'var(--red)'];
  const barMax = $derived(w.kind === 'bar' ? Math.max(...w.bars.map((b) => b.value), 1) : 1);
</script>

<div class="chart">
  {#if w.caption}<div class="cap">{w.caption}</div>{/if}

  {#if w.kind === 'line'}
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" class="line"><polyline points={linePoints(w.values)} fill="none" stroke="var(--accent)" stroke-width="1.5" /></svg>

  {:else if w.kind === 'bar'}
    {@const barSum = w.bars.reduce((a, b) => a + Math.max(0, b.value), 0) || 1}
    <div class="bars">
      {#each w.bars as b, i (i)}
        <div class="col">
          {#if w.percent}<span class="val">{Math.round(Math.max(0, b.value) / barSum * 100)}%</span>{/if}
          <div class="bar" style:background={b.tone ? toneColor(b.tone) : 'var(--accent)'} style:height="{Math.max(2, (b.value / barMax) * 100)}%"></div>
          <span class="lbl">{b.label}</span>
        </div>
      {/each}
    </div>

  {:else if w.kind === 'ring'}
    {@const ringLbl = ringCenter(w.segments, w.max)}
    {@const total = ringTotal(w.segments, w.max)}
    {@const single = w.segments.length === 1}
    <svg viewBox="0 0 80 80" class="ring">
      <circle cx="40" cy="40" r={R} fill="none" stroke="var(--border)" stroke-width="9" />
      {#each rings(w.segments, w.max) as seg, i (i)}
        <circle cx="40" cy="40" r={R} fill="none" stroke={seg.tone ? toneColor(seg.tone) : RING_COLORS[i % RING_COLORS.length]} stroke-width="9"
          stroke-linecap={single ? 'round' : 'butt'}
          stroke-dasharray="{seg.dash.toFixed(2)} {seg.gap.toFixed(2)}" stroke-dashoffset={seg.offset.toFixed(2)} transform="rotate(-90 40 40)" />
      {/each}
      {#if ringLbl}
        <text x="40" y="40" text-anchor="middle" dominant-baseline="central" class="ring-label">{ringLbl}</text>
      {/if}
    </svg>
    {#if !single}
      <div class="ring-legend">
        {#each w.segments as s, i (i)}
          <span class="leg"><span class="dot" style:background={s.tone ? toneColor(s.tone) : RING_COLORS[i % RING_COLORS.length]}></span>{s.label} {Math.round(Math.max(0, s.value) / total * 100)}%</span>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  /* Horizontal padding so the edge bars/line/ring don't butt against the panel
     edge (the rightmost bar used to "run into" the edge). */
  .chart { padding: 4px 6px; }
  .cap { color: var(--text-dim); font: 10px var(--ui-font); margin-bottom: 2px; }
  .line { width: 100%; height: 40px; }
  .bars { display: flex; align-items: flex-end; gap: 8px; height: 56px; }
  .col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .bar { width: 100%; border-radius: 2px 2px 0 0; }
  .lbl { color: var(--text-dim); font: 9px var(--ui-font); margin-top: 2px; }
  .val { font: 9px var(--ui-font); color: var(--text-dim); margin-bottom: 1px; }
  .ring { width: 84px; height: 84px; display: block; margin: 0 auto; }
  .ring-label { fill: var(--text); font: 600 14px var(--ui-font); }
  .ring-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; justify-content: center; margin-top: 4px; font: 10px var(--ui-font); color: var(--text-dim); }
  .leg { display: inline-flex; align-items: center; gap: 4px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
</style>
