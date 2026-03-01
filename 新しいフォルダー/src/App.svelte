<script>
  import Track from "./lib/components/Track.svelte";
  import { getSampleTracks } from "./sampleData";

  let ratioValue = $state(1);
  let tracks = $state(getSampleTracks());
  const sumTrackHeight = $derived.by(() => {
    return tracks.reduce((sum, track) => sum + track.height, 0);
  });
  let gridRowStyle = $derived.by(() => {
    const style = tracks.map((track) => `${track.height}px`).join(" ");
    console.log(style);
    return style;
  });

  let leftWidth = $state(100);
  let isResizing = $state(false);

  function startResizing(event) {
    console.log("start_resize")
    isResizing = true;
    document.body.style.cursor = "ew-resize";
  }

  function stopResizing() {
    isResizing = false;
    document.body.style.cursor = "default";
  }

  function handleResize(event) {
    if (isResizing) {
      leftWidth = event.clientX;
    }
  }

  window.addEventListener("mousemove", handleResize);
  window.addEventListener("mouseup", stopResizing);
</script>

<input type="range" min="0.5" max="10" step="0.5" bind:value={ratioValue}>
<div
  class="track-view"
  style="grid-template-columns: {leftWidth}px  10px 1fr;grid-template-rows:1fr;"
>
  <div
    class="left-panel"
    style="display: grid;grid-template-columns: 1fr;grid-template-rows:{gridRowStyle};"
  >
    {#each tracks as track, id}
      <div>{tracks[id].name}</div>
    {/each}
  </div>
  <div class="track_resizer" onmousedown={startResizing}></div>
  <div
    class="right-panel"
    style="display: grid;grid-template-columns: 1fr;grid-template-rows:{gridRowStyle};overflow-x:auto;"
    >
    {#each tracks as track, id}
      <div class="track" style="grid-row-start:{id + 1};grid-row-end:{id + 2};">
        <Track bind:data={tracks[id].data} bind:ratioValue></Track>
      </div>
    {/each}
  </div>
</div>

<style>
  .track-view {
    display: grid;
    height: 50vh;
  }

  .left-panel {
    background-color: rgb(51, 60, 63);
    transition: width 0.2s ease;
  }

  .track_resizer {
    background-color: #333;
    cursor: ew-resize;
  }

  .right-panel {
    background-color: rgb(45, 58, 45);
  }
  .track {
    grid-column-start: 1;
    grid-column-end: 2;
    outline: 1px solid #616161;
    outline-offset: -1px;
  }
</style>
