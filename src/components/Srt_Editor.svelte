<script>
    import {
        mediaState,
        projectState,
        selectEditorClip,
        selectionState,
        setEditorColumnTrack,
        uiState,
        useAudio,
    } from "../lib/store.svelte";
    import { getCurrentText } from "../lib/data_process";
    import { convSecToStr } from "../lib/util";
    import { editClips } from "../lib/editor_history";
    import { getClipBlocks } from "../lib/subtitle_blocks";
    import CustomTextarea from "./Custom_Textarea.svelte";
    import { onDestroy, onMount, tick, untrack } from "svelte";

    let { column, onsplitbox = () => {}, ...props } = $props();

    let editableSrtFiles = $derived(mediaState.media.srt_data.filter((track) => !track.isImageTrack));
    let selectedTrack = $derived(editableSrtFiles.find((track) => track.id === column.trackId) ?? editableSrtFiles[0]);
    let srt_data = $derived(selectedTrack?.data ?? []);
    let hasClips = $derived((selectedTrack?.data?.length ?? 0) > 0);
    let editorRefs = $state({});
    let editorScrollBox = $state();
    let json_data = $derived(projectState.jsonDataList[projectState.mediaIndex]);
    let currentIndex = $derived(getCurrentText(srt_data, json_data.seekTime).index);
    const editorKey = (index, blockId = null) => JSON.stringify([index, blockId]);

    async function focusBlock(index, blockId) {
        await tick();
        editorRefs[editorKey(index, blockId)]?.focusEditor();
    }

    async function splitBox(request) {
        const result = await onsplitbox(request);
        if (result) await focusBlock(result.index, result.blockId);
    }

    $effect(() => {
        const index = currentIndex;
        const track = selectedTrack;
        if (uiState.autoScroll && editorScrollBox && track && index >= 0) {
            untrack(() => scrollToIndex(json_data.seekTime));
        } else {
            lastScrollClip = null;
        }
    });

    $effect(() => {
        if (!selectedTrack && editableSrtFiles[0]) setEditorColumnTrack(column.id, editableSrtFiles[0].id);
    });

    function iscurrent(id) {
        return selectedTrack?.data[id]?.startTime <= json_data.seekTime && json_data.seekTime <= selectedTrack?.data[id]?.endTime;
    }

    let isProgrammaticScroll = false;
    let scrollTimer;
    let lastScrollClip = null;
    let lastScrollTrack = null;

    function finishScroll() {
        clearTimeout(scrollTimer);
        isProgrammaticScroll = false;
    }

    function manualScroll() {
        finishScroll();
        lastScrollClip = null;
        uiState.autoScroll = false;
    }

    export function scrollToIndex(time, force = false) {
        const index = getCurrentText(selectedTrack?.data ?? [], time).index;
        const clip = srt_data[index];
        if (!force && clip === lastScrollClip && selectedTrack === lastScrollTrack) return;
        const target = editorScrollBox?.children[index]?.querySelector(".editor");
        if (index < 0 || !target || !editorScrollBox) return;
        lastScrollClip = clip;
        lastScrollTrack = selectedTrack;
        const targetRect = target.getBoundingClientRect();
        const containerRect = editorScrollBox.getBoundingClientRect();
        if (!force && targetRect.top >= containerRect.top && targetRect.bottom <= containerRect.bottom) return;
        const targetTop = editorScrollBox.scrollTop + targetRect.top - containerRect.top;
        const centeredTop = targetTop - (editorScrollBox.clientHeight - target.offsetHeight) / 2;
        const top = Math.max(0, Math.min(centeredTop, editorScrollBox.scrollHeight - editorScrollBox.clientHeight));
        if (Math.abs(top - editorScrollBox.scrollTop) < 1) return;
        isProgrammaticScroll = true;
        clearTimeout(scrollTimer);
        editorScrollBox.scrollTo({ top, behavior: "smooth" });
        scrollTimer = setTimeout(finishScroll, 1000);
    }

    function handleExternalScroll(event) {
        scrollToIndex(event.detail?.time ?? json_data.seekTime, true);
    }

    function JumpAudio(index) {
        useAudio.seek(selectedTrack.data[index].startTime);
    }

    function onTextareaFocus(index, blockId = null) {
        if (!selectedTrack) return;
        selectEditorClip(selectedTrack.id, index, blockId);
    }

    function clampBoundary(time, min, max) {
        return Math.max(min, Math.min(time, max));
    }

    function setStartTime(id) {
        if (id > 0) {
            const time = clampBoundary(json_data.seekTime, srt_data[id - 1].startTime, srt_data[id].endTime);
            editClips(selectedTrack, [srt_data[id], srt_data[id - 1]], () => {
                srt_data[id].startTime = time;
                srt_data[id - 1].endTime = srt_data[id].startTime;
                srt_data[id].startTimeStr = convSecToStr(srt_data[id].startTime);
                srt_data[id - 1].endTimeStr = convSecToStr(srt_data[id - 1].endTime);
            });
        }
    }

    function setEndTime(id) {
        if (id < srt_data.length - 1) {
            const time = clampBoundary(json_data.seekTime, srt_data[id].startTime, srt_data[id + 1].endTime);
            editClips(selectedTrack, [srt_data[id], srt_data[id + 1]], () => {
                srt_data[id].endTime = time;
                srt_data[id + 1].startTime = srt_data[id].endTime;
                srt_data[id].endTimeStr = convSecToStr(srt_data[id].endTime);
                srt_data[id + 1].startTimeStr = convSecToStr(srt_data[id + 1].startTime);
            });
        }
    }

    onMount(() => {
        window.addEventListener("srt-editor-scroll-current", handleExternalScroll);
    });

    onDestroy(() => {
        clearTimeout(scrollTimer);
        window.removeEventListener("srt-editor-scroll-current", handleExternalScroll);
    });
