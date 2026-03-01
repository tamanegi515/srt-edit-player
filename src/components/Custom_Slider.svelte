<script>
    import { wheelAdjust } from "../lib/util";

    let { value = $bindable(0), min = "0", max = "100", step = "1", fillColor = "#2c969e", backgroundColor = "#505050", ...props } = $props();

    const percent = $derived.by(() => {
        const minNum = Number(min);
        const maxNum = Number(max);
        return ((value - minNum) / (maxNum - minNum)) * 100;
        // return ((value - +min) / (+max - +min)) * 100;
    });
</script>

<input
    type="range"
    {min}
    {max}
    {step}
    bind:value
    style="background: linear-gradient(to right, {fillColor} 0% {percent}%, {backgroundColor} {percent}% 100%)"
    use:wheelAdjust={{ min: +min, step: +step, shiftStep: +step * 5, ...(props.oninput ? { oninput: props.oninput } : {})}}
    {...props}
/>

<style>
    input[type="range"] {
        appearance: none;
        background-color: #00ff5500;
        height: 8px;
        border-radius: 4px;
        --track-right-color: #2c969e;
        --track-left-color: #505050;
        --track-ratio: 0;
    }
    input[type="range"]::-webkit-slider-runnable-track {
        background: transparent;
        height: 8px;
        border: solid 1px #000000;
        border-radius: 4px;
    }
    input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        background-color: #818181;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        transform: scale(2);
        border: solid 1px #2e2e2e;
    }

    :root {
        --primary-color: #0f7d91; /* 必要に応じて好きな色に */
    }
</style>
