<script>
    import { SvelteURLSearchParams } from "svelte/reactivity";
    import SrtOverlay from "./SRT_Overlay.svelte";
    import { onDestroy, onMount, tick } from "svelte";
    import { main_media, useStyleList, useState } from "../lib/store.svelte";
    import { calculate_shadow, getCurrentText } from "../lib/data_process";

    let { index, scale = $bindable(), pos = $bindable() } = $props();
    // let isVisibleBox = $state(false);
    let srt = $derived(main_media.media.srt_data[index]);
    let json_data = $derived(main_media.json_data_list[main_media.media_index]);
    let outboxRef = $state();
    let inboxRef = $state();
    let inboxSize = $state({ width: 0, height: 0 });
    let style_list = useStyleList();

    let observer;

    let dragStart = { x: 0, y: 0 };
    let itemStart = { x: 0, y: 0, w: 0, h: 0 };
    let isResizing = false;
    let isMoving = false;
    let handlePoint = { horizon: "", vertival: "" };
    let move_target = "out";

    let spans = $derived(formatForDisplayParts(getCurrentText(srt.data, json_data.seekTime).text));

    // function wrapTextWithLineBreaks(text, tag) {
    //     const lines = text.split(/\r?\n/); // 改行で分割
    //     const spans = lines.map((line) => {
    //         return `<span class="srt_text" data-tag="${tag}" style="${setParam(tag)}" data-text="${line}">${line}</span>`;
    //     });
    //     return spans.join("<br>");
    // }

    // // テキストからHTML装飾へ（表示用）
    // function formatForDisplay(raw) {
    //     if (!raw) return "";

    //     // エスケープ
    //     let escaped = raw.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    //     // escaped = escaped.replace(/\n/g, "<br>");
    //     // タグ付き部分を先に変換（仮置き）
    //     const tagged = [];
    //     escaped = escaped.replace(/&lt;([\w-]+)&gt;([\s\S]*?)&lt;\/&gt;/g, (_, tag, content) => {
    //         // const span = `<span class="srt_text" data-tag="${tag}" style="${setParam(tag)}" data-text="${content}">${content}</span>`;
    //         const span = wrapTextWithLineBreaks(content, tag);
    //         tagged.push(span);
    //         return `__TAGGED__${tagged.length - 1}__`;
    //     });

    //     // 残った部分を default1 でラップ
    //     const parts = escaped.split(/__TAGGED__(\d+)__/);
    //     const result = parts
    //         .map((part, i) => {
    //             if (i % 2 === 1) {
    //                 return tagged[+part]; // 数字のインデックス
    //             } else {
    //                 return part ? wrapTextWithLineBreaks(part, json_data.srtFiles?.[srt.id].defaultStyle) : "";
    //             }
    //         })
    //         .join("");
    //     console.log(result);
    //     return result;
    // }

    function formatForDisplayParts(raw) {
        if (!raw) return [];
        // console.log(raw);
        let escaped = raw.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const tagged = [];
        escaped = escaped.replace(/&lt;([\w-]+)&gt;([\s\S]*?)&lt;\/&gt;/g, (_, tag, content) => {
            tagged.push({ tag, text: content });
            return `__TAGGED__${tagged.length - 1}__`;
        });
        const parts = escaped.split(/__TAGGED__(\d+)__/);
        const result = parts.flatMap((part, i) => {
            const isTagged = i % 2 === 1;
            const { tag, text } = isTagged ? tagged[+part] : { tag: json_data.srtFiles?.[srt.id].defaultStyle || "default", text: part };

            // 改行で分割
            let lines = text.split(/\r?\n/);

            // タグなしの場合だけ前後の不要な空要素を除去
            if (!isTagged) {
                // 先頭
                if (lines[0] === "") lines.shift();
                // 末尾
                if (lines[lines.length - 1] === "") lines.pop();
            }

            // 中の空行は残す
            // return lines.map((line) => ({ tag, text: line }));
            return lines.map((line) => {
                // 「ん゛」「つ゛」などを「゛ん」「゛つ」に見せる処理（縦書き用）
                const transformed = line.replace(/([んつくふへあおうえやゆよワヲンアイウエオカ-モヤユヨラ-ロ])([゛゜])/g, "$2$1");
                return { tag, text: transformed };
            });
        });
        // console.log(result);
        return result;
    }

    function handleTextClick(tag) {
        console.log(tag);
        if (!tag) return;
        const index = style_list.findIndex((item) => item.name === tag);
        main_media.currentStyle = index;
    }

    // 表示位置とサイズを設定するための関数
    function setPosition() {
        const srt_file = json_data.srtFiles?.[srt.id];
        if (!srt_file) return "";
        const scaleX = 1;
        const scaleY = 1;
        const styletext = `
            --box_left: ${pos.x + srt_file.x * scale.w}px;
            --box_top: ${pos.y + srt_file.y * scale.h}px;
            --box_width: ${srt_file.maxWidth}px;
            --box_height: ${srt_file.maxHeight}px;
            --scale_x: ${scale.w};
            --scale_y: ${scale.h};
            --txt_rotate: ${srt_file.textRotate};
            --txt_align: ${srt_file.textAlign};
        `;
        // console.log(styletext);
        return styletext;
    }

    function setAlign() {
        const srt_file = json_data.srtFiles?.[srt.id];
        if (!srt_file) return "";

        const alignX = ((srt_file.maxWidth - inboxSize.width) * srt_file.boxAlignX) / 100;
        const alignY = ((srt_file.maxHeight - inboxSize.height) * srt_file.boxAlignY) / 100;

        // console.log("H:  ",srt_file.max_height,"    ",inboxSize.height);
        // console.log("W:  ",srt_file.max_width,"    ",inboxSize.width);
        return `
        --box_align_x: ${alignX}px;
        --box_align_y: ${alignY}px;
    `;
    }
    // 表示スタイルを反映する関数
    function setParam(tag_key) {
        const style = json_data.styles[tag_key];
        const outline1size = style.outline1.enable ? style.outline1.size : 0;
        const outline2size = style.outline2.enable ? style.outline2.size + outline1size : 0;

        const tagtext = `
            --txt_font: '${style.font}';
            --txt_size: ${style.fontSize}px;
            --txt_color: ${style.textColor};
            --txt_style: ${style.fontStyle};
            --txt_weight: ${style.fontWeight};
            --txt_space: ${style.letterSpace}px;
            --txt_line_space: ${style.lineSpace + style.fontSize}px;
            --out1_size: ${outline1size}px;
            --out1_color: ${style.outline1.color};
            --out2_size: ${outline2size}px;
            --out2_color: ${style.outline2.color};
            --out2_x: ${style.outline2.offsetX}px;
            --out2_y: ${style.outline2.offsetY}px;
            --shadow_color: ${style.shadow.color};
            --drop_shadow:${calculate_shadow(style.shadow)};
        `;
        // console.log(style.shadow);
        return tagtext;
    }

    function updateInboxSize() {
        if (inboxRef) {
            inboxSize = {
                width: inboxRef.offsetWidth,
                height: inboxRef.offsetHeight,
            };
        }
    }

    //字幕箱のリサイズ
    const resizeDragStart = (e, horizon, vertical) => {
        e.preventDefault();
        e.stopPropagation();
        outboxRef?.focus();
        const srt_file = json_data.srtFiles?.[srt.id];
        isResizing = true;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
        itemStart.x = srt_file.x;
        itemStart.y = srt_file.y;
        itemStart.w = srt_file.maxWidth;
        itemStart.h = srt_file.maxHeight;

        handlePoint.horizon = horizon;
        handlePoint.vertical = vertical;
        window.addEventListener("mousemove", handleResizing);
        window.addEventListener("mouseup", stopResize);

        const cancelClick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            stopResize();
            window.removeEventListener("click", cancelClick, true); // once
        };
        window.addEventListener("click", cancelClick, true);
    };
    function handleResizing(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!isResizing) return;
        const srt_file = json_data.srtFiles?.[srt.id];

        const offsetX = e.clientX - dragStart.x;
        const offsetY = e.clientY - dragStart.y;
        // 表示されるテキストの位置を更新
        if (handlePoint.vertical == null && handlePoint.horizon == null) {
            srt_file.x = itemStart.x + offsetX / scale.w;
            srt_file.y = itemStart.y + offsetY / scale.h;
        }

        // topのリサイズの処理
        if (handlePoint.vertical === "top") {
            srt_file.y = itemStart.y + offsetY / scale.h;
            srt_file.maxHeight = itemStart.h - offsetY / scale.h;
        }

        // bottomのリサイズ処理
        if (handlePoint.vertical === "bottom") {
            srt_file.maxHeight = itemStart.h + offsetY / scale.h;
        }

        // leftのリサイズ処理
        if (handlePoint.horizon === "left") {
            srt_file.maxWidth = itemStart.w - offsetX / scale.w;
            srt_file.x = itemStart.x + offsetX / scale.w;
        }

        // rightのリサイズ処理
        if (handlePoint.horizon === "right") {
            srt_file.maxWidth = itemStart.w + offsetX / scale.w;
        }
    }

    function stopResize() {
        isResizing = false;
        handlePoint.vertical = null;
        handlePoint.horizon = null;
        window.removeEventListener("mousemove", handleResizing);
        window.removeEventListener("mouseup", stopResize);
    }

    const moveDragStart = (e, target) => {
        e.preventDefault();
        e.stopPropagation();
        outboxRef?.focus();
        const srt_file = json_data.srtFiles?.[srt.id];
        main_media.currentSrt = srt.id;
        if (isResizing) {
            console.log("return because resizing");
            return;
        }
        isMoving = true;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
        move_target = target;
        if (move_target == "out") {
            itemStart.x = srt_file.x;
            itemStart.y = srt_file.y;
        }
        if (move_target == "in") {
            // main_media.currentStyle = style_list.findIndex((item) => item.name === srt_file.defaultStyle);
            itemStart.x = ((srt_file.maxWidth - inboxSize.width) * srt_file.boxAlignX) / 100;
            itemStart.y = ((srt_file.maxHeight - inboxSize.height) * srt_file.boxAlignY) / 100;
        }
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", stopMove);

        const cancelClick = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            stopMove();
            window.removeEventListener("click", cancelClick, true); // once
        };
        window.addEventListener("click", cancelClick, true);
    };
    function handleMove(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!isMoving) return;
        const srt_file = json_data.srtFiles?.[srt.id];

        // 表示されるテキストの位置を更新
        if (move_target == "out") {
            const offsetX = (e.clientX - dragStart.x) / scale.w;
            const offsetY = (e.clientY - dragStart.y) / scale.h;
            srt_file.x = itemStart.x + offsetX;
            srt_file.y = itemStart.y + offsetY;
        }
        if (move_target == "in") {
            const offsetX = (e.clientX - dragStart.x) / scale.w;
            const offsetY = (e.clientY - dragStart.y) / scale.h;
            srt_file.boxAlignX = Math.min(100, Math.max(1, Math.round(((itemStart.x + offsetX) / (srt_file.maxWidth - inboxSize.width)) * 100)));
            srt_file.boxAlignY = Math.min(100, Math.max(1, Math.round(((itemStart.y + offsetY) / (srt_file.maxHeight - inboxSize.height)) * 100)));
        }
    }

    function stopMove() {
        isMoving = false;
        handlePoint.vertical = null;
        handlePoint.horizon = null;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", stopMove);
    }
    onMount(() => {
        if (inboxRef) {
            observer = new ResizeObserver(updateInboxSize);
            observer.observe(inboxRef);
            updateInboxSize();
        }
    });

    onDestroy(() => {
        if (observer && inboxRef) {
            observer.unobserve(inboxRef);
        }
    });
