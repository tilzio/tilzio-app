<script lang="ts">
  // Brand mark "stacked tiles" — a reusable inline SVG. Static, stateless.
  let { size = 18 }: { size?: number } = $props();
</script>

<svg
  role="img"
  aria-hidden="true"
  viewBox="0 0 1024 1024"
  width={size}
  height={size}
  style="display:block; flex:none;"
>
  <!-- Mark background: dark rounded plate -->
  <rect x="0"   y="0"   width="1024" height="1024" rx="150" fill="var(--brand-bg)" />
  <!-- Focus panel: amber rectangle (the tall left one) -->
  <rect x="176" y="176" width="380"  height="672"  rx="26"  fill="var(--brand-accent)" />
  <!-- Top-right tile -->
  <rect x="588" y="176" width="260"  height="320"  rx="26"  fill="var(--brand-tile)" />
  <!-- Bottom-right tile -->
  <rect x="588" y="528" width="260"  height="320"  rx="26"  fill="var(--brand-tile)" />
  <!-- Cursor block: dark rectangle inside the focus panel -->
  <rect x="236" y="724" width="132"  height="64"   rx="10"  fill="var(--brand-bg)" />
</svg>
