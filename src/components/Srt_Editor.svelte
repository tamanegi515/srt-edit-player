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
    import CustomTextarea from "./Custom_Textarea.svelte";
    import { onDestroy, onMount } from "svelte";

    let { column, ...props } = $props();

    let editableSrtFiles = $derived(mediaState.media.srt_data.filter((track) => !track.isImageTrack));
    let selectedTrack = $derived(editableSrtFiles.find((track) => track.id === column.trackId) ?? editableSrtFiles[0]);
    let srt_data = $derived(selectedTrack?.data ?? []);
    let hasClips = $derived((selectedTrack?.data?.length ?? 0) > 0);
    let editorRefs = $state([]);
    let editorScrollBox = $state();
    let json_data = $derived(projectState.jsonDataList[projectState.mediaIndex]);

    $effect(() => {
        if (!selectedTrack && editableSrtFiles[0]) setEditorColumnTrack(column.id, editableSrtFiles[0].id);
    });

    function iscurrent(id) {
        return selectedTrack?.data[id]?.startTime <= json_data.seekTime && json_data.seekTime <= selectedTrack?.data[id]?.endTime;
    }

    let isProgrammaticScroll = false;
    export function scrollToIndex(time) {
        const index = getCurrentText(selectedTrack?.data ?? [], time).index;
        const target = editorScrollBox?.querySelectorAll(".editor")?.[index];
        if (index < 0 || !target || !editorScrollBox) return;
        isProgrammaticScroll = true;
        const targetRect = target.getBoundingClientRect();
        const containerRect = editorScrollBox.getBoundingClientRect();
        const targetTop = editorScrollBox.scrollTop + targetRect.top - containerRect.top;
        const centeredTop = targetTop - (editorScrollBox.clientHeight - target.offsetHeight) / 2;
        editorScrollBox.scrollTo({ top: Math.max(0, centeredTop), behavior: "smooth" });
        setTimeout(() => {
            isProgrammaticScroll = false;
        }, 300);
    }

    function handleExternalScroll(event) {
        scrollToIndex(event.detail?.time ?? json_data.seekTime);
    }

    function JumpAudio(index) {
        useAudio.seek(selectedTrack.data[index].startTime);
    }

    function onTextareaFocus(index) {
        if (!selectedTrack) return;
        selectEditorClip(selectedTrack.id, index);
    }

    function clampBoundary(time, min, max) {
        return Math.max(min, Math.min(time, max));
    }

    function setStartTime(id) {
        if (id > 0) {
            const time = clampBoundary(useAudio.audio?.currentTime ?? 0, srt_data[id - 1].startTime, srt_data[id].endTime);
            srt_data[id].startTime = time;
            srt_data[id - 1].endTime = srt_data[id].startTime;
            srt_data[id].startTimeStr = convSecToStr(srt_data[id].startTime);
            srt_data[id - 1].endTimeStr = convSecToStr(srt_data[id - 1].endTime);
        }
    }

    function setEndTime(id) {
        if (id < srt_data.length - 1) {
            const time = clampBoundary(useAudio.audio?.currentTime ?? 0, srt_data[id].startTime, srt_data[id + 1].endTime);
            srt_data[id].endTime = time;
            srt_data[id + 1].startTime = srt_data[id].endTime;
            srt_data[id].endTimeStr = convSecToStr(srt_data[id].endTime);
            srt_data[id + 1].startTimeStr = convSecToStr(srt_data[id + 1].startTime);
        }
    }

    onMount(() => {
        window.addEventListener("srt-editor-scroll-current", handleExternalScroll);
    });

    onDestroy(() => {
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
    <div
        class="box"
        bind:this={editorScrollBox}
        data-testid="editor-scroll"
        onscroll={() => {
            if (!isProgrammaticScroll) uiState.autoScroll = false;
        }}
    >
        {#each selectedTrack.data ?? [] as srtdata, index}
            <div class="clip-row">
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
                <CustomTextarea
                    track_id={selectedTrack.id}
                    data_id={index}
                    selected={selectionState.editorTrackId === selectedTrack.id && selectionState.editorClipIndex === index}
                    onfocus={() => onTextareaFocus(index)}
                    bind:this={editorRefs[index]}
                />
            </div>
        {/each}
    </div>
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
    .srt-editor {
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        margin-top: 3px;
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
        margin: 0 10px 6px 2px;
    }
    .srt_select {
        height: 28px;
        box-sizing: border-box;
        width: calc(100% - 4px);
        margin: 3px 2px 10px 2px;
        color: #b4b4b4;
        background-color: #4242424f;
        border: 1px solid #a3a3a328;
        border-radius: 4px;
    }
    .dark {
        margin-right: 5px;
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