</script>

<div class="srt_box {useState.view_srt_frame ? 'box_visible' : ''}" tabindex="0" bind:this={outboxRef} style={setPosition()} onmousedown={(e) => moveDragStart(e, "out")}>
    <div class="srt_inbox" bind:this={inboxRef} style={setAlign()} onmousedown={(e) => moveDragStart(e, "in")}>
        <div bind:this={inboxRef}>
            {#each spans as part}
                <span class="srt_text" style={setParam(part.tag)} data-tag={part.tag} data-text={part.text} onmousedown={(e) => handleTextClick(part.tag)}>
                    {part.text}<br />
                </span>
            {/each}
        </div>
    </div>
    <span class="top" onmousedown={(e) => resizeDragStart(e, null, "top")}></span>
    <span class="bottom" onmousedown={(e) => resizeDragStart(e, null, "bottom")}></span>
    <span class="left" onmousedown={(e) => resizeDragStart(e, "left", null)}></span>
    <span class="right" onmousedown={(e) => resizeDragStart(e, "right", null)}></span>
    <span class="tleft" onmousedown={(e) => resizeDragStart(e, "left", "top")}></span>
    <span class="tright" onmousedown={(e) => resizeDragStart(e, "right", "top")}></span>
    <span class="bleft" onmousedown={(e) => resizeDragStart(e, "left", "bottom")}></span>
    <span class="bright" onmousedown={(e) => resizeDragStart(e, "right", "bottom")}></span>
</div>

<style>
    .top {
        position: absolute;
        top: 0;
        right: 5px;
        left: 5px;
        height: 5px;
        cursor: ns-resize;
    }

    .bottom {
        position: absolute;
        bottom: 0;
        right: 5px;
        left: 5px;
        height: 5px;
        cursor: ns-resize;
    }

    .left {
        position: absolute;
        top: 5px;
        bottom: 5px;
        left: 0;
        width: 5px;
        cursor: ew-resize;
    }

    .right {
        position: absolute;
        top: 5px;
        right: 0;
        bottom: 5px;
        width: 5px;
        cursor: ew-resize;
    }

    .tleft {
        position: absolute;
        top: 0;
        left: 0;
        width: 5px;
        height: 5px;
        cursor: nwse-resize;
    }

    .tright {
        position: absolute;
        top: 0;
        right: 0;
        width: 5px;
        height: 5px;
        cursor: nesw-resize;
    }

    .bleft {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 5px;
        height: 5px;
        cursor: nesw-resize;
    }

    .bright {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 5px;
        height: 5px;
        cursor: nwse-resize;
    }

    .box_visible,
    .srt_box:focus {
        outline-offset: -5px;
        outline: 5px solid rgba(0, 255, 255, 0.418);
        background-color: rgba(0, 255, 255, 0.11);
    }
    .box_visible .srt_inbox,
    .srt_box:focus .srt_inbox {
        outline-offset: -2px;
        outline: 3px solid rgba(255, 230, 0, 0.418);
        background-color: rgba(17, 0, 255, 0.13);
    }
</style>
