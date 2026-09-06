<script>
    import { onDestroy, untrack } from "svelte";
    import { getFileFromPath } from "../lib/util";
    import { mediaState, projectState, uiState } from "../lib/store.svelte";
    import { getCurrentText } from "../lib/data_process";

    const json_data = $derived(projectState.jsonDataList[projectState.mediaIndex]);
    const imageTrack = $derived(mediaState.media.srt_data.find(t => t.isImageTrack));
    let imageRequestToken = 0;
    let pendingImage = $state.raw(null);
    const imageNavigationIndex = $derived(pendingImage?.target === mediaState.media.image_data
        ? pendingImage.index : mediaState.media.image_data.currentId);
    const autoImage = $derived(imageTrack ? getCurrentText(imageTrack.data, json_data.seekTime) : null);
    const autoImagePath = $derived(autoImage?.text ?? "");
    const autoImageIndex = $derived(autoImage?.index ?? -1);

    async function loadImage(targetImageData, dirHandle, path, index, token) {
        pendingImage = { target: targetImageData, index };
        try {
            const imageFile = await getFileFromPath(dirHandle, path.replace(/\\/g, "/"));
            if (!imageFile || token !== imageRequestToken || mediaState.media.image_data !== targetImageData) return;
            const imageURL = URL.createObjectURL(imageFile);
            const oldUrl = targetImageData.currentImage;
            targetImageData.currentImage = imageURL;
            targetImageData.currentImagePath = path;
            targetImageData.currentId = index;
            if (oldUrl?.startsWith("blob:")) URL.revokeObjectURL(oldUrl);
        } catch {
            console.warn("画像切り替えをスキップしました");
        } finally {
            if (token === imageRequestToken) pendingImage = null;
        }
    }

    // Track the requested entry, not every playback frame or the eventual image write.
    $effect(() => {
        const enabled = uiState.imageAuto;
        const path = enabled ? autoImagePath : "";
        const index = enabled ? autoImageIndex : -1;
        const targetImageData = mediaState.media.image_data;
        const dirHandle = projectState.dirHandle;
        untrack(() => {
            const token = ++imageRequestToken;
            pendingImage = null;
            if (!enabled || !path) return;
            if (path === targetImageData.currentImagePath && targetImageData.currentImage) {
                targetImageData.currentId = index;
                return;
            }
            void loadImage(targetImageData, dirHandle, path, index, token);
        });
    });
    onDestroy(() => { imageRequestToken++; });

    async function changeIMG(id) {
        if (!imageTrack) return;
        const data = imageTrack.data;
        const targetImageData = mediaState.media.image_data;
        const nextId = imageNavigationIndex + id;
        if (nextId < 0 || nextId >= data.length) return;
        await loadImage(targetImageData, projectState.dirHandle, data[nextId].text, nextId, ++imageRequestToken);
    }
</script>

<div class="image-control-group">
    <button class="nmorph_button" aria-label="前の画像" title="前の画像"
        disabled={imageNavigationIndex <= 0}
        onclick={() => changeIMG(-1)}><span class="material-symbols-outlined"> keyboard_double_arrow_left </span></button>
    <span>画像</span>
    <button class="nmorph_button" aria-label="次の画像" title="次の画像"
        disabled={imageNavigationIndex >= (imageTrack?.data.length ?? 1) - 1}
        onclick={() => changeIMG(1)}><span class="material-symbols-outlined"> keyboard_double_arrow_right </span></button>
    <label class="toggle_switch" title="画像自動切り替え">
        <input type="checkbox" aria-label="画像自動切り替え" bind:checked={uiState.imageAuto} />
        <span class="toggle-slider"></span>
    </label>
</div>

<style>
    .image-control-group {
        --control-size: 32px;
        display: grid;
        grid-template-columns: var(--control-size) max-content var(--control-size) 30px;
        align-items: center;
        gap: 6px;
        height: var(--control-size);
        min-width: 0;
        white-space: nowrap;
    }
    .material-symbols-outlined {
        font-variation-settings: "FILL" 1, "wght" 300, "GRAD" 0, "opsz" 24;
    }
    .toggle_switch input {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        margin: 0;
        opacity: 0;
        cursor: pointer;
    }
</style>
