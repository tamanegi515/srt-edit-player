<script>
    import { onMount } from "svelte";
    import ViewContainer from "./View_Container.svelte";
    import { getFileFromPath, wheelAdjust } from "../lib/util";
    import CustomSlider from "./Custom_Slider.svelte";
    import { mediaState, projectState, uiState, useAudio, useRefs } from "../lib/store.svelte";
    import { getCurrentText } from "../lib/data_process";


    let json_data = $derived(projectState.jsonDataList[projectState.mediaIndex]);
    // 画像srtトラック（常に srt_data の最後に入る）
    let imageTrack = $derived(mediaState.media.srt_data.find(t => t.isImageTrack));

    // seekTime の変化を監視して画像を自動切り替え（再生中・手動シーク両方対応）
    $effect(() => {
        if (!uiState.imageAuto || !imageTrack) return;
        const entry = getCurrentText(imageTrack.data, json_data.seekTime);
        if (!entry.text || entry.text === mediaState.media.image_data.currentImagePath) return;
        // async 画像読み込み
        (async () => {
            const imageFile = await getFileFromPath(projectState.dirHandle, entry.text.replace(/\\/g, "/"));
            if (!imageFile) return;
            const imageURL = URL.createObjectURL(imageFile);
            const oldUrl = mediaState.media.image_data.currentImage;
            if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
            mediaState.media.image_data.currentImage = imageURL;
            mediaState.media.image_data.currentImagePath = entry.text;
            mediaState.media.image_data.currentId = entry.index;
        })().catch((err) => console.warn("画像自動切り替えをスキップ:", entry.text, err));
    });

    function scrollEditor() {
        for (const ref of useRefs.editorRefs) {
            if (ref) {
                ref.scrollToIndex(json_data.seekTime);
            }
        }
    }

    function togglePlayback() {
        if (mediaState.media.isPlaying) {
            useAudio.pause();
        } else {
            if (!useAudio.audio) return;
            useAudio.play();
            requestAnimationFrame(tick);
        }
    }
    async function tick() {
        if (useAudio.audio && !useAudio.audio.paused) {
            json_data.seekTime = useAudio.audio.currentTime;
            if (uiState.autoScroll) {
                scrollEditor();
            }
            requestAnimationFrame(tick);
        }
    }
    async function changeIMG(id) {
        if (!imageTrack) return;
        const data = imageTrack.data;
        const nextId = mediaState.media.image_data.currentId + id;
        if (nextId < 0 || nextId >= data.length) return;
        mediaState.media.image_data.currentId = nextId;
        const imageFile = await getFileFromPath(projectState.dirHandle, data[nextId].text.replace(/\\/g, "/")).catch((err) => {
            console.warn("画像切り替えをスキップ:", data[nextId].text, err);
            return null;
        });
        if (!imageFile) return;
        const imageURL = URL.createObjectURL(imageFile);
        // 旧画像 URL を即座に解放
        const oldUrl = mediaState.media.image_data.currentImage;
        if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
        mediaState.media.image_data.currentImage = imageURL;
        mediaState.media.image_data.currentImagePath = data[nextId].text;
    }
    // タイム表示
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60)
            .toString()
            .padStart(2, "0");
        return `${mins}:${secs}`;
    }

    function formattedTime() {
        const formattedSeek = formatTime(json_data.seekTime);
        const formattedDuration = formatTime(mediaState.media.duration);
        return `${formattedSeek}/${formattedDuration}`;
    }
    function handleWheel(prop, event) {
        event.preventDefault();
        const delta = Math.sign(event.deltaY);
        const step = event.shiftKey ? 5 : 1;

        switch (prop) {
            case "seek":
                json_data.seekTime = Math.max(0, Math.min(mediaState.media.duration || 0, json_data.seekTime + delta));
                useAudio.seek();
                break;
            case "volume":
                mediaState.media.volume = Math.max(0, Math.min(1, mediaState.media.volume - delta * 0.02));
                useAudio.setVol();
                break;
            case "rate":
                mediaState.media.playbackRate = Math.max(0.5, Math.min(3, mediaState.media.playbackRate - delta * 0.05));
                useAudio.setRate();
                break;
            default:
                break;
        }
    }
</script>

