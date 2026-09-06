<script>
    import CustomSlider from "./Custom_Slider.svelte";
    import { mediaState, useAudio } from "../lib/store.svelte";

    let root;
    let trigger;
    let hovered = $state(false);
    let focused = $state(false);
    let pinned = $state(false);
    let dismissed = $state(false);
    const expanded = $derived(!dismissed && (hovered || focused || pinned));

    function close() {
        pinned = false;
        dismissed = true;
    }
    function handleKey(event) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        trigger.focus();
        close();
    }
    function outsidePointer(event) {
        if (!root?.contains(event.target)) close();
    }
</script>

<svelte:window onpointerdown={outsidePointer} />

<div class="playback-rate-control" bind:this={root} role="group" aria-label="再生速度"
    onpointerenter={() => { hovered = true; dismissed = false; }}
    onpointerleave={() => { hovered = false; }}
    onfocusin={() => { focused = true; dismissed = false; }}
    onfocusout={(event) => { if (!root.contains(event.relatedTarget)) focused = false; }}
    onkeydown={handleKey}>
    <button class="nmorph_button rate-trigger" bind:this={trigger} type="button"
        aria-label="倍速を調整" title={`倍速 ${mediaState.media.playbackRate.toFixed(2)}`}
        aria-expanded={expanded} aria-controls="playback-rate-options"
        onclick={() => { if (pinned) close(); else { pinned = true; dismissed = false; } }}>
        <span class="material-symbols-outlined" aria-hidden="true">speed</span>
    </button>
    {#if expanded}
        <div class="rate-options" id="playback-rate-options">
            <CustomSlider min="0.5" max="3.0" step="0.05" aria-label="倍速"
                value={mediaState.media.playbackRate}
                oninput={(event) => useAudio.setRate(event.currentTarget.valueAsNumber)} />
            <span class="control-value">{mediaState.media.playbackRate.toFixed(2)}</span>
        </div>
    {/if}
</div>

<style>
    .playback-rate-control {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        min-width: 0;
    }
    .rate-trigger {
        order: 2;
    }
    .rate-options {
        display: grid;
        align-items: center;
        gap: 6px;
        height: 32px;
        min-width: 0;
        grid-template-columns: 72px 36px;
    }
    .rate-options :global(input[type="range"]) {
        width: 100%;
    }
    .control-value {
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
</style>
