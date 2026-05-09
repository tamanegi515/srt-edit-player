<script>
    import { onMount } from "svelte";
    import { wheelAdjust } from "../lib/util";
    import CustomColorPicker from "./Custom_ColorPicker.svelte";
    import CustomSlider from "./Custom_Slider.svelte";
    import {
        activeStyleKey,
        activeTrackId,
        createStyleKey,
        projectState,
        selectionState,
        selectStyle,
        selectTrack,
        useStyleList,
    } from "../lib/store.svelte";
    import { getMonospaceFonts, getProportionalFonts, getVerticalFonts, getWebFonts } from "../lib/fonts";

    const styles = $derived(projectState.jsonDataList[projectState.mediaIndex].styles);
    const scriptFiles = $derived(projectState.jsonDataList[projectState.mediaIndex].scriptFiles);
    let currentSrt = $derived(activeTrackId());
    let currentStyleKey = $derived(activeStyleKey());

    const style_list = $derived.by(()=>useStyleList());
    let proportionalFonts = $state(getProportionalFonts());
    let monospaceFonts = $state(getMonospaceFonts());
    let verticalFonts = $state(getVerticalFonts());
    let webFonts = $state(getWebFonts());
    let newStyleKey = $state("");
    let styleCreateError = $state("");

    $effect(() => {
        if (!scriptFiles[currentSrt]) selectTrack(0);
        if (!styles[currentStyleKey]) selectStyle(style_list[0]?.name);
    });

    function handleWheel(prop, event) {
        event.preventDefault();
        const delta = Math.sign(event.deltaY);
        const step = event.shiftKey ? 10 : 1;

        const styleObj = styles[currentStyleKey];

        if (prop in styleObj) {
            styleObj[prop] = Math.max(0, (styleObj[prop] || 0) - delta * step);
        } else if (prop === "position_x") {
            scriptFiles[currentSrt].boxAlignX = Math.max(0, Math.min(100, scriptFiles[currentSrt].boxAlignX - delta));
        } else if (prop === "position_y") {
            scriptFiles[currentSrt].boxAlignY = Math.max(0, Math.min(100, scriptFiles[currentSrt].boxAlignY - delta));
        }
    }

    function handleChange() {
        // 変更イベントのフックが必要ならここに
    }

    function addStyle() {
        const result = createStyleKey(newStyleKey, currentStyleKey);
        styleCreateError = result.message;
        if (result.ok) newStyleKey = "";
    }
</script>