<!-- App全体をflex columnにする -->
<div style="display: flex; flex-direction: column; height: 100%;">
    <!-- 残りの高さを埋める -->
    <div style="flex: 1; overflow: hidden;padding: 5px;height: 100%;" onclick={togglePlayback} onwheel={(e) => handleWheel("seek", e)}>
        <ViewContainer></ViewContainer>
    </div>

    <!-- 下部の音声コントロールUI -->
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 10px;">
        <div class="bar-container" style="height: 30px;">
            <input
                type="range"
                min="0"
                max={mediaState.media.duration}
                step="0.1"
                bind:value={json_data.seekTime}
                oninput={() => useAudio.seek()}
                onwheel={(e) => handleWheel("seek", e)}
            />
            <p class="setRight">
                {formatTime(json_data.seekTime)} / {formatTime(mediaState.media.duration)}
            </p>
        </div>

        <div style="display: flex; align-items: center; gap: 10px;">
            <button class="nmorph_button" onclick={togglePlayback}>
                {#if mediaState.media.isPlaying}
                    <span class="material-symbols-outlined"> pause </span>
                {:else}
                    <span class="material-symbols-outlined"> play_arrow </span>
                {/if}
            </button>

            <label>
                音量：
                <CustomSlider min="0" max="1" step="0.01" bind:value={mediaState.media.volume} oninput={() => useAudio.setVol()}></CustomSlider>
                <span style="display: inline-block;width: 40px;">{mediaState.media.volume.toFixed(2)}</span>
            </label>

            <label>
                倍速：
                <CustomSlider min="0.5" max="3.0" step="0.05" bind:value={mediaState.media.playbackRate} oninput={() => useAudio.setRate()}></CustomSlider>
                <span style="display: inline-block;width: 40px;">{mediaState.media.playbackRate.toFixed(2)}</span>
            </label>

            <div style="flex: 0 1 auto;">
                <button class="nmorph_button"
                    disabled={mediaState.media.image_data.currentId <= 0}
                    onclick={() => changeIMG(-1)}><span class="material-symbols-outlined"> keyboard_double_arrow_left </span></button>
                画像
                <button class="nmorph_button"
                    disabled={mediaState.media.image_data.currentId >= (imageTrack?.data.length ?? 1) - 1}
                    onclick={() => changeIMG(1)}><span class="material-symbols-outlined"> keyboard_double_arrow_right </span></button>
                <label class="toggle_switch" title="画像自動切り替え" style="margin: 0 5px; vertical-align: middle;">
                    <input type="checkbox" bind:checked={uiState.imageAuto} style="visibility: hidden;" />
                    <span class="toggle-slider"></span>
                </label>
            </div>
        </div>
    </div>
</div>

<style>
    .material-symbols-outlined {
        font-variation-settings:
            "FILL" 1,
            "wght" 300,
            "GRAD" 0,
            "opsz" 24;
        /* font-weight:300; */
    }
    .playArea {
        flex: 1;
        position: relative;
        width: 100%;
        height: calc(100% - 75px);
    }

    .image {
        margin: 10px;
        object-fit: contain;
        width: calc(100% - 20px);
        height: calc(100% - 20px);
        max-width: 100%;
        max-height: 100%;
        background-color: black;
        border: 1px solid rgb(0, 0, 0);
    }

    .setRight {
        white-space: nowrap;
        width: 90px; /* 固定幅を設定 */
        text-align: right; /* 右揃えに設定 */
        margin-right: 10px; /* テキストとバーの間隔を設定 */
    }

    input[type="range"] {
        vertical-align: middle;
        margin: 5px 5px 5px 5px;
        flex: 1; /* 残りの幅を占めるように設定 */
        appearance: none;
        --track-right-color: #2c969e;
        --track-left-color: #505050;
        background-color: var(--track-left-color);
        height: 8px;
        border-radius: 4px;
    }

    input[type="range"]::-webkit-slider-runnable-track {
        background: transparent;
        height: 8px;
        border: solid 1px #000000;
        border-radius: 4px;
    }

    input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        background-color: #818181;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        transform: scale(2);
        border: solid 1px #2e2e2e;
    }

    .bar-container {
        display: flex;
        align-items: center;
        width: 100%;
    }

    .playBtn {
        align-items: center;
        height: 30px;
        width: 30px;
    }

    .text-box {
        position: absolute;
        transform-origin: top left;
        width: auto;
        height: auto;
    }

    .draggable-text {
        width: max-content;
        height: max-content;
        /* max-width: 1000px;
      max-height: 200px; */
        /* border: 1px solid #2c969e; */
        /* overflow: hidden; */
        display: flex;
        padding: 10px;
        caret-color: rgb(0, 0, 0); /* カーソルの色を指定 */

        user-select: none;
        cursor: grab;
        transform: translate(0%, 0%);

        /* 改行表示 */
        white-space: pre-wrap;
        word-wrap: break-word;

        /* 縦書き */
        text-orientation: upright;
    }

    .text-outline {
        position: absolute;
    }

    .top {
        position: absolute;
        top: 0;
        right: 5px;
        left: 5px;
        height: 5px;
        cursor: ns-resize;
    }

    .bottom {
        position: absolute;
        bottom: 0;
        right: 5px;
        left: 5px;
        height: 5px;
        cursor: ns-resize;
    }

    .left {
        position: absolute;
        top: 5px;
        bottom: 5px;
        left: 0;
        width: 5px;
        cursor: ew-resize;
    }

    .right {
        position: absolute;
        top: 5px;
        right: 0;
        bottom: 5px;
        width: 5px;
        cursor: ew-resize;
    }

    .tleft {
        position: absolute;
        top: 0;
        left: 0;
        width: 5px;
        height: 5px;
        cursor: nwse-resize;
    }

    .tright {
        position: absolute;
        top: 0;
        right: 0;
        width: 5px;
        height: 5px;
        cursor: nesw-resize;
    }

    .bleft {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 5px;
        height: 5px;
        cursor: nesw-resize;
    }

    .bright {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 5px;
        height: 5px;
        cursor: nwse-resize;
    }
</style>
