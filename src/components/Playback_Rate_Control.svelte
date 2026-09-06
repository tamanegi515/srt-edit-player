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

    function wheelRate(node) {
        function handleWheel(event) {
            if (!event.deltaY) return;
            event.preventDefault();
            event.stopPropagation();
            const step = event.shiftKey ? 0.25 : 0.05;
            const rate = mediaState.media.playbackRate - Math.sign(event.deltaY) * step;
            useAudio.setRate(Math.max(0.5, Math.min(3, Number(rate.toFixed(2)))));
        }
        node.addEventListener("wheel", handleWheel, { passive: false });
        return { destroy: () => node.removeEventListener("wheel", handleWheel) };
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
        aria-expanded={expanded} aria-controls="playback-rate-options" use:wheelRate
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
        position: relative;
        display: flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        min-width: 0;
        width: 32px;
        z-index: 10;
    }
    .rate-options {
        position: absolute;
        bottom: calc(100% + 8px);
        left: 0;
        display: grid;
        align-items: center;
        gap: 6px;
        padding: 8px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--control-bg);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        min-width: 0;
        grid-template-columns: 72px 36px;
    }
    /* Keep the hover path continuous between the icon and its floating panel. */
    .rate-options::after {
        content: "";
        position: absolute;
        top: 100%;
        left: -1px;
        right: -1px;
        height: 9px;
    }
    .rate-options :global(input[type="range"]) {
        width: 100%;
    }
    .control-value {
        text-align: right;
        font-variant-numeric: tabular-nums;
    }
</style>
