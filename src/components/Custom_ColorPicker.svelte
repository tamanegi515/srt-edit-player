<script>
    import { onMount, tick } from "svelte";
    import { COLOR } from "../lib/util";

    let { hex = $bindable(), ...props } = $props();
    let tmp_hex = $state("#ffffffff");
    let alpha = $state(1);

    // カラー
    let rgb = $state({ r: 0, g: 0, b: 0 });
    let hsv = $state({ h: 0, s: 0, v: 0 });
    let hsl = $state({ h: 0, s: 0, l: 0 });

    let isOpen = $state(false);
    let buttonEl = $state();
    let popupEl = $state();
    let popupPosition = $state({ top: 0, left: 0 });

    let pickerSize = $state({ width: 200, height: 150 });

    let position = $state({ x: 150, y: 100 }); // 初期位置
    let canvasRef = $state();

    let hsv_color_s1 = $state("#ffffff");
    let hsv_color_s2 = $state("#ffffff");
    let hsv_color_v1 = $state("#ffffff");
    let hsv_color_v2 = $state("#ffffff");

    async function togglePicker() {
        isOpen = !isOpen;
        console.log(buttonEl);
        if (buttonEl) {
            const rect = buttonEl.getBoundingClientRect();
            popupPosition = {
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
            };
        }
        tmp_hex = hex;
        rgb = COLOR.hexToRgb(hex);
        hsv = COLOR.rgbToHsv(rgb);
        hsl = COLOR.rgbToHsl(rgb);
        await tick();
        drawCanvas();
        setPosition();
        setBarColor();
    }
    async function activateEyedropper() {
        // @ts-ignore
        if (!window.EyeDropper) {
            alert("このブラウザはスポイト機能に対応していません。");
            return;
        }

        // @ts-ignore
        const eyeDropper = new EyeDropper();

        try {
            const result = await eyeDropper.open();
            // 結果の例: { sRGBHex: "#aabbcc" }
            hex = result.sRGBHex;
            rgb = COLOR.hexToRgb(hex);
            hsv = COLOR.rgbToHsv(rgb);
            hsl = COLOR.rgbToHsl(rgb);
            setBarColor();
        } catch (e) {
            console.log("スポイトキャンセル or 失敗:", e);
        }
    }
    function drawCanvas() {
        const canvas = canvasRef;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        // ベース: 横方向に 白→色（saturation）
        const satGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        satGrad.addColorStop(0, "white");
        satGrad.addColorStop(1, `hsl(${hsv.h}, 100%, 50%)`);
        ctx.fillStyle = satGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 合成モードを multiply にして、黒→透明を乗算
        ctx.globalCompositeOperation = "multiply";

        const valGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        valGrad.addColorStop(0, "rgba(0,0,0,0)");
        valGrad.addColorStop(1, "rgba(0,0,0,1)");
        ctx.fillStyle = valGrad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 元に戻す
        ctx.globalCompositeOperation = "source-over";
    }
    function updateRGB() {
        hex = COLOR.rgbaToHex(rgb, alpha);
        hsv = COLOR.rgbToHsv(rgb);
        hsl = COLOR.rgbToHsl(rgb);
        setPosition();
        setBarColor();
    }
    function updateHSV() {
        rgb = COLOR.hsvToRgb(hsv);
        hsl = COLOR.rgbToHsl(rgb);
        hex = COLOR.rgbaToHex(rgb, alpha);
        setPosition();
        setBarColor();
    }
    function updateHSL() {
        rgb = COLOR.hslToRgb(hsl);
        hsv = COLOR.rgbToHsv(rgb);
        hsv.h = hsl.h;
        hex = COLOR.rgbaToHex(rgb, alpha);
        setPosition();
        setBarColor();
    }

    function setBarColor() {
        const s1_rgb = COLOR.hsvToRgb({ h: hsv.h, s: 0, v: hsv.v });
        hsv_color_s1 = COLOR.rgbaToHex(s1_rgb, 1);
        const s2_rgb = COLOR.hsvToRgb({ h: hsv.h, s: 100, v: hsv.v });
        hsv_color_s2 = COLOR.rgbaToHex(s2_rgb, 1);
        const v1_rgb = COLOR.hsvToRgb({ h: hsv.h, s: hsv.s, v: 0 });
        hsv_color_v1 = COLOR.rgbaToHex(v1_rgb, 1);
        const v2_rgb = COLOR.hsvToRgb({ h: hsv.h, s: hsv.s, v: 100 });
        hsv_color_v2 = COLOR.rgbaToHex(v2_rgb, 1);
    }
    function setPosition() {
        position.x = (hsv.s / 100) * canvasRef.width;
        position.y = (1 - hsv.v / 100) * canvasRef.height;
    }

    // 色を取得してstateにセット
    function updateColorFromEvent(e) {
        const rect = canvasRef.getBoundingClientRect();
        const h = hsv.h;
        const x = Math.max(0, Math.min(e.clientX - rect.left, canvasRef.width - 1));
        const y = Math.max(0, Math.min(e.clientY - rect.top, canvasRef.height));

        position.x = x;
        position.y = y;

        const ctx = canvasRef.getContext("2d");
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        rgb = { r: pixel[0], g: pixel[1], b: pixel[2] };
        hsv = COLOR.rgbToHsv(rgb);
        hsv.h = h;
        rgb = COLOR.hsvToRgb(hsv);
        hex = COLOR.rgbaToHex(rgb, alpha);
        hsl = COLOR.rgbToHsl(rgb);
        // color =`rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
        setBarColor();
    }
    let isDragging = $state(false);
    function handlePointerDown(e) {
        isDragging = true;
        updateColorFromEvent(e);
    }

    function handlePointerMove(e) {
        if (isDragging) {
            updateColorFromEvent(e);
        }
    }

    function handlePointerUp() {
        isDragging = false;
    }
    onMount(() => {
        function handleClickOutside(e) {
            if (buttonEl && popupEl) {
                if (!buttonEl.contains(e.target) && !popupEl.contains(e.target)) {
                    isOpen = false;
                }
            }
        }

        document.body.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);

        drawCanvas();

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            document.body.removeEventListener("mousedown", handleClickOutside);
        };
    });
