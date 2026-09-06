<script>
    import { onMount } from "svelte";
    import ViewContainer from "./View_Container.svelte";
    import CustomSlider from "./Custom_Slider.svelte";
    import PlaybackRateControl from "./Playback_Rate_Control.svelte";
    import { mediaState, projectState, useAudio } from "../lib/store.svelte";


    let json_data = $derived(projectState.jsonDataList[projectState.mediaIndex]);

    function togglePlayback() {
        if (mediaState.media.isPlaying) {
            useAudio.pause();
        } else {
            if (!useAudio.audio) return;
            // isPlaying の反映と再生位置追従ループの起動は audio の 'play' イベント
            // （store.svelte.js 側）が行う。外部要因（ハードウェアのメディアキー等）で
            // 再生が始まった場合も同じ経路でループが起動するようにするため。
            useAudio.play();
        }
    }

    function seekBy(sec) {
        // ロード直後で duration がまだ未確定（0）の間に復元済み seekTime を破壊しないよう、
        // シークバーの max と同じ「duration と現在の seekTime の大きい方」を上限にする。
        const ceiling = Math.max(mediaState.media.duration || 0, json_data.seekTime || 0);
        useAudio.seek(Math.max(0, Math.min(ceiling, json_data.seekTime + sec)));
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
    function handleStageWheel(event) {
        const scrollTarget = event.target.closest?.(".media-placeholder");
        if (scrollTarget && event.currentTarget.contains(scrollTarget)
            && ["auto", "scroll"].includes(getComputedStyle(scrollTarget).overflowY)
            && scrollTarget.scrollHeight > scrollTarget.clientHeight) {
            event.stopPropagation();
            return;
        }
        handleWheel("seek", event);
    }

    function handleWheel(prop, event) {
        event.preventDefault();
        const delta = Math.sign(event.deltaY);
        const step = event.shiftKey ? 5 : 1;

        switch (prop) {
            case "seek": {
                // seekBy と同じ理由で、上限は duration と現在の seekTime の大きい方にする
                const ceiling = Math.max(mediaState.media.duration || 0, json_data.seekTime || 0);
                useAudio.seek(Math.max(0, Math.min(ceiling, json_data.seekTime + delta)));
                break;
            }
            case "volume":
                useAudio.setVol(Math.max(0, Math.min(1, mediaState.media.volume - delta * 0.02)));
                break;
            case "rate":
                useAudio.setRate(Math.max(0.5, Math.min(3, mediaState.media.playbackRate - delta * 0.05)));
                break;
            default:
                break;
        }
    }

    onMount(() => {
        function onKey(e) {
            if (e.defaultPrevented) return;
            // 入力中（contenteditable / input / textarea / select）や、フォーカス中のボタン
            // 操作（Space/Enterでの押下）は無効化して編集・既存のキー操作を邪魔しない。
            // BUTTON を除外しないと、フォーカス中のボタン上の Space キーがここで
            // preventDefault され、ボタン本来の押下（クリック）が発火しなくなる。
            const t = e.target;
            const tag = t?.tagName;
            if (t?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
            if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                togglePlayback();
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                seekBy(e.shiftKey ? -5 : -1);
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                seekBy(e.shiftKey ? 5 : 1);
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });
</script>

<div class="media-player">
    <div class="media-stage" onclick={togglePlayback} onwheel={handleStageWheel}>
        <ViewContainer></ViewContainer>
    </div>

    <div class="media-controls">
        <div class="control-row">
            <button class="nmorph_button" data-testid="toggle-playback" aria-label={mediaState.media.isPlaying ? "一時停止" : "再生"} onclick={togglePlayback}>
                {#if mediaState.media.isPlaying}
                    <span class="material-symbols-outlined"> pause </span>
                {:else}
                    <span class="material-symbols-outlined"> play_arrow </span>
                {/if}
            </button>
            <div class="bar-container">
            <CustomSlider
                variant="seek"
                aria-label="再生位置"
                min="0"
                max={Math.max(mediaState.media.duration || 0, json_data.seekTime || 0)}
                step="0.1"
                value={json_data.seekTime}
                oninput={(event) => useAudio.seek(event.currentTarget.valueAsNumber)}
                wheelStep={1}
                shiftWheelStep={1}
                wheelDirection={1}
            />
            <p class="setRight">
                {formatTime(json_data.seekTime)} / {formatTime(mediaState.media.duration)}
            </p>
            </div>
            <label class="volume-control" title="音量">
                <span class="material-symbols-outlined" aria-hidden="true">volume_up</span>
                <CustomSlider min="0" max="1" step="0.01" aria-label="音量" value={mediaState.media.volume} oninput={(event) => useAudio.setVol(event.currentTarget.valueAsNumber)}></CustomSlider>
                <span class="control-value">{mediaState.media.volume.toFixed(2)}</span>
            </label>
            <PlaybackRateControl />
        </div>
        {#if !mediaState.media.isAudio}
            <div class="no-audio-note">音声ファイルがありません（字幕の時間のみ表示）</div>
        {/if}
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
    .media-player {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        gap: 6px;
        container-type: inline-size;
        container-name: media-player;
    }
    .media-stage {
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
        padding: 5px;
        container-type: size;
        container-name: media-stage;
    }
    @container media-stage (max-height: 160px) {
        .media-stage :global(.media-placeholder) {
            display: grid;
            grid-template-columns: 28px minmax(0, 1fr);
            align-content: safe center;
            justify-items: center;
            gap: 4px 8px;
            padding: 4px 8px;
            overflow-y: auto;
        }
        .media-stage :global(.placeholder-icon) {
            grid-row: 1 / 3;
            font-size: 24px;
            line-height: 1;
        }
        .media-stage :global(.media-placeholder > strong),
        .media-stage :global(.media-placeholder > span:last-child) {
            grid-column: 2;
        }
    }
    .media-controls {
        --control-size: var(--control-height, 32px);
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0 5px 5px; /* media-stage の padding: 5px と左右端を揃える */
        padding: 4px 6px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: var(--panel-bg);
        box-shadow: var(--panel-shadow);
    }
    .control-row {
        display: grid;
        grid-template-columns: 32px minmax(100px, 1fr) max-content max-content;
        align-items: center;
        gap: 8px;
        min-height: var(--control-size);
    }
    .volume-control {
        display: grid;
        grid-template-columns: 24px 72px 36px;
        align-items: center;
        gap: 6px;
        height: var(--control-size);
        white-space: nowrap;
    }
    .volume-control :global(input[type="range"]) {
        width: 100%;
        min-width: 0;
    }
    @container media-player (max-width: 650px) {
        .control-row {
            grid-template-columns: 32px minmax(0, 1fr);
            gap: 4px 6px;
        }
        .control-row :global(.playback-rate-control) {
            grid-column: 1 / -1;
            justify-self: end;
            grid-row: 2;
        }
        .volume-control {
            grid-column: 1 / -1;
            grid-row: 2;
            justify-self: start;
        }
    }
    @container media-player (max-width: 369px) {
        .control-row :global(.playback-rate-control) {
            grid-row: 3;
        }
    }
    .control-value {
        text-align: right;
        font-variant-numeric: tabular-nums;
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
        text-align: right; /* 右揃えに設定 */
        margin: 0;
        font-variant-numeric: tabular-nums;
    }

    .bar-container {
        display: grid;
        grid-template-columns: minmax(0, 1fr) max-content;
        align-items: center;
        gap: 6px;
        width: 100%;
        min-width: 0;
        height: var(--control-size);
    }

    .no-audio-note {
        color: #8a8a8a;
        font-size: 12px;
        text-align: center;
        margin: 0;
        line-height: 16px;
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