</script>

<div class="srt-editor">
    {#if editableSrtFiles.length}
    <div class="track-select-row">
        <select class="srt_select" value={column.trackId} onchange={(e) => setEditorColumnTrack(column.id, Number(e.currentTarget.value))}>
            {#each editableSrtFiles as srt}
                <option value={srt.id}>{srt.name}</option>
            {/each}
        </select>
    </div>
    {/if}
    {#if selectedTrack && hasClips}
    {#key selectedTrack}
    <div
        class="box"
        role="region"
        aria-label="字幕クリップ"
        tabindex="0"
        bind:this={editorScrollBox}
        data-testid="editor-scroll"
        onwheel={manualScroll}
        ontouchmove={manualScroll}
        onpointerdown={(e) => { if (e.target === editorScrollBox) manualScroll(); }}
        onkeydown={(e) => {
            if (!e.target.isContentEditable && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) manualScroll();
        }}
        onscrollend={finishScroll}
        onscroll={() => {
            if (!isProgrammaticScroll) manualScroll();
        }}
    >
        {#each selectedTrack.data ?? [] as srtdata, index (srtdata)}
            <div class="clip-row">
                <div class="clip-controls">
                <button class="dark nmorph_button jump_button" onclick={() => JumpAudio(index)} title="この字幕へ移動" aria-label="この字幕へ移動">
                    <span class="material-symbols-outlined" style="font-size:20px;"> turn_left </span>
                </button>

                {#if iscurrent(index)}
                    <button class="time-button" onclick={() => setStartTime(index)}>{convSecToStr(srtdata.startTime)}</button>
                    <small> - </small>
                    <button class="time-button" onclick={() => setEndTime(index)}>{convSecToStr(srtdata.endTime)}</button>
                {:else}
                    <small class="time-label">{convSecToStr(srtdata.startTime)} - {convSecToStr(srtdata.endTime)}</small>
                {/if}
                <button type="button" class="nmorph_button block-action" title="表示ボックスを分割" aria-label="表示ボックスを分割"
                    onmousedown={(e) => e.preventDefault()}
                    onclick={() => editorRefs[editorKey(index, selectionState.editorTrackId === selectedTrack.id && selectionState.editorClipIndex === index ? selectionState.editorBlockId : null)]?.splitIntoBox()}>
                    <span class="material-symbols-outlined">splitscreen</span>
                </button>
                </div>
                {#each getClipBlocks(srtdata) as block, blockIndex (block.id ?? "primary")}
                <div class="block-editor" data-block-id={block.id ?? "primary"}>
                {#if srtdata.additionalBlocks?.length}
                    <div class="block-heading">
                        <span>箱 {blockIndex + 1}</span>
                        {#if block.id !== null}
                        <button type="button" class="nmorph_button block-action" title="前の箱と結合" aria-label="前の箱と結合"
                            onmousedown={(e) => e.preventDefault()}
                            onclick={() => editorRefs[editorKey(index, block.id)]?.mergeWithPreviousBox()}>
                            <span class="material-symbols-outlined">merge</span>
                        </button>
                        {/if}
                    </div>
                {/if}
                <CustomTextarea
                    track={selectedTrack}
                    data={srtdata}
                    blockId={block.id}
                    onsplitbox={splitBox}
                    onblockfocus={(id) => focusBlock(index, id)}
                    selected={selectionState.editorTrackId === selectedTrack.id && selectionState.editorClipIndex === index && (selectionState.editorBlockId ?? null) === block.id}
                    onfocus={() => onTextareaFocus(index, block.id)}
                    bind:this={editorRefs[editorKey(index, block.id)]}
                />
                </div>
                {/each}
            </div>
        {/each}
    </div>
    {/key}
    {:else}
        <div class="empty-editor-state">
            <span class="material-symbols-outlined empty-icon">subtitles</span>
            {#if projectState.dirHandle}
                <strong>字幕クリップがありません</strong>
                <p>右上の字幕名にファイル名を入力して、追加ボタンで最初の字幕を作成します。</p>
            {:else}
                <strong>フォルダを開くと字幕を編集できます</strong>
                <p>左上のフォルダボタンから、音声・画像・字幕ファイルの入った作業フォルダを選択します。</p>
            {/if}
        </div>
    {/if}
</div>

<style>
    .block-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 24px;
        padding: 0 3px;
        font-size: 12px;
    }
    .block-action {
        --control-size: 24px;
    }
    .srt-editor {
        /* 高さは親（.editor-column-body）の flex stretch に任せる。
           height:100% + margin だと親を数px超えて余計な縦スクロールバーが出る */
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-top: 3px;
        box-sizing: border-box;
    }
    .track-select-row {
        flex: 0 0 auto;
    }
    .box {
        flex: 1 1 auto;
        min-height: 0;
        box-sizing: border-box;
        border: 1px solid #3d4143;
        background-color: #202123;
        padding: 10px 7px;
        overflow-y: auto;
        overflow-x: hidden;
        width: 100%;
        scrollbar-gutter: stable;
        border-radius: 5px;
    }
    .clip-row {
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid #303438;
    }
    .clip-row:last-child {
        border-bottom: 0;
        margin-bottom: 0;
    }
    .clip-controls {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 6px;
    }
    .time-button {
        height: 24px;
        color: #d6dddd;
        background: #2d3032;
        border: 1px solid #454a4d;
        border-radius: 4px;
        cursor: pointer;
    }
    .time-label {
        color: #9fa8aa;
        letter-spacing: 0;
    }
    .empty-editor-state {
        flex: 1 1 auto;
        min-height: 0;
        box-sizing: border-box;
        width: 100%;
        border: 1px dashed #42484b;
        border-radius: 6px;
        background: linear-gradient(180deg, #202123 0%, #1b1c1e 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 28px 24px;
        text-align: center;
        color: #b9c2c4;
    }
    .empty-editor-state strong {
        color: #e0e7e8;
        font-size: 15px;
        font-weight: 600;
    }
    .empty-editor-state p {
        max-width: 320px;
        margin: 0;
        color: #97a2a5;
        font-size: 13px;
        line-height: 1.6;
    }
    .empty-icon {
        color: #2cbfc0;
        font-size: 32px;
        opacity: 0.9;
    }
    .jump_button {
        height: 24px;
        margin: 0;
    }
    .srt_select {
        height: 28px;
        box-sizing: border-box;
        width: 100%;
        margin: 0;
        color: #b4b4b4;
        background-color: #4242424f;
        border: 1px solid #a3a3a328;
        border-radius: 4px;
    }
    .dark {
        accent-color: #14d3b9;
        background: #313131;
        color: #bebebe;
        border-width: 1px;
        border-radius: 4px;
        border-right: 1px solid #000000;
        border-bottom: 1px solid #000000;
        background-image: linear-gradient(to top left, rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.2) 30%, rgba(0, 0, 0, 0));
    }
    .dark:active {
        color: #b4b4b4;
        background: #333333;
        border-right: 1px solid #3f3f3f;
        border-bottom: 1px solid #3f3f3f;
        background-image: linear-gradient(to top left, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.2) 30%, rgba(0, 0, 0, 0.2));
    }
</style>
