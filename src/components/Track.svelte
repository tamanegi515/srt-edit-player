<script>
    import { mediaState, uiState, useAudio } from "../lib/store.svelte";
    import { convSecToStr } from "../lib/util";
    import { onMount, onDestroy } from "svelte";

    let { id = $bindable() } = $props();
    //   data = [{startSec:s,endSec:n,text:str}]
    const duration = $derived(mediaState.media.duration);
    const data = $derived(mediaState.media.srt_data[id]?.data ?? []);

    let zoomRatio = $derived(uiState.timeLineRatio * uiState.timeLineRatio);
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
            const nextClip = data[draggedClipIndex + 1];
            if (!currentClip || !nextClip) return;

            // 境界の更新
            if (draggingEdge === "end" && draggedClipIndex < data.length - 1) {
                const min = currentClip.startTime;
                const max = nextClip.endTime;
                const nextTime = Math.max(min, Math.min(max, currentClip.endTime + deltaX));
                currentClip.endTime = nextTime;
                currentClip.endTimeStr = convSecToStr(nextTime);
                nextClip.startTime = nextTime;
                nextClip.startTimeStr = convSecToStr(nextClip.startTime);
            }
            dragStartX = event.clientX;
        }
    }

    // ドラッグ終了
    function stopDrag() {
        isDragging = false;
        document.body.style.cursor = "default";
    }

    onMount(() => {
        window.addEventListener("mousemove", onDrag);
        window.addEventListener("mouseup", stopDrag);
    });
    onDestroy(() => {
        window.removeEventListener("mousemove", onDrag);
        window.removeEventListener("mouseup", stopDrag);
    });
</script>

<div class="timeline" style="width: {duration * zoomRatio}px;"
>
    {#each data as clip, id}
        <div class="clip" style="left: {clip.startTime * zoomRatio}px; width: {(clip.endTime - clip.startTime) * zoomRatio}px;"
            ondblclick={(e) => { e.stopPropagation(); useAudio.seek(clip.startTime); }}
        >
            {clip.text}
        </div>
        <div class="edge" style="left: {clip.endTime * zoomRatio}px;" onmousedown={(event) => startEdgeDrag(event, id, "end")}></div>
    {/each}
</div>

<style>
    .timeline {
        display: flex;
        align-items: center;
        height: 100%;
        background-color: #1d1d1d;
        position: relative;
    }

    .clip {
        position: absolute;
        height: 25px;
        background-color: #485c72;
        user-select: none;
        overflow: hidden;
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
