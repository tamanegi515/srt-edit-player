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

    let { parents_height = $bindable(), column, ...props } = $props();

    let editableSrtFiles = $derived(mediaState.media.srt_data.filter((track) => !track.isImageTrack));
    let selectedTrack = $derived(editableSrtFiles.find((track) => track.id === column.trackId) ?? editableSrtFiles[0]);
    let srt_data = $derived(selectedTrack?.data ?? []);
    let editorRefs = $state([]);
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
        isProgrammaticScroll = true;
        editorRefs[index]?.scrollToIndex();
        setTimeout(() => {
            isProgrammaticScroll = false;
        }, 150);
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

    let this_height = $derived.by(() => parents_height - 110);
</script>

<div style="margin-top:3px;">
    <div>
        <select class="srt_select" value={column.trackId} onchange={(e) => setEditorColumnTrack(column.id, Number(e.currentTarget.value))}>
            {#each editableSrtFiles as srt}
                <option value={srt.id}>{srt.name}</option>
            {/each}
        </select>
    </div>
    <div
        class="box"
        style="height: {this_height}px;"
        data-testid="editor-scroll"
        onscroll={() => {
            if (!isProgrammaticScroll) uiState.autoScroll = false;
        }}
    >
        {#if selectedTrack}
            {#each selectedTrack.data ?? [] as srtdata, index}
                <div>
                    <button class="dark nmorph_button jump_button" onclick={() => JumpAudio(index)}>
                        <span class="material-symbols-outlined" style="font-size:20px;"> turn_left </span>
                    </button>

                    {#if iscurrent(index)}
                        <button onclick={() => setStartTime(index)}>{convSecToStr(srtdata.startTime)}</button>
                        <small> - </small>
                        <button onclick={() => setEndTime(index)}>{convSecToStr(srtdata.endTime)}</button>
                    {:else}
                        <small>{convSecToStr(srtdata.startTime)} - {convSecToStr(srtdata.endTime)}</small>
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
        {/if}
    </div>
</div>

<style>
    .box {
        box-sizing: border-box;
        border: 1px solid #363636;
        background-color: #3a3a3a3a;
        padding: 10px 5px;
        overflow-y: auto;
        width: 100%;
        scrollbar-gutter: auto;
    }
    .jump_button {
        height: 24px;
        margin: 0 10px 6px 7px;
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
