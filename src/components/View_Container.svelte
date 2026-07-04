<script>
    import SrtOverlay from "./SRT_Overlay.svelte";
    import { onDestroy } from "svelte";
    import { clearOverlaySelection, mediaState, useRefs } from "../lib/store.svelte";

    let mousePercent = $state({ x: "0", y: "0" });
    let display_position = $state(false);

    function updateImageRect() {
        if (useRefs.imageRef && useRefs.imageRef.offsetParent) {
            mediaState.imageScale = {
                w: useRefs.imageRef.clientWidth / useRefs.imageRef.naturalWidth,
                h: useRefs.imageRef.clientHeight / useRefs.imageRef.naturalHeight,
            };
            mediaState.imageBaseScale = {
                h: useRefs.imageRef.clientHeight / 1080,
                w: useRefs.imageRef.clientHeight / 1080,
            };
            const imageRect = useRefs.imageRef.getBoundingClientRect();
            const parentRect = useRefs.imageRef.offsetParent.getBoundingClientRect();

            // 親との相対位置
            mediaState.imagePos = {
                x: imageRect.left - parentRect.left,
                y: imageRect.top - parentRect.top,
            };
        }
    }


    function handleMouseMove(event) {
        const rect = useRefs.imageRef.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        mousePercent = {
            x: Math.min(Math.max(0, x), 100).toFixed(1),
            y: Math.min(Math.max(0, y), 100).toFixed(1),
        };
    }

    function clearSelectionFromViewer(event) {
        if (event.target.closest?.(".srt_box")) return;
        clearOverlaySelection();
        document.activeElement?.blur?.();
    }


    let observer;
    function setObserver() {
        // 画像切替のたびに呼ばれるため、古い ResizeObserver を必ず破棄してから張り直す（リーク防止）
        observer?.disconnect();
        if (useRefs.imageRef?.offsetParent) {
            observer = new ResizeObserver(() => {
                updateImageRect();
            });
            observer.observe(useRefs.imageRef.offsetParent);
            updateImageRect();
        }
    }

    onDestroy(() => {
        observer?.disconnect();
    });
</script>

<div class="media-container" onmousedown={clearSelectionFromViewer}>
    {#if mediaState.media.image_data?.currentImage}
        <img src={mediaState.media.image_data.currentImage} alt="表示画像" class="media-image" bind:this={useRefs.imageRef} onload={setObserver} onmousemove={handleMouseMove} />
    {:else}
        <div class="media-placeholder"><span>画像がありません</span></div>
    {/if}
    {#each mediaState.media.srt_data as srt, index}
        {#if !srt.isImageTrack}
            <SrtOverlay index={index} scale={mediaState.imageBaseScale} pos={mediaState.imagePos}></SrtOverlay>
        {/if}
    {/each}
    {#if display_position}
        <div class="overlay-text">
            X: {mediaState.imageScale.w}% / Y: {mediaState.imageScale.h}%
        </div>
    {/if}
</div>


<style>
    .media-container {
        position: relative;
        width: 100%;
        height: 100%;
        background: black;
        overflow: hidden;

        display: flex;
        align-items: center;
        justify-content: center;
    }
    .media-image {
        background: rgb(255, 0, 0);
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
        position: absolute;
    }
    .media-placeholder {
        position: absolute;
        inset: 0;
        background: #050505;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .media-placeholder span {
        color: #5a5a5a;
        font-size: 14px;
        user-select: none;
    }
    .overlay-text {
        position: absolute;
        bottom: 10px;
        right: 10px;
        color: white;
        background: rgba(0, 0, 0, 0.5);
        padding: 4px 8px;
        font-size: 14px;
        border-radius: 4px;
    }
</style>
