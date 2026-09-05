<script>
    let { value = $bindable(0), min = "0", max = "100", step = "1", fillColor = "#2c969e", backgroundColor = "#505050",
        variant = "default", wheelStep = Number(step), shiftWheelStep = wheelStep * 5, wheelDirection = -1,
        oninput, ...props } = $props();

    const percent = $derived.by(() => {
        const minNum = Number(min);
        const maxNum = Number(max);
        if (!Number.isFinite(value) || maxNum <= minNum) return 0;
        return Math.max(0, Math.min(100, ((value - minNum) / (maxNum - minNum)) * 100));
    });

    function handleInput(event) {
        value = event.currentTarget.valueAsNumber;
        oninput?.(event);
    }

    function wheelInput(node) {
        function handleWheel(event) {
            if (node.disabled || !event.deltaY) return;
            event.preventDefault();
            const amount = event.shiftKey ? shiftWheelStep : wheelStep;
            const next = node.valueAsNumber + Math.sign(event.deltaY) * wheelDirection * amount;
            if (!Number.isFinite(next)) return;
            node.valueAsNumber = Math.max(Number(min), Math.min(Number(max), Number(next.toFixed(10))));
            // All input methods emit the same event exactly once, with the new DOM value.
            node.dispatchEvent(new Event("input", { bubbles: true }));
        }
        node.addEventListener("wheel", handleWheel, { passive: false });
        return { destroy: () => node.removeEventListener("wheel", handleWheel) };
    }
</script>

<input
    type="range"
    {min}
    {max}
    {step}
    {...props}
    {value}
    data-variant={variant}
    style={`--slider-fill: ${fillColor}; --slider-background: ${backgroundColor}; --slider-percent: ${percent}%; ${props.style ?? ""}`}
    oninput={handleInput}
    use:wheelInput
/>

<style>
    input[type="range"] {
        appearance: none;
        background: transparent;
        width: 129px;
        min-width: 0;
        height: var(--control-size, var(--control-height, 32px));
        margin: 0;
        padding: 0;
        vertical-align: middle;
        cursor: pointer;
        accent-color: var(--slider-fill);
    }
    input[data-variant="compact"] {
        height: var(--control-height-compact, 28px);
    }
    input[data-variant="seek"] {
        flex: 1;
        width: 100%;
    }
    input:focus-visible {
        outline: 2px solid var(--focus-color, var(--slider-fill));
        outline-offset: 2px;
        border-radius: 4px;
    }
    input:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
    input[type="range"]::-webkit-slider-runnable-track {
        background: linear-gradient(to right, var(--slider-fill) var(--slider-percent), var(--slider-background) var(--slider-percent));
        height: 8px;
        border: solid 1px var(--border-color, #222);
        border-radius: 4px;
        box-shadow: var(--input-shadow, inset 1px 2px 3px #0008);
    }
    input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        background-color: var(--text-muted, #818181);
        width: 14px;
        height: 14px;
        margin-top: -4px;
        border-radius: 50%;
        border: solid 1px #2e2e2e;
        box-shadow: var(--control-shadow, 1px 2px 3px #0008);
    }
    input[type="range"]::-moz-range-track {
        background: linear-gradient(to right, var(--slider-fill) var(--slider-percent), var(--slider-background) var(--slider-percent));
        height: 6px;
        border: solid 1px var(--border-color, #222);
        border-radius: 4px;
        box-shadow: var(--input-shadow, inset 1px 2px 3px #0008);
    }
    input[type="range"]::-moz-range-thumb {
        box-sizing: border-box;
        background: var(--text-muted, #818181);
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: solid 1px #2e2e2e;
        box-shadow: var(--control-shadow, 1px 2px 3px #0008);
    }
    input:not(:disabled):hover::-webkit-slider-thumb {
        background: #a4b8ba;
    }
    input:not(:disabled):active::-webkit-slider-thumb {
        background: var(--slider-fill);
    }
    input:not(:disabled):hover::-moz-range-thumb {
        background: #a4b8ba;
    }
    input:not(:disabled):active::-moz-range-thumb {
        background: var(--slider-fill);
    }
</style>
