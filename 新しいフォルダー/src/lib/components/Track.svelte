<script>
  let { data = $bindable(), ratioValue = $bindable()} = $props();
  //   data = [{startSec:s,endSec:n,text:str}]
  let duration = $state(3600);
  let zoomRatio = $derived(ratioValue * ratioValue);

  let isDragging = $state(false);
  let dragStartX = $state(0);
  let draggedClipIndex = $state(-1);
  let draggingEdge = $state(null);

  // ドラッグ開始
  function startEdgeDrag(event, index, edge) {
    isDragging = true;
    dragStartX = event.clientX;
    draggedClipIndex = index;
    draggingEdge = edge;
    document.body.style.cursor = "ew-resize";
  }

  // ドラッグ中
  function onDrag(event) {
    if (isDragging) {
      const deltaX = (event.clientX - dragStartX) / zoomRatio;
      const currentClip = data[draggedClipIndex];
      const nextClip = data[draggedClipIndex+1];

      // 境界の更新
      if (draggingEdge === "end" && draggedClipIndex < data.length - 1) {
        currentClip.endTime += deltaX;
        nextClip.startTime += deltaX;
      }
      dragStartX = event.clientX;
    }
  }

  // ドラッグ終了
  function stopDrag() {
    isDragging = false;
    document.body.style.cursor = "default";
  }
  

  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", stopDrag);
</script>

<div class="timeline" style="width: {duration * zoomRatio}px;">
  {#each data as clip, id}
    <div
      class="clip"
      style="left: {clip.startTime * zoomRatio}px; width: {(clip.endTime -
        clip.startTime) *
        zoomRatio}px;"
    >
      {clip.text}
    </div>
    <div
      class="edge"
      style="left: {clip.endTime * zoomRatio}px;"
      onmousedown={(event) => startEdgeDrag(event, id, "end")}
    ></div>
  {/each}
</div>

<style>
  .timeline {
    display: flex;
    align-items: center;
    height: 100%;
    background-color: #f0f0f04b;
    position: relative;
  }

  .clip {
    position: absolute;
    height: 30px;
    background-color: #485c72;
    user-select: none;
  }

  .clip:hover {
    background-color: #45a049;
  }

  .edge {
    position: absolute;
    top: 0;
    width: 5px;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.3);
    cursor: ew-resize;
    z-index: 5;
  }
</style>