<div class="ribbonview">
    <!-- 基本書式エリア -->
    <table style="width: 100%;">
        <tbody>
            <tr>
                <!-- - position - -->
                <td>
                    <div class="ribbon-area" style="min-width:200px">
                        <div class="area-title">- position -</div>

                        <label>
                            テキスト揃え:
                            <select bind:value={scriptFiles[currentSrt].textAlign}>
                                <option value="left">{scriptFiles[currentSrt].textRotate == "horizontal-tb" ? "左揃え" : "上揃え"}</option>
                                <option value="center">中央揃え</option>
                                <option value="right">{scriptFiles[currentSrt].textRotate == "horizontal-tb" ? "右揃え" : "下揃え"}</option>
                            </select>
                        </label>
                        <div class="design-radio-container">
                            <div class="design-radio-tile-group">
                                <div class="design-radio-input-container">
                                    <input class="radio-button" bind:group={scriptFiles[currentSrt].textRotate} type="radio" name="tile" id="tile1" value="horizontal-tb" checked />
                                    <label class="radio-tile" for="tile1">
                                        <span class="material-symbols-outlined icon"> text_rotation_none </span>
                                    </label>
                                </div>
                                <div class="design-radio-input-container">
                                    <input class="radio-button" bind:group={scriptFiles[currentSrt].textRotate} type="radio" name="tile" id="tile2" value="vertical-rl" />
                                    <label class="radio-tile" for="tile2">
                                        <span class="material-symbols-outlined icon"> text_rotate_vertical </span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <br />
                        <label
                            >左右:
                            <!-- <input type="range" bind:value={scriptFiles[currentSrt].boxAlignX} min="0" max="100" step="1" use:wheelAdjust={{ min: 0, step: 1, shiftStep: 10 }} /> -->
                            <CustomSlider bind:value={scriptFiles[currentSrt].boxAlignX} min="0" max="100" step="1"></CustomSlider>
                            {scriptFiles[currentSrt].boxAlignX}%
                        </label>
                        <br />
                        <label
                            >上下:
                            <!-- <input type="range" bind:value={scriptFiles[currentSrt].boxAlignY} min="0" max="100" step="1" use:wheelAdjust={{ min: 0, step: 1, shiftStep: 10 }} /> -->
                            <CustomSlider bind:value={scriptFiles[currentSrt].boxAlignY} min="0" max="100" step="1"></CustomSlider>
                            {scriptFiles[currentSrt].boxAlignY}%
                        </label>
                    </div>
                </td>
                <!-- - style - -->
                <td>
                    <div class="ribbon-area" style="min-width:120px">
                        <div class="area-title">- style -</div>
                        <select value={selectionState.trackId ?? currentSrt} onchange={(e) => selectTrack(Number(e.currentTarget.value))} onwheel={(e) => handleWheel("srtbox", e)}>
                            {#each scriptFiles as srt, index}
                                <option value={index}>{srt.name || srt.filePath}</option>
                            {/each}
                        </select>
                        <select value={currentStyleKey} onchange={(e) => selectStyle(e.currentTarget.value)} onwheel={(e) => handleWheel("style", e)}>
                            {#each style_list as style, index}
                                <option value={style.name}>{style.name}</option>
                            {/each}
                        </select>
                        <div class="style-create-row">
                            <input
                                type="text"
                                data-testid="new-style-key"
                                bind:value={newStyleKey}
                                placeholder="new-style"
                                onkeydown={(e) => {
                                    if (e.key === "Enter") addStyle();
                                }}
                            />
                            <button type="button" class="nmorph_button" data-testid="add-style-key" title="style keyを追加" onclick={addStyle}>
                                <span class="material-symbols-outlined"> add </span>
                            </button>
                        </div>
                        {#if styleCreateError}
                            <div class="style-create-error">{styleCreateError}</div>
                        {/if}
                    </div>
                </td>
                <!-- - font - -->
                <td>
                    <div class="ribbon-area" style="min-width:220px">
                        <div class="area-title">- font -</div>
                        <select bind:value={styles[currentStyleKey].font} onwheel={(e) => handleWheel("font", e)}>
                            <optgroup label="Web">
                                {#each webFonts as font}
                                    <option value={font} style={`font-family: ${font}, Arial, sans-serif;`}>{font}</option>
                                {/each}
                            </optgroup>
                            <optgroup label="プロポーショナル">
                                {#each proportionalFonts as font}
                                    <option value={font} style={`font-family: ${font}, Arial, sans-serif;`}>{font}</option>
                                {/each}
                            </optgroup>
                            <optgroup label="等幅">
                                {#each monospaceFonts as font}
                                    <option value={font} style={`font-family: ${font}, Arial, sans-serif;`}>{font}</option>
                                {/each}
                            </optgroup>
                            <optgroup label="縦書き用">
                                {#each verticalFonts as font}
                                    <option value={font} style={`font-family: ${font}, Arial, sans-serif;`}>{font}</option>
                                {/each}
                            </optgroup>
                        </select>

                        <input type="number" data-testid="style-font-size" bind:value={styles[currentStyleKey].fontSize} use:wheelAdjust={{ min: 1, step: 1, shiftStep: 10 }} min="1" />
                        <CustomColorPicker bind:hex={styles[currentStyleKey].textColor}></CustomColorPicker>
                        <br />
                        <div style="display: inline-block;">
                            <div class="CheckButtonArea">
                                <input
                                    type="checkbox"
                                    checked={styles[currentStyleKey].fontWeight === "bold"}
                                    onchange={(e) => {
                                        //@ts-ignore
                                        styles[currentStyleKey].fontWeight = e.target.checked ? "bold" : "normal";
                                    }}
                                    id="StyleBoldButton"
                                />
                                <label for="StyleBoldButton"><span>B</span></label>
                            </div>

                            <div class="CheckButtonArea">
                                <input
                                    type="checkbox"
                                    checked={styles[currentStyleKey].fontStyle === "italic"}
                                    onchange={(e) => {
                                        //@ts-ignore
                                        styles[currentStyleKey].fontStyle = e.target.checked ? "italic" : "normal";
                                    }}
                                    id="StyleItalicButton"
                                />
                                <label for="StyleItalicButton"><span style="font-style:italic;font-weight:bold">I</span></label>
                            </div>
                        </div>
                        <label>
                            行間:<input type="number" bind:value={styles[currentStyleKey].lineSpace} use:wheelAdjust={{ min: 0, step: 1, shiftStep: 10 }} min="0" />
                        </label>
                        <label>
                            字間:<input type="number" bind:value={styles[currentStyleKey].letterSpace} use:wheelAdjust={{ min: 0, step: 1, shiftStep: 10 }} min="0" />
                        </label>
                    </div>
                </td>
                <!-- - outline 1 - -->
                <td>
                    <div class="ribbon-area" style="min-width:140px;">
                        <div style="position: relative; text-align: center;">
                            <div class="area-title">- outline -</div>
                        </div>
                        1：
                        <label class="toggle_switch" style="margin-right: 5px;">
                            <input type="checkbox" bind:checked={styles[currentStyleKey].outline1.enable} style="visibility: hidden;" onchange={handleChange} />
                            <span class="toggle-slider"></span>
                        </label>
                        <CustomColorPicker bind:hex={styles[currentStyleKey].outline1.color}></CustomColorPicker>
                        size:<input type="number" bind:value={styles[currentStyleKey].outline1.size} min="0" use:wheelAdjust={{ min: 0, step: 1, shiftStep: 10 }} />

                        <br />
                        2：
                        <label class="toggle_switch" style="margin-right: 5px;">
                            <input type="checkbox" bind:checked={styles[currentStyleKey].outline2.enable} style="visibility: hidden;" onchange={handleChange} />
                            <span class="toggle-slider"></span>
                        </label>
                        <CustomColorPicker bind:hex={styles[currentStyleKey].outline2.color}></CustomColorPicker>
                        size:<input type="number" bind:value={styles[currentStyleKey].outline2.size} min="0" use:wheelAdjust={{ min: 0, step: 1, shiftStep: 10 }} />
                        x:<input type="number" bind:value={styles[currentStyleKey].outline2.offsetX} min="-1000" use:wheelAdjust={{ min: -1000, step: 1, shiftStep: 10 }} />
                        y:<input type="number" bind:value={styles[currentStyleKey].outline2.offsetY} min="-1000" use:wheelAdjust={{ min: -1000, step: 1, shiftStep: 10 }} />
                    </div>
                </td>
                <!-- - shadow - -->
                <td>
                    <div class="ribbon-area" style="min-width:220px;">
                        <div style="position: relative; text-align: center;">
                            <div class="area-title">- shadow -</div>
                            <div style="position: absolute; right: 10px; top: 3px;">
                                <label class="toggle_switch">
                                    <input type="checkbox" bind:checked={styles[currentStyleKey].shadow.enable} style="visibility: hidden;" onchange={handleChange} />
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                        </div>
                        <CustomColorPicker bind:hex={styles[currentStyleKey].shadow.color}></CustomColorPicker>
                        x:<input type="number" bind:value={styles[currentStyleKey].shadow.offsetX} min="-1000" use:wheelAdjust={{ min: -1000, step: 1, shiftStep: 10 }} />
                        y:<input type="number" bind:value={styles[currentStyleKey].shadow.offsetY} min="-1000" use:wheelAdjust={{ min: -1000, step: 1, shiftStep: 10 }} />
                        <label
                            >steps:
                            <input type="number" bind:value={styles[currentStyleKey].shadow.steps} min="1" use:wheelAdjust={{ min: 1, step: 1, shiftStep: 10 }} />
                        </label>
                        <br />
                        
                        <label
                        >ぼかし:
                        <CustomSlider bind:value={styles[currentStyleKey].shadow.blur} min="0" max="100" step="1"></CustomSlider>
                            {styles[currentStyleKey].shadow.blur}px
                        </label>
                        <br />
                        <label>
                        距　離:
                        <CustomSlider bind:value={styles[currentStyleKey].shadow.size} min="0" max="100" step="1"></CustomSlider>
                            {styles[currentStyleKey].shadow.size}px（steps &gt; 1）
                        </label>


                    </div>
                </td>
            </tr>
        </tbody>
    </table>
</div>

<style>
    input[type="number"] {
        height: 30px;
        width: 50px;
        padding: 3px;
        vertical-align: baseline;
        box-sizing: border-box;
        margin: 3px 2px 10px 2px;
        color: #b4b4b4;
        background-color: #42424279;
        border: 1px solid #a3a3a349;
        border-radius: 4px;
        min-width: 45px;
        text-align: right;
    }
    input[type="text"] {
        height: 30px;
        min-width: 90px;
        width: 110px;
        padding: 3px 6px;
        box-sizing: border-box;
        margin: 3px 2px 10px 2px;
        color: #d6d6d6;
        background-color: #42424279;
        border: 1px solid #a3a3a349;
        border-radius: 4px;
    }
    select {
        height: 30px;
        padding: 3px;
        vertical-align: baseline;
        box-sizing: border-box;
        margin: 3px 2px 10px 2px;
        color: #b4b4b4;
        background-color: #42424279;
        border: 1px solid #a3a3a349;
        border-radius: 4px;
    }
    optgroup {
        background-color: rgb(167, 167, 167);
        font-weight: bold;
        color: rgb(68, 68, 68);
    }
    option {
        background-color: rgb(185, 185, 185);
        color: rgb(41, 41, 41);
    }
    .style-create-row {
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .style-create-row .nmorph_button {
        width: 30px;
        height: 30px;
        margin-bottom: 10px;
        padding: 0;
    }
    .style-create-row .material-symbols-outlined {
        font-size: 20px;
        line-height: 1;
    }
    .style-create-error {
        max-width: 180px;
        color: #ff9a9a;
        font-size: 12px;
        line-height: 1.35;
    }
    .ribbon-area {
        padding: 1px 5px 5px 15px;
        margin: 5px;
        height: 112px;
        box-sizing: border-box;
        overflow: hidden;
        border-radius: 10px;
        background: linear-gradient(140deg, #2020223f, #4646491c);
        box-shadow:
            6px 6px 12px #0f0f0f75,
            -5px -5px 10px #4343467e;
    }
    .area-title {
        margin: 2px 2px;
        text-align: center;
        font-size: 15px;
        color: #1f9797;
    }
    .ribbonview {
        height: 130px;
        max-height: 130px;
        margin-bottom: 5px;
        padding-bottom: 12px;
        box-sizing: border-box;
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        scrollbar-gutter: stable;
    }
    .ribbonview table {
        width: max-content;
        min-width: max-content;
        table-layout: auto;
    }
    .ribbonview td {
        vertical-align: top;
        white-space: nowrap;
    }

    label {
        position: relative;
        display: inline-block;
    }


    /* === ボタンを表示するエリア ============================== */
    .CheckButtonArea {
        width: 25px; /* ボタンの横幅       */
        margin: 3px 0px 3px 10px;
        display: inline-block;
    }

    /* === チェックボックス ==================================== */
    .CheckButtonArea input[type="checkbox"] {
        display: none; /* チェックボックス非表示 */
    }

    /* === チェックボックスのラベル（標準） ==================== */
    .CheckButtonArea label {
        display: block; /* ボックス要素に変更 */
        text-align: center; /* 文字位置は中央     */
        align-content: center;
        border-radius: 5px; /* 角丸               */
        height: 25px; /* ボタンの高さ       */
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
    .CheckButtonArea label span:after {
        color: rgb(255, 255, 255);
    }
    .CheckButtonArea input[type="checkbox"]:checked + label {
        color: #1c9199c0;
        background: #00000067;
        box-shadow:
            inset 4px 4px 8px #000000d3,
            inset -4px -4px 8px #70707067;
    }
    .CheckButtonArea input[type="checkbox"]:checked + label span:after {
        color: #fff; /* 文字色             */
    }

    :root {
        --primary-color: #0f7d91; /* 必要に応じて好きな色に */
    }
</style>

