<script>
    import { onMount, onDestroy } from "svelte";
    import Track from "./Track.svelte";
    import { main_media, useRefs, useState, useAudio } from "../lib/store.svelte";
    import { convSecToStr } from "../lib/util";

    // let tracks = $state(getSampleTracks());
    let tracks = $derived(main_media.media.srt_data);
    const sumTrackHeight = $derived.by(() => {
        return tracks.reduce((sum, track) => sum + track.height, 0);
    });
    let gridRowStyle = $derived.by(() => {
        const style = tracks.map((track) => `${track.height ?? 40}px`).join(" ");
        return style;
    });
    let leftWidth = $state(300);
    let isResizing = $state(false);
    function startResizing(event) {
        console.log("start_resize");
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
    onMount(() => {
        window.addEventListener("mousemove", handleResize);
        window.addEventListener("mouseup", stopResizing);
    });
    onDestroy(() => {
        window.removeEventListener("mousemove", handleResize);
        window.removeEventListener("mouseup", stopResizing);
    });
    let timeLineRef = $state();
    // 拡大率は useState.timeLineRatio で一元管理
    let intervals = $state([
        [100, 500, 1000, 10000],
        [1000, 5000, 10000, 60000],
        [10000, 30000, 60000, 600000],
        [60000, 300000, 600000, 3600000],
    ]);
    let duration = $state(3600000);
    let pixel_per_msec = $derived((useState.timeLineRatio * useState.timeLineRatio) / 1000);
    let offsetX = $state(0);
    let canvas;
    function panelScroll(e) {
        offsetX = e.target.scrollLeft;
        // console.log(offsetX);
    }
    function scrollTimeLine() {
        const currentTime = main_media.json_data_list[main_media.media_index].seekTime * 1000;
        const currentX = currentTime * pixel_per_msec;
        const containerWidth = timeLineRef.clientWidth;
        if (timeLineRef) {
            timeLineRef.scrollLeft = currentX - containerWidth / 2;
        }
    }
    $effect(() => {
        if (useState.timeLineAuto) {
            scrollTimeLine();
        }
    });
    $effect(() => {
        const ctx = canvas.getContext("2d");
        const parentWidth = timeLineRef?.clientWidth || 300; // フォールバックも指定
        // const width = (canvas.width = zoomRatio*duration);
        const width = (canvas.width = parentWidth);
        const height = (canvas.height = 30);
        const scale_trigger = 80 / pixel_per_msec;
        console.log(scale_trigger);
        let scales = { max: 10000, major: 1000, secondary: 500, minor: 100 };
        if (scale_trigger > 60000) {
            scales = { max: 3600000, major: 600000, secondary: 60000, minor: 30000 };
        } else if (scale_trigger > 10000) {
            scales = { max: 600000, major: 60000, secondary: 30000, minor: 10000 };
        } else if (scale_trigger > 1000) {
            scales = { max: 60000, major: 10000, secondary: 5000, minor: 1000 };
        }
        ctx.clearRect(0, 0, width, height);

        const currentyStart = height;
        const currentyEnd = 0;
        const currentTime = main_media.json_data_list[main_media.media_index].seekTime * 1000;
        const currentX = currentTime * pixel_per_msec + 0.5 - offsetX;
        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(currentX, currentyStart);
        ctx.lineTo(currentX, currentyEnd);
        ctx.stroke();

        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        const start_miliSec = Math.round(offsetX / pixel_per_msec);
        for (let milisecond = start_miliSec; milisecond < width / pixel_per_msec + start_miliSec; milisecond += 1) {
            const x = milisecond * pixel_per_msec + 0.5 - offsetX;
            let lineHeight = 0;
            let lineWidth = 1;
            let lineColor = "#000";
            let dashPattern = [];
            if (milisecond % scales.max === 0) {
                lineHeight = 30;
                lineWidth = 1;
                lineColor = "#80aacc";
            } else if (milisecond % scales.major === 0) {
                lineHeight = 30;
                lineWidth = 1;
                lineColor = "#909090";
            } else if (milisecond % scales.secondary === 0) {
                lineHeight = 16;
                lineWidth = 1;
                lineColor = "#606060";
            } else if (milisecond % scales.minor === 0) {
                lineHeight = 16;
                lineWidth = 1;
                lineColor = "#606060";
                dashPattern = [2, 4]; // 点線
            } else {
                continue; // 不要な目盛はスキップ（保険）
            }
            const yStart = height;
            const yEnd = height - lineHeight;
            // 線の色を設定
            ctx.strokeStyle = lineColor;
            // 点線（minor）の場合、ダッシュパターンを設定
            ctx.setLineDash(dashPattern);
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(x, yStart);
            ctx.lineTo(x, yEnd);
            ctx.stroke();

            // ラベルは主目盛のときだけ
            if (milisecond % scales.major === 0 || milisecond % scales.max === 0) {
                ctx.fillStyle = lineColor;
                const time_text = convSecToStr(milisecond / 1000);
                ctx.font = "10px sans-serif";
                ctx.textAlign = "left";
                ctx.textBaseline = "top";
                ctx.fillText(time_text, x + 2, 0);
            }
        }
    });
</script>

<div bind:this = {useRefs.trackRef}>
    拡大率：<input type="range" min="0.5" max="20" step="0.1" bind:value={useState.timeLineRatio} />
    AutoScroll：
    <label class="toggle_switch" style="margin-right: 5px;">
        <input type="checkbox" bind:checked={useState.timeLineAuto} style="visibility: hidden;" />
        <span class="toggle-slider"></span>
    </label>
    <button class="nmorph_button" onclick={scrollTimeLine}>
        <span class="material-symbols-outlined">skip_next</span>
    </button>
    <div class="track-view" style="grid-template-columns: {leftWidth}px  5px 1fr;grid-template-rows:1fr;">
        <div class="left-panel" style="display: grid;grid-template-columns: 1fr;grid-template-rows:35px {gridRowStyle};">
            <div>tracks</div>
            {#each tracks as track, id}
                <div>{tracks[id].name}</div>
            {/each}
        </div>
        <div class="track_resizer" onmousedown={startResizing}></div>
        <div class="right-panel">
            <div
                class="right-subpanel"
                style="grid-template-rows:35px {gridRowStyle};"
                bind:this={timeLineRef}
                onscroll={(e) => {
                    panelScroll(e);
                }}
            >
                <div class="track" style="grid-row-start:1;grid-row-end:2;">
                    <canvas class="tickmark" bind:this={canvas} style="left:0px;"></canvas>
                </div>
                {#each tracks as track, id}
                    <div class="track" style="grid-row-start:{id + 2};grid-row-end:{id + 3};">
                        <Track {id}></Track>
                    </div>
                {/each}
            </div>
        </div>
    </div>
</div>

<style>
:root {
    --bg: #2c2c2c;
    --panel-bg: #1b1b1b;
    --border-color: #313131;
    --shadow-light: rgba(255, 255, 255, 0.932);
    --shadow-dark: rgb(0, 0, 0);
    --accent: #5e8bff;
    --text-color: #ddd;
}

/* トラックビュー全体 */
.track-view {
    display: grid;
    background: var(--bg);
    border-radius: 1px;
    border: 2px solid var(--border-color);
    overflow: hidden;
}

/* 左パネル: ほぼフラット、ニューモーフィズム感はごく薄く */
.left-panel {
    background: var(--panel-bg);
    border-right: 1px solid var(--border-color);
    color: var(--text-color);
}

/* 左パネルのトラックラベル: カードっぽく */
.left-panel div {
    padding: 6px 10px;
    background: linear-gradient(
        160deg,
        rgb(36, 36, 36) 0%,
        rgb(22, 22, 22) 100%
    );
    border-bottom: 1px solid var(--border-color);
    line-height: 1;
    display: flex;
    align-items: center;
}

/* リサイズバー: フラット */
.track_resizer {
    background: var(--border-color);
    cursor: ew-resize;
}

/* 右パネル: 背景に薄いニューモーフィズム感 */
.right-panel {
    background: var(--panel-bg);
    position: relative;
    min-width: 0;
}

/* スクロール部分: フラットで余白 */
.right-subpanel {
    display: grid;
    grid-template-columns: 1fr;
    overflow-x: scroll;
}

/* 各トラック: カード風のフラット */
.track {
    grid-column-start: 1;
    grid-column-end: 2;
    background: #2a2a2a;
    border-radius: 6px;
    border-bottom: 2px solid var(--border-color);
}

/* 時間目盛キャンバス: シンプルな背景 */
.tickmark {
    background: var(--panel-bg);
    position: absolute;
}



</style>
