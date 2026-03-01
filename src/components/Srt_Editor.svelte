<script>
    import { onMount } from "svelte";
    import { main_media, useState, useRefs, useAudio } from "../lib/store.svelte";
    import CustomTextarea from "./Custom_Textarea.svelte";
    import { getCurrentText } from "../lib/data_process";
    import { convSecToStr } from "../lib/util";

    let { parents_height = $bindable(), ...props } = $props();
    let srt_index = $state(0);
    let srtFiles = $derived(main_media.media.srt_data);
    // srtFiles が変わったとき srt_index が範囲外になるのを防ぐ
    $effect(() => {
        if (srt_index >= srtFiles.length) srt_index = 0;
    });
    let srt_data = $derived(srtFiles[srt_index]?.data ?? []);
    let textareaHeights = $state([]);

    let textareaRefs = $state([]);

    let json_data = $derived(main_media.json_data_list[main_media.media_index]);

    function iscurrent(id) {
        if (srtFiles[srt_index].data[id].startTime <= json_data.seekTime && json_data.seekTime <= srtFiles[srt_index].data[id].endTime) {
            return true;
        } else {
            return false;
        }
    }

    let isProgrammaticScroll = false;
    export function scrollToIndex(time) {
        const index = getCurrentText(srtFiles[srt_index].data, time).index;
        // console.log(textareaRefs);
        isProgrammaticScroll = true;
        textareaRefs[index]?.scrollToIndex();
        setTimeout(() => { isProgrammaticScroll = false; }, 150);
    }

    function JumpAudio(index) {
        // console.log("Jump to", srtFiles[srt_index].data[index].startTime);
        useAudio.seek(srtFiles[srt_index].data[index].startTime);
        // 実際の音声ジャンプ処理をここに実装
    }

    function onTextareaFocus(index) {
        srtFiles[srt_index].currentTextId = index;
    }

    function handleContextMenu(event) {
        event.preventDefault();
        // 右クリックメニューなど
    }

    function adjustTextareaHeight(index) {
        const textarea = document.getElementById(`textarea-${index}`);
        if (textarea) {
            textarea.style.height = "auto";
            textareaHeights[index] = textarea.scrollHeight;
        }
    }
    function setStartTime(id) {
        // console.log(srt_data);
        if (id > 0) {
            srt_data[id].startTime = useAudio.audio?.currentTime ?? 0;
            srt_data[id - 1].endTime = srt_data[id].startTime;
            srt_data[id].startTimeStr = convSecToStr(srt_data[id].startTime);
            srt_data[id - 1].endTimeStr = convSecToStr(srt_data[id - 1].endTime);
        }
    }
    function setEndTime(id) {
        // console.log("aaa");
        if (id < srt_data.length - 1) {
            srt_data[id].endTime = useAudio.audio?.currentTime ?? 0;
            srt_data[id + 1].startTime = srt_data[id].endTime;
            srt_data[id].endTimeStr = convSecToStr(srt_data[id].endTime);
            srt_data[id + 1].startTimeStr = convSecToStr(srt_data[id + 1].startTime);
        }
    }

    onMount(() => {
        // console.log(srtFiles[srt_index]);
        // console.log(parents_height);
    });

    let this_height = $derived.by(() => {
        return parents_height - 110;
    });
</script>

<div style="margin-top:3px;">
    <div>
        <select class="srt_select" bind:value={srt_index}>
            {#each srtFiles as srt, index}
                <option value={index}>{srt.name}</option>
            {/each}
        </select>
    </div>
    <div class="box" style="height: {this_height}px;"
        onscroll={() => { if (!isProgrammaticScroll) useState.autoScroll = false; }}
    >
        {#if srtFiles.length > 0}
        {#each srtFiles[srt_index]?.data ?? [] as srtdata, index}
            <div>
                <button class="dark nmorph_button" style="height: 24px; margin: 0 10px 6px 7px;" onclick={() => JumpAudio(index)}>
                    <span class="material-symbols-outlined" style="font-size:20px;"> turn_left </span>
                </button>

                {#if iscurrent(index)}
                    <button onclick={() => setStartTime(index)}>{convSecToStr(srtdata.startTime)}</button>
                    <small> - </small>
                    <button onclick={() => setEndTime(index)}>{convSecToStr(srtdata.endTime)}</button>
                {:else}
                    <small>{convSecToStr(srtdata.startTime)} - {convSecToStr(srtdata.endTime)}</small>
                {/if}
                {#if !useState.is_original_text}
                    <CustomTextarea bind:srt_id={srt_index} data_id={index} bind:this={textareaRefs[index]}></CustomTextarea>
                {:else}
                    <textarea
                        class="srtTextArea"
                        id={`textarea-${index}`}
                        bind:value={srtdata.text}
                        style="outline: {index === srtFiles[srt_index].currentTextId ? '2px solid #007bff' : '0px'}; 
                                height: {textareaHeights[index] ?? 40}px;"
                        onfocus={() => onTextareaFocus(index)}
                        oncontextmenu={handleContextMenu}
                        oninput={() => adjustTextareaHeight(index)}
                    ></textarea>
                {/if}
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
    .topbutton {
        flex: 1;
        height: 30px;
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
    .srtTextArea {
        box-sizing: border-box;
        border-radius: 4px;
        width: 100%;
        height: 30px;
        max-height: 250px;
        resize: vertical;
        background: #242424;
        color: #c2c2c2;
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
