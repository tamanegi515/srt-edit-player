<script>
    import { wheelAdjust } from "../lib/util";
    import { onDestroy } from "svelte";
    import { beginEditorEdit } from "../lib/editor_history";
    import { createBlockLayout } from "../lib/subtitle_blocks";
    import CustomColorPicker from "./Custom_ColorPicker.svelte";
    import CustomSlider from "./Custom_Slider.svelte";
    import {
        activeStyleKey,
        activeTrackId,
        activeBlockLayout,
        activeBlockTarget,
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
    let selectedLayout = $derived(activeBlockLayout());
    let displayLayout = $derived({ ...scriptFiles[currentSrt], ...selectedLayout });
    let layoutGesture = null;

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
        if (prop !== "font" || !event.deltaY || !styles[currentStyleKey]) return;
        const select = event.currentTarget;
        const options = Array.from(select.options).filter(option => !option.disabled && !option.parentElement?.disabled);
        if (!options.length) return;
        const current = options.findIndex(option => option.value === styles[currentStyleKey].font);
        const index = current < 0 ? 0 : Math.max(0, Math.min(options.length - 1, current - Math.sign(event.deltaY)));
        styles[currentStyleKey].font = options[index].value;
    }

    function handleChange() {
        // 変更イベントのフックが必要ならここに
    }

    function startLayoutEdit(target) {
        return target && (target.body.layout || target.body !== target.clip || target.clip.additionalBlocks?.length)
            ? beginEditorEdit(target.track, [target.clip]) : null;
    }

    function beginLayoutGesture() {
        finishLayoutGesture();
        const target = activeBlockTarget();
        layoutGesture = { layout: selectedLayout, body: target?.body, clip: target?.clip, commit: startLayoutEdit(target) };
    }

    function finishLayoutGesture() {
        layoutGesture?.commit?.();
        layoutGesture = null;
    }

    function editLayout(field, value) {
        if (!selectedLayout || displayLayout[field] === value) return;
        const target = activeBlockTarget();
        if (layoutGesture && (layoutGesture.layout !== selectedLayout
            || layoutGesture.body !== target?.body || layoutGesture.clip !== target?.clip)) return;
        const commit = layoutGesture ? null : startLayoutEdit(target);
        let writableLayout = selectedLayout;
        if (target && !target.body.layout && (target.body !== target.clip || target.clip.additionalBlocks?.length)) {
            target.body.layout = createBlockLayout(scriptFiles[currentSrt]);
            writableLayout = target.body.layout;
            if (layoutGesture) layoutGesture.layout = writableLayout;
        }
        writableLayout[field] = value;
        commit?.();
    }

    onDestroy(finishLayoutGesture);

    function addStyle() {
        const result = createStyleKey(newStyleKey, currentStyleKey);
        styleCreateError = result.message;
        if (result.ok) newStyleKey = "";
    }
</script>

<svelte:window onpointerup={finishLayoutGesture} onpointercancel={finishLayoutGesture} onblur={finishLayoutGesture} />

