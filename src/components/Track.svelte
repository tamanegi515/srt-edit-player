<script>
    import { main_media, useRefs, useState, useAudio } from "../lib/store.svelte";
    import { convSecToStr } from "../lib/util";
    import { onMount, onDestroy } from "svelte";

    let { id = $bindable(), ratioValue = $bindable() } = $props();
    //   data = [{startSec:s,endSec:n,text:str}]
    const duration = $derived(main_media.media.duration);
    const data = $derived(main_media.media.srt_data[id].data);

    let zoomRatio = $derived(ratioValue * ratioValue);
    let isDragging = $state(false);
    let didDrag = $state(false);
    let dragStartX = $state(0);
    let draggedClipIndex = $state(-1);
    let draggingEdge = $state(null);

    // ドラッグ開始
    function startEdgeDrag(event, index, edge) {
        isDragging = true;
        didDrag = false;
        dragStartX = event.clientX;
        draggedClipIndex = index;
        draggingEdge = edge;
        document.body.style.cursor = "ew-resize";
    }

    // ドラッグ中
    function onDrag(event) {
        if (isDragging) {
            didDrag = true;
            const deltaX = (event.clientX - dragStartX) / zoomRatio;
            const currentClip = data[draggedClipIndex];
            const nextClip = data[draggedClipIndex + 1];

            // 境界の更新
            if (draggingEdge === "end" && draggedClipIndex < data.length - 1) {
                currentClip.endTime += deltaX;
                currentClip.endTimeStr = convSecToStr(currentClip.endTime);
                nextClip.startTime += deltaX;
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
    onclick={(e) => {
        if (didDrag) { didDrag = false; return; }
        const rect = e.currentTarget.getBoundingClientRect();
        const time = (e.clientX - rect.left) / zoomRatio;
        useAudio.seek(Math.max(0, Math.min(time, duration)));
    }}
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
