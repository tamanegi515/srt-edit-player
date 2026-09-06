<script>
    import { onMount, onDestroy } from "svelte";
    import Track from "./Track.svelte";
    import { mediaState, projectState, uiState, useAudio } from "../lib/store.svelte";
    import { convSecToStr } from "../lib/util";

    // let tracks = $state(getSampleTracks());
    let tracks = $derived(mediaState.media.srt_data);
    const sumTrackHeight = $derived.by(() => {
        return tracks.reduce((sum, track) => sum + track.height, 0);
    });
    let gridRowStyle = $derived.by(() => {
        const style = tracks.map((track) => `${track.height ?? 40}px`).join(" ");
        return style;
    });
    let leftWidth = $state(300);
    let isResizing = $state(false);
    let resizeStartX = 0;
    let resizeStartWidth = 300;
    function startResizing(event) {
        isResizing = true;
        resizeStartX = event.clientX;
        resizeStartWidth = leftWidth;
        document.body.style.cursor = "ew-resize";
    }
    function stopResizing() {
        isResizing = false;
        document.body.style.cursor = "default";
    }
    function handleResize(event) {
        if (!isResizing) return;
        // 絶対 clientX ではなくドラッグ開始からの差分で算出し、min/max でクランプ
        const next = resizeStartWidth + (event.clientX - resizeStartX);
        leftWidth = Math.max(120, Math.min(next, 800));
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
    // 拡大率は uiState.timeLineRatio で一元管理
    let intervals = $state([
        [100, 500, 1000, 10000],
        [1000, 5000, 10000, 60000],
        [10000, 30000, 60000, 600000],
        [60000, 300000, 600000, 3600000],
    ]);
    let duration = $state(3600000);
    let pixel_per_msec = $derived((uiState.timeLineRatio * uiState.timeLineRatio) / 1000);
    let offsetX = $state(0);
    // 再生ヘッドは canvas に描かず DOM 要素で動かす（目盛り全再描画を毎フレーム起こさないため）。
    // 位置は canvas の目盛りと同じ画面座標系（offsetX 補正込み）。
    let playheadX = $derived(
        (projectState.jsonDataList[projectState.mediaIndex]?.seekTime ?? 0) * 1000 * pixel_per_msec - offsetX,
    );
    let canvas = $state();
    let rulerWidth = $state(0);
    $effect(() => {
        if (!timeLineRef) return;
        const element = timeLineRef;
        const observer = new ResizeObserver(() => { rulerWidth = element.clientWidth; });
        rulerWidth = element.clientWidth;
        observer.observe(element);
        return () => observer.disconnect();
    });
    function panelScroll(e) {
        offsetX = e.target.scrollLeft;
        // console.log(offsetX);
    }
    // 手動「Scroll」ボタン用: 再生位置を強制的に中央へ
    export function scrollTimeLine() {
        if (!timeLineRef) return;
        const currentX = projectState.jsonDataList[projectState.mediaIndex].seekTime * 1000 * pixel_per_msec;
        timeLineRef.scrollLeft = currentX - timeLineRef.clientWidth / 2;
    }
    // 自動追従: 毎フレーム中央へ寄せると手動スクロールと競合しガタつくため、
    // 再生ヘッドが表示範囲の中央帯（デッドゾーン）から外れた時だけ中央へ寄せる。
    $effect(() => {
        if (!uiState.timeLineAuto || !timeLineRef) return;
        const currentX = projectState.jsonDataList[projectState.mediaIndex].seekTime * 1000 * pixel_per_msec;
        const view = timeLineRef.clientWidth;
        const left = timeLineRef.scrollLeft;
        const margin = view * 0.15; // 端 15% に入ったら追従（中央 70% はデッドゾーン）
        if (currentX < left + margin || currentX > left + view - margin) {
            timeLineRef.scrollLeft = currentX - view / 2;
        }
    });
    $effect(() => {
        if (!canvas || !rulerWidth || !Number.isFinite(pixel_per_msec) || pixel_per_msec <= 0) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const width = (canvas.width = rulerWidth);
        const height = (canvas.height = 30);
        const scale_trigger = 80 / pixel_per_msec;
        let scales = { max: 10000, major: 1000, secondary: 500, minor: 100 };
        if (scale_trigger > 60000) {
            scales = { max: 3600000, major: 600000, secondary: 60000, minor: 30000 };
        } else if (scale_trigger > 10000) {
            scales = { max: 600000, major: 60000, secondary: 30000, minor: 10000 };
        } else if (scale_trigger > 1000) {
            scales = { max: 60000, major: 10000, secondary: 5000, minor: 1000 };
        }
        ctx.clearRect(0, 0, width, height);

        // 再生ヘッド（赤線）は DOM 要素（.playhead）で描画。ここでは目盛りのみ。
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        const firstTick = Math.ceil(offsetX / pixel_per_msec / scales.minor) * scales.minor;
        const endTime = (offsetX + width) / pixel_per_msec;
        for (let milisecond = firstTick; milisecond < endTime; milisecond += scales.minor) {
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
                <div class="track" style="grid-row-start:1;grid-row-end:2;"
                    onclick={(e) => {
                        // timeLineRef の左端（ビューポート固定）と scrollLeft を使うことで二重加算を防ぐ
                        const rect = timeLineRef.getBoundingClientRect();
                        const clickX = e.clientX - rect.left + timeLineRef.scrollLeft;
                        const time = clickX / pixel_per_msec / 1000;
                        const duration = mediaState.media.duration;
                        useAudio.seek(Math.max(0, Math.min(time, duration)));
                    }}
                    style:cursor="pointer"
                >
                    <canvas class="tickmark" bind:this={canvas} style="left:0px;"></canvas>
                </div>
                {#each tracks as track, id}
                    <div class="track" style="grid-row-start:{id + 2};grid-row-end:{id + 3};">
                        <Track {id}></Track>
                    </div>
                {/each}
            </div>
            <div class="playhead" style="transform: translateX({playheadX}px);"></div>
        </div>
    </div>

<style>
/* テーマトークンは app.css の :root に集約 */

/* トラックビュー全体 */
.track-view {
    display: grid;
    background: #1b1d1f;
    border-radius: 4px;
    border: 1px solid #3a3f42;
    overflow: hidden;
}

/* 左パネル: ほぼフラット、ニューモーフィズム感はごく薄く */
.left-panel {
    background: #1d2022;
    border-right: 1px solid #3a3f42;
    color: var(--text-color);
}

/* 左パネルのトラックラベル: カードっぽく */
.left-panel div {
    padding: 6px 10px;
    background: #202326;
    border-bottom: 1px solid #32373a;
    line-height: 1;
    display: flex;
    align-items: center;
    font-size: 13px;
}

/* リサイズバー: フラット */
.track_resizer {
    background: #33383b;
    cursor: ew-resize;
}

/* 右パネル: 背景に薄いニューモーフィズム感 */
.right-panel {
    background: #17191a;
    position: relative;
    min-width: 0;
    overflow: hidden; /* 再生ヘッド（.playhead）がスクロール時に左隣のパネルへはみ出さないようにする */
}

/* スクロール部分: フラットで余白 */
.right-subpanel {
    display: grid;
    grid-template-columns: 1fr;
    overflow-x: auto;
    overflow-y: hidden;
}

/* 各トラック: カード風のフラット */
.track {
    grid-column-start: 1;
    grid-column-end: 2;
    background: #25282a;
    border-radius: 0;
    border-bottom: 1px solid #353a3d;
}

/* 時間目盛キャンバス: シンプルな背景 */
.tickmark {
    background: #161819;
    position: absolute;
}

/* 再生ヘッド: canvas の目盛りと同じ原点（.right-panel 基準）に重ねる赤い縦線 */
.playhead {
    position: absolute;
    top: 0;
    left: 0;
    width: 2px;
    height: 35px;
    background: #ff3b30;
    pointer-events: none;
    z-index: 3;
    will-change: transform;
}



</style>
