<script>
    import CustomSlider from "./Custom_Slider.svelte";
    import ImageControls from "./Image_Controls.svelte";
    import { uiState } from "../lib/store.svelte";

    let { onscrolltimeline } = $props();
</script>

<div class="workspace-controls surface-controls">
    <ImageControls />
    {#if uiState.viewTrack}
        <div class="track-controls surface-controls">
            <label class="zoom-control">
                <span>拡大率：</span>
                <CustomSlider aria-label="タイムライン拡大率" min="0.5" max="20" step="0.1" bind:value={uiState.timeLineRatio} />
            </label>
            <label class="auto-scroll-control">
                <span>AutoScroll：</span>
                <span class="toggle_switch">
                    <input aria-label="トラックのオートスクロール" type="checkbox" bind:checked={uiState.timeLineAuto} />
                    <span class="toggle-slider"></span>
                </span>
            </label>
            <button class="nmorph_button" title="タイムラインを再生位置にスクロール" aria-label="タイムラインを再生位置にスクロール" onclick={onscrolltimeline}>
                <span class="material-symbols-outlined">skip_next</span>
            </button>
        </div>
    {/if}
</div>

<style>
    .workspace-controls,
    .track-controls {
        --control-size: var(--control-height, 32px);
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        min-height: var(--control-size);
        min-width: 0;
        gap: 8px;
        white-space: nowrap;
        color: #c4ced0;
    }
    .workspace-controls {
        column-gap: 20px;
    }
    .zoom-control,
    .auto-scroll-control {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        height: var(--control-size);
        min-width: 0;
        max-width: 100%;
    }
    .zoom-control :global(input[type="range"]) {
        max-width: 100%;
    }
    .auto-scroll-control {
        grid-template-columns: max-content 30px;
        flex: 0 0 auto;
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