</script>

<!-- <button class="toggle" bind:this={buttonEl} onclick={togglePicker}>
    <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;color:{hex};font-size:22px;vertical-align: middle;-webkit-text-stroke: 1px black;"> format_color_fill </span>
</button> -->
<div class="color_picker_button" bind:this={buttonEl}>
    <input type="checkbox" bind:checked={isOpen} />
    <div onclick={togglePicker}>
        <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;color:{hex};font-size:22px;vertical-align: middle;-webkit-text-stroke: 0.4px #bbb;font-weight:bold"> format_color_fill </span>
    </div>
</div>
{#if isOpen}
    <div class="popup" bind:this={popupEl} style="top: {popupPosition.top}px; left: {popupPosition.left}px;">
        <!-- 色見本 -->
        <div style="display: flex;height:30px;margin-bottom:10px;">
            <input type="text" bind:value={hex} />
            <div class="sample" style="background-color: {hex};"></div>
            <div class="sample" style="background-color: {tmp_hex};"></div>
        </div>
        <button class="eyedropper-button" onclick={activateEyedropper}>
            <span class="material-symbols-outlined">
                colorize
                </span>
          </button>
        <div class="picker-row">
            <!-- 色選択のcanvas -->
            <div class="container">
                <canvas bind:this={canvasRef} width={pickerSize.width} height={pickerSize.height} onpointerdown={handlePointerDown} onpointermove={handlePointerMove} onpointerup={handlePointerUp}></canvas>
                <div class="picker" style="left: {position.x}px; top: {position.y}px;"></div>
            </div>
            <!-- Alphaバー -->
            <div class="bar-wrapper">
                <input
                    type="range"
                    class="vertical-slider-desc alpha"
                    style="--color:rgb({rgb.r},{rgb.g},{rgb.b})"
                    min="0"
                    max="1"
                    step="0.01"
                    bind:value={alpha}
                    oninput={() => {
                        hex = COLOR.rgbaToHex(rgb, alpha);
                    }}
                />
            </div>
            <!-- Hueバー -->
            <div class="bar-wrapper">
                <input
                    type="range"
                    class="vertical-slider hue"
                    min="0"
                    max="359"
                    step="1"
                    bind:value={hsv.h}
                    oninput={updateHSV}
                    style="background: linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red);"
                />
            </div>
        </div>
        <!-- 初回描画 -->
        {@html drawCanvas()}

        <!-- スライダータブ -->
        <div class="tab-switch">
            <label><input type="radio" name="TAB" />RGB</label>
            <div class="tab-content">
                <!-- RGBピッカー -->
                <div class="slider-group">
                    <label for="red">R:</label>
                    <input
                        type="range"
                        class="color_range"
                        style="--color1:rgb(0,{rgb.g},{rgb.b});--color2:rgb(255,{rgb.g},{rgb.b});"
                        id="red"
                        min="0"
                        max="255"
                        bind:value={rgb.r}
                        oninput={updateRGB}
                    />
                    <input type="number" id="red-val" min="0" max="255" bind:value={rgb.r} oninput={updateRGB} />
                </div>
                <div class="slider-group">
                    <label for="green">G:</label>
                    <input
                        type="range"
                        class="color_range"
                        style="--color1:rgb({rgb.r},0,{rgb.b});--color2:rgb({rgb.r},255,{rgb.b});"
                        id="green"
                        min="0"
                        max="255"
                        bind:value={rgb.g}
                        oninput={updateRGB}
                    />
                    <input type="number" id="green-val" min="0" max="255" bind:value={rgb.g} oninput={updateRGB} />
                </div>
                <div class="slider-group">
                    <label for="blue">B:</label>
                    <input
                        type="range"
                        class="color_range"
                        style="--color1:rgb({rgb.r},{rgb.g},0);--color2:rgb({rgb.r},{rgb.g},255);"
                        id="blue"
                        min="0"
                        max="255"
                        bind:value={rgb.b}
                        oninput={updateRGB}
                    />
                    <input type="number" id="blue-val" min="0" max="255" bind:value={rgb.b} oninput={updateRGB} />
                </div>
            </div>
            <label><input type="radio" name="TAB" checked />HSV</label>
            <div class="tab-content">
                <!-- HSVピッカー -->
                <div class="slider-group">
                    <label for="hue">H:</label>
                    <input type="range" class="hue" id="hue" min="0" max="359" bind:value={hsv.h} oninput={updateHSV} />
                    <input type="number" id="hue-val" min="0" max="360" bind:value={hsv.h} oninput={updateHSV} />
                </div>
                <div class="slider-group">
                    <label for="sat">S:</label>
                    <input type="range" class="color_range" style="--color1:{hsv_color_s1};--color2:{hsv_color_s2};" id="sat" min="0" max="100" step="1" bind:value={hsv.s} oninput={updateHSV} />
                    <input type="number" id="sat-val" min="0" max="100" bind:value={hsv.s} oninput={updateHSV} />
                </div>
                <div class="slider-group">
                    <label for="val">V:</label>
                    <input type="range" class="color_range" style="--color1:{hsv_color_v1};--color2:{hsv_color_v2};" id="val" min="0" max="100" bind:value={hsv.v} oninput={updateHSV} />
                    <input type="number" id="val-val" min="0" max="100" bind:value={hsv.v} oninput={updateHSV} />
                </div>
            </div>
            <label><input type="radio" name="TAB" />HSL</label>
            <div class="tab-content">
                <!-- HSLピッカー -->
                <div class="slider-group">
                    <label for="hue1">H:</label>
                    <input type="range" class="hue" id="hue1" min="0" max="360" bind:value={hsl.h} oninput={updateHSL} />
                    <input type="number" id="hue-val" min="0" max="360" bind:value={hsl.h} oninput={updateHSL} />
                </div>
                <div class="slider-group">
                    <label for="sat">S:</label>
                    <input
                        type="range"
                        class="color_range"
                        style="--color1:hsl({hsl.h}deg 0% {hsl.l}%);--color2:hsl({hsl.h}deg 50% {hsl.l}%),hsl({hsl.h}deg 100% {hsl.l}%);"
                        id="sat"
                        min="0"
                        max="100"
                        bind:value={hsl.s}
                        oninput={updateHSL}
                    />
                    <input type="number" id="sat-val" min="0" max="100" bind:value={hsl.s} oninput={updateHSL} />
                </div>
                <div class="slider-group">
                    <label for="val">L:</label>
                    <input
                        type="range"
                        class="color_range"
                        style="--color1:hsl({hsl.h}deg {hsl.s}% 0%);--color2:hsl({hsl.h}deg {hsl.s}% 50%),hsl({hsl.h}deg {hsl.s}% 100%);"
                        id="val"
                        min="0"
                        max="100"
                        bind:value={hsl.l}
                        oninput={updateHSL}
                    />
                    <input type="number" id="val-val" min="0" max="100" bind:value={hsl.l} oninput={updateHSL} />
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .popup {
        /* position: fixed; */
        background: rgb(36, 36, 36);
        border: 1px solid #6d6d6d;
        border-radius: 5px;
        padding: 12px;
        z-index: 999;
        min-width: 150px;
        max-width: 280px;
        box-shadow: 0px 15px 30px rgba(172, 172, 172, 0.226);
        position: absolute;
    }

    .picker-row {
        display: flex;
        align-items: flex-start; /* または center / stretch など調整可 */
    }

    .container {
        position: relative;
    }

    .bar-wrapper {
        position: relative;
        width: 40px;
        height: 160px;
        overflow: visible;
    }

    .picker-row {
        display: flex;
        align-items: flex-start;
        gap: 10px;
    }

    .container {
        position: relative;
        margin-right: 2px;
    }

    .bar-wrapper {
        position: relative;
        width: 30px;
        height: 160px;
        overflow: visible;
        /* background-color: #ff0000; */
    }

    .vertical-slider,
    .vertical-slider-desc {
        position: absolute;
        top: 3px;
        left: 15px;
        width: 145px !important; /* 横に寝かせた状態の長さ */
        height: 20px !important; /* スライダーの太さ */
        transform: rotate(90deg);
        transform-origin: left top;
    }
    .vertical-slider-desc {
        transform: rotate(-90deg) translate(-100%, -100%);
        transform-origin: left top;
    }

    .vertical-slider::-webkit-slider-thumb,
    .vertical-slider-desc::-webkit-slider-thumb {
        appearance: none;
        width: 9px;
        height: 26px !important;
        background: white;
        border: 1px solid #5f5f5f;
        background-color: #ffffffa4;
        border-radius: 2px;
    }

    .eyedropper-button{
        position: absolute;
        background-color: #434346;
        border-radius: 3px;
        border: 1px solid #5f5f5f;
        margin: 0;
        padding: 0;
        vertical-align: middle;
        bottom: 112px;
        right: 15px;
    }
    .eyedropper-button:hover{
        background-color: #4b4a4a;
    }
    .eyedropper-button:active{
        background-color: #282829;
    }
    .eyedropper-button span{
        font-size: 18px;
        font-weight:light;
        color: #989999;
        vertical-align: middle;
        margin: 2px;
    }
    .sample {
        display: inline-block;
        width: 34px;
        flex-shrink: 0;
        /* border: 1px solid #000000; */
    }
    input[type="text"] {
        font-size: 18px;
        flex-grow: 1;
        margin-right: 10px;
        min-width: 50px;
    }
    /* タブ全体を囲むコンテナの設定 */
    .tab-switch {
        display: flex; /* タブを横並びに配置 */
        flex-wrap: wrap; /* 幅を超えたら折り返し */
    }

    /* 各タブボタンの設定 */
    .tab-switch > label {
        /* flex: 1 1 auto; タブボタンが均等に幅をとるが、幅を超えると折り返す */
        margin-top: 0px;
        font-size: small;
        order: -1; /* タブボタンを上部に配置 */
        position: relative; /* 子要素の絶対位置指定の基準 */
        padding: 2px 10px; /* 上下に0.7em、左右に1emの内側余白 */
        background-color: #5b5d5f; /* タブボタンの背景色 */
        color: #999; /* 文字色をグレーに設定 */
        text-align: center; /* 文字を中央揃え */
        cursor: pointer; /* カーソルをポインターに変更 */
        transition: 0.2s all; /*変化を滑らかに*/
        border-radius: 5px 5px 0px 0px;
        border-left: 1px solid #1b1b1b;
        border-right: 1px solid #1b1b1b;
        border-top: 1px solid #1b1b1b;
    }
    /* タブボタンのホバー状態のスタイル */
    .tab-switch > label:hover {
        background-color: #858585;
        color: #fff;
    }
    /* タブボタンの選択状態のスタイル */
    .tab-switch label:has(:checked) {
        background-color: rgb(68, 68, 68);
        color: #fff;
    }

    /* ラジオボタン自体は非表示 */
    .tab-switch input[type="radio"] {
        display: none; /* ラジオボタンを見えなくする */
    }

    /* タブコンテンツのスタイル */
    .tab-switch > div {
        display: none; /* 初期状態ではコンテンツを非表示に */
        width: 100%; /* コンテンツの幅を全体に設定 */
        padding: 5px 10px;
        border-left: 1px solid #1b1b1b;
        border-right: 1px solid #1b1b1b;
        border-bottom: 1px solid #1b1b1b;
        background-color: rgb(68, 68, 68);
    }

    /* 選択されたタブのコンテンツを表示 */
    .tab-switch label:has(:checked) + div {
        display: block; /* 選択されたタブのコンテンツを表示 */
    }

    .slider-group {
        display: flex;
        align-items: center;
        margin: 4px 0;
    }

    .slider-group label {
        width: 16px;
        font-weight: bold;
        font-size: 15px;
    }

    /* スライダー共通スタイル */
    input[type="range"] {
        user-select: none;
        appearance: none;
        border: 1px solid #313131;
        width: 165px;
        height: 12px;
        border-radius: 2px;
        margin: 0 10px;
        cursor: pointer;
    }

    input[type="text"]{
        background-color: #3b3b3b;
        border-radius: 3px;
        border: 0;
        color: #c2c2c2d8;
        padding: 3px 10px;
        box-shadow:
            inset 2px 2px 3px #0000008e,
            inset -2px -2px 3px #b1b1b146;
    }

    input[type="number"] {
        width: 50px;
        text-align: right;
        background-color: #3b3b3b;
        border-radius: 3px;
        border: 0;
        color: #c2c2c2d8;
        padding: 3px;
        box-shadow:
            inset 2px 2px 3px #0000008e,
            inset -2px -2px 3px #b1b1b146;
    }
    input[type="range"]::-webkit-slider-thumb {
        appearance: none;
        width: 9px;
        height: 20px;
        border: 1px solid #3d3d3d;
        background-color: #d3d3d36e;
        border-radius: 2px;
    }

    input[type="range"]::-webkit-slider-runnable-track {
        appearance: none;
        margin: 0 -4px;
        cursor: pointer;
    }

    input[type="range"]::-moz-range-thumb {
        width: 8px;
        height: 20px;
        background: white;
        border: 1px solid #999;
        border-radius: 2px;
    }

    .alpha {
        appearance: none;

        background: linear-gradient(to right, rgba(0, 0, 0, 0), var(--color)), linear-gradient(45deg, #000000 25%, transparent 25%, transparent 75%, #000 75%),
            linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%);
        background-color: #7a7a7a;
        background-size:
            100% 100%,
            10px 10px,
            10px 10px;
        background-position:
            0 0,
            5px 5px;
    }
    /* スライダー個別背景 */
    .hue {
        background: linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red);
    }
    .color_range {
        background: linear-gradient(to right, var(--color1), var(--color2));
    }

    .picker {
        position: absolute;
        width: 12px;
        height: 12px;
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 0 2px black;
        transform: translate(-6px, -6px);
        pointer-events: none;
    }
    .container {
        position: relative;
        display: inline-block;
    }

    /* === ボタンを表示するエリア ============================== */
    .color_picker_button {
        width: 30px; /* ボタンの横幅       */
        margin: 0px 3px 0px 7px;
        display: inline-block;
    }

    /* === チェックボックス ==================================== */
    .color_picker_button input[type="checkbox"] {
        display: none; /* チェックボックス非表示 */
    }

    /* === チェックボックスのラベル（標準） ==================== */
    .color_picker_button div {
        display: block; /* ボックス要素に変更 */
        text-align: center; /* 文字位置は中央     */
        align-content: center;
        border-radius: 5px; /* 角丸               */
        height: 30px; /* ボタンの高さ       */
        font-size: 15px; /* 文字サイズ         */
        font-weight: bold; /* 太字               */
        transition: 0.1s; /* ゆっくり変化       */
        font-family: "HGP明朝E", Arial, Helvetica, sans-serif;

        color: #8d8d8d;
        margin: 5px 0px;
        padding: 0px 0px;
        background: #29292b;
        cursor: pointer;
        /* border: 1px solid #29292b; */
        transition: all 0.1s;
        box-shadow:
            4px 4px 8px #020202a4,
            -4px -4px 8px #434346;
    }

    /* === ON側のチェックボックスのラベル（ONのとき） ========== */
    .color_picker_button div span:after {
        color: rgb(255, 255, 255);
    }
    .color_picker_button input[type="checkbox"]:checked + div {
        color: #1c9199c0;
        background: #00000067;
        box-shadow:
            inset 4px 4px 8px #000000d3,
            inset -4px -4px 8px #70707067;
    }
    .color_picker_button input[type="checkbox"]:checked + div span:after {
        color: #fff; /* 文字色             */
    }
</style>
