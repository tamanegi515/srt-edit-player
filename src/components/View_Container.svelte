<script>
    import { scale } from "svelte/transition";
    import SrtOverlay from "./SRT_Overlay.svelte";
    import { onMount, onDestroy } from "svelte";
    import { main_media, useRefs, useState, useAudio } from "../lib/store.svelte";

    let mousePercent = $state({ x: "0", y: "0" });
    let display_position = $state(false);

    function updateImageRect() {
        if (useRefs.imageRef && useRefs.imageRef.offsetParent) {
            main_media.imageScale = {
                w: useRefs.imageRef.clientWidth / useRefs.imageRef.naturalWidth,
                h: useRefs.imageRef.clientHeight / useRefs.imageRef.naturalHeight,
            };
            main_media.imageBaseScale = {
                h: useRefs.imageRef.clientHeight / 1080,
                w: useRefs.imageRef.clientHeight / 1080,
            };
            const imageRect = useRefs.imageRef.getBoundingClientRect();
            const parentRect = useRefs.imageRef.offsetParent.getBoundingClientRect();

            // 親との相対位置
            main_media.imagePos = {
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


    let observer;
    function setObserver() {
        if (useRefs.imageRef) {
            observer = new ResizeObserver(() => {
                updateImageRect();
            });
            observer.observe(useRefs.imageRef.offsetParent);
            updateImageRect();
        }
    }

    onDestroy(() => {
        if (observer && useRefs.imageRef) {
            observer.unobserve(useRefs.imageRef);
        }
    });
</script>

<div class="media-container">
    {#if main_media.media.image_data?.currentImage}
        <img src={main_media.media.image_data.currentImage} alt="表示画像" class="media-image" bind:this={useRefs.imageRef} onload={setObserver} onmousemove={handleMouseMove} />
        {#each main_media.media.srt_data as srt, index}
            <SrtOverlay index={index} bind:scale={main_media.imageBaseScale} bind:pos={main_media.imagePos}></SrtOverlay>
        {/each}
    {/if}
    {#if display_position}
        <div class="overlay-text">
            X: {main_media.imageScale.w}% / Y: {main_media.imageScale.h}%
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
