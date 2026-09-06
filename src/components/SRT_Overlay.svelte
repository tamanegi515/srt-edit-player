<script>
    import { mediaState, projectState, selectionState, clearOverlaySelection, activeBlockTarget } from "../lib/store.svelte";
    import { getCurrentText } from "../lib/data_process";
    import { formatClipBlocks } from "../lib/subtitle_block_render";
    import SrtOverlayBox from "./SRT_Overlay_Box.svelte";

    let { index, scale, pos } = $props();
    let srt = $derived(mediaState.media.srt_data[index]);
    let jsonData = $derived(projectState.jsonDataList[projectState.mediaIndex]);
    let currentText = $derived(getCurrentText(srt?.data ?? [], jsonData.seekTime));
    let blocks = $derived(formatClipBlocks(currentText.entry, jsonData.scriptFiles?.[srt?.id]?.defaultStyle || "default", jsonData.styles));

    $effect(() => {
        if (selectionState.selectedTrackId === srt?.id && selectionState.overlayClipIndex !== null
            && (selectionState.overlayClipIndex !== currentText.index || !activeBlockTarget())) {
            clearOverlaySelection();
        }
    });
</script>

{#if srt}
    {#key currentText.entry}
        {#each blocks as block (block.id)}
            <SrtOverlayBox {srt} clip={currentText.entry} clipIndex={currentText.entry ? currentText.index : null}
                blockId={block.id} body={block.body} sentences={block.sentences} {scale} {pos} />
        {/each}
    {/key}
{/if}