<div class="ribbonview">
    <!-- 基本書式エリア -->
    <table style="width: 100%;">
        <tbody>
            <tr>
                <!-- - position - -->
                <td>
                    <div class="ribbon-area ribbon-area-primary" style="min-width:200px">
                        <div class="area-title">- position -</div>

                        <label>
                            テキスト揃え:
                            <select value={displayLayout.textAlign} onchange={(e) => editLayout("textAlign", e.currentTarget.value)}>
                                <option value="left">{displayLayout.textRotate == "horizontal-tb" ? "左揃え" : "上揃え"}</option>
                                <option value="center">中央揃え</option>
                                <option value="right">{displayLayout.textRotate == "horizontal-tb" ? "右揃え" : "下揃え"}</option>
                            </select>
                        </label>
                        <div class="design-radio-container">
                            <div class="design-radio-tile-group">
                                <div class="design-radio-input-container">
                                    <input class="radio-button" checked={displayLayout.textRotate === "horizontal-tb"} onchange={() => editLayout("textRotate", "horizontal-tb")} type="radio" name="tile" id="tile1" value="horizontal-tb" />
                                    <label class="radio-tile" for="tile1">
                                        <span class="material-symbols-outlined icon"> text_rotation_none </span>
                                    </label>
                                </div>
                                <div class="design-radio-input-container">
                                    <input class="radio-button" checked={displayLayout.textRotate === "vertical-rl"} onchange={() => editLayout("textRotate", "vertical-rl")} type="radio" name="tile" id="tile2" value="vertical-rl" />
                                    <label class="radio-tile" for="tile2">
                                        <span class="material-symbols-outlined icon"> text_rotate_vertical </span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <br />
                        <label
                            >左右:
                            <CustomSlider variant="compact" value={displayLayout.boxAlignX} onpointerdown={beginLayoutGesture} oninput={(e) => editLayout("boxAlignX", e.currentTarget.valueAsNumber)} min="0" max="100" step="1"></CustomSlider>
                            {displayLayout.boxAlignX}%
                        </label>
                        <br />
                        <label
                            >上下:
                            <CustomSlider variant="compact" value={displayLayout.boxAlignY} onpointerdown={beginLayoutGesture} oninput={(e) => editLayout("boxAlignY", e.currentTarget.valueAsNumber)} min="0" max="100" step="1"></CustomSlider>
                            {displayLayout.boxAlignY}%
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
                    <div class="ribbon-area ribbon-area-primary" style="min-width:220px">
                        <div class="area-title">- font -</div>
                        <select aria-label="フォント" bind:value={styles[currentStyleKey].font} onwheel={(e) => handleWheel("font", e)}>
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
                        <label class="toggle_switch">
                            <input type="checkbox" bind:checked={styles[currentStyleKey].outline1.enable} style="visibility: hidden;" onchange={handleChange} />
                            <span class="toggle-slider"></span>
                        </label>
                        <CustomColorPicker bind:hex={styles[currentStyleKey].outline1.color}></CustomColorPicker>
                        size:<input type="number" bind:value={styles[currentStyleKey].outline1.size} min="0" use:wheelAdjust={{ min: 0, step: 1, shiftStep: 10 }} />

                        <br />
                        2：
                        <label class="toggle_switch">
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
                        <CustomSlider variant="compact" bind:value={styles[currentStyleKey].shadow.blur} min="0" max="100" step="1"></CustomSlider>
                            {styles[currentStyleKey].shadow.blur}px
                        </label>
                        <br />
                        <label>
                        距　離:
                        <CustomSlider variant="compact" bind:value={styles[currentStyleKey].shadow.size} min="0" max="100" step="1"></CustomSlider>
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
        height: var(--control-height-compact);
        width: 50px;
        padding: 3px;
        vertical-align: baseline;
        box-sizing: border-box;
        color: var(--text-color);
        background: var(--input-bg);
        border: 1px solid var(--border-color);
        box-shadow: var(--input-shadow);
        border-radius: 4px;
        min-width: 45px;
        text-align: right;
    }
    input[type="text"] {
        height: var(--control-height-compact);
        min-width: 90px;
        width: 110px;
        padding: 3px 6px;
        box-sizing: border-box;
        color: var(--text-color);
        background: var(--input-bg);
        border: 1px solid var(--border-color);
        box-shadow: var(--input-shadow);
        border-radius: 4px;
    }
    select {
        height: var(--control-height-compact);
        padding: 3px;
        vertical-align: baseline;
        box-sizing: border-box;
        color: var(--text-color);
        background: var(--input-bg);
        border: 1px solid var(--border-color);
        box-shadow: var(--input-shadow);
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
        width: var(--control-height-compact);
        height: var(--control-height-compact);
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
        padding: 6px 10px 8px 12px;
        margin: 3px;
        /* 高さは内容に合わせる（固定高だと下端の入力が切れる）。
           tr が flex + stretch なので、兄弟パネルは最も高いパネルへ揃える。
           上下 margin 3px ぶんを引いて td からはみ出さないようにする */
        height: calc(100% - 6px);
        box-sizing: border-box;
        border: 1px solid transparent;
        border-radius: 8px;
        background: var(--panel-bg);
        box-shadow: var(--panel-shadow);
    }
    .ribbon-area-primary {
        border-color: transparent;
    }
    .area-title {
        margin: 0 0 8px;
        padding-bottom: 4px;
        text-align: center;
        font-size: 13px;
        color: #28b7b7;
        border-bottom: 1px solid #394143;
    }
    .ribbonview {
        --control-size: var(--control-height-compact);
        /* main の縦 flex 配分で潰されない（ワークスペースの内容が大きい時に
           リボンだけが比例縮小されて数pxの帯になる事故を防ぐ）。
           高さは固定せず内容に合わせる（固定高だとパネル下端が切れる） */
        flex: 0 0 auto;
        margin-bottom: 6px;
        padding: 3px 0 4px;
        box-sizing: border-box;
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        scrollbar-gutter: auto;
    }
    .ribbonview table {
        width: max-content;
        min-width: max-content;
        table-layout: auto;
        border-spacing: 0;
    }
    .ribbonview tbody,
    .ribbonview tr {
        display: flex;
        align-items: stretch;
    }
    .ribbonview td {
        vertical-align: top;
        white-space: nowrap;
        padding: 0;
    }

    label {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }


    /* === ボタンを表示するエリア ============================== */
    .CheckButtonArea {
        width: var(--control-height-compact);
        position: relative;
        display: inline-block;
    }

    /* === チェックボックス ==================================== */
    .CheckButtonArea input[type="checkbox"] {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
    }

    /* === チェックボックスのラベル（標準） ==================== */
    .CheckButtonArea label {
        display: block; /* ボックス要素に変更 */
        text-align: center; /* 文字位置は中央     */
        align-content: center;
        box-sizing: border-box;
        border: 1px solid var(--border-color);
        border-radius: var(--control-radius);
        height: var(--control-height-compact);
        font-size: 15px; /* 文字サイズ         */
        font-weight: bold; /* 太字               */
        transition: 0.1s; /* ゆっくり変化       */
        font-family: "HGP明朝E", Arial, Helvetica, sans-serif;

        color: var(--text-color);
        padding: 0px 0px;
        background: var(--control-bg);
        cursor: pointer;
        /* border: 1px solid #29292b; */
        transition: all 0.1s;
        box-shadow: var(--control-shadow);
    }

    /* === ON側のチェックボックスのラベル（ONのとき） ========== */
    .CheckButtonArea label span:after {
        color: rgb(255, 255, 255);
    }
    .CheckButtonArea input[type="checkbox"]:checked + label {
        color: var(--text-color);
        background: var(--primary-color);
        border-color: var(--primary-color);
        box-shadow: var(--control-shadow);
    }
    .CheckButtonArea label:hover {
        border-color: #626269;
    }
    .CheckButtonArea input:focus-visible + label {
        outline: 2px solid var(--focus-color);
        outline-offset: 2px;
    }
    .CheckButtonArea input[type="checkbox"]:checked + label span:after {
        color: #fff; /* 文字色             */
    }
</style>

