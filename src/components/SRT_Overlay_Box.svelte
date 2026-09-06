<script>
    import { onDestroy, onMount } from "svelte";
    import {
        projectState,
        selectionState,
        selectOverlayTrack,
        uiState,
    } from "../lib/store.svelte";
    import { calculate_shadow } from "../lib/data_process";
    import { beginEditorEdit } from "../lib/editor_history";
    import { createBlockLayout, getBlock } from "../lib/subtitle_blocks";

    let { srt, clip, clipIndex, blockId, body, sentences, scale, pos } = $props();
    let json_data = $derived(projectState.jsonDataList[projectState.mediaIndex]);
    let layout = $derived(body?.layout ?? json_data.scriptFiles?.[srt.id]);
    let displayLayout = $derived({ ...json_data.scriptFiles?.[srt.id], ...body?.layout });
    let selected = $derived(selectionState.selectedTrackId === srt.id
        && (selectionState.overlayClipIndex === clipIndex || selectionState.overlayClipIndex === null && blockId === null)
        && selectionState.overlayBlockId === blockId);
    let outboxRef = $state();
    let inboxRef = $state();
    let inboxSize = $state({ width: 0, height: 0 });
    let dragLayout;
    let dragBody;
    let dragClip;
    let dragProject;
    let commitDrag;

    let observer;
    const minBoxSize = 20;
    let dragStart = { x: 0, y: 0 };
    let itemStart = { x: 0, y: 0, w: 0, h: 0 };
    let isResizing = false;
    let isMoving = false;
    let handlePoint = { horizon: null, vertical: null };
    let moveTarget = "out";

    function selectTrackAndStyle(tag) {
        if (!srt) return;
        selectOverlayTrack(srt.id, tag, clipIndex, blockId);
    }

    // 表示位置とサイズを設定するための関数
    function setPosition() {
        const srt_file = displayLayout;
        if (!srt_file) return "";
        const styletext = `
            --box_left: ${(pos?.x ?? 0) + srt_file.x * (scale?.w ?? 1)}px;
            --box_top: ${(pos?.y ?? 0) + srt_file.y * (scale?.h ?? 1)}px;
            --box_width: ${srt_file.maxWidth}px;
            --box_height: ${srt_file.maxHeight}px;
            --scale_x: ${scale?.w ?? 1};
            --scale_y: ${scale?.h ?? 1};
            --txt_rotate: ${srt_file.textRotate};
            --txt_align: ${srt_file.textAlign};
        `;
        return styletext;
    }

    function setAlign() {
        const srt_file = displayLayout;
        if (!srt_file) return "";

        const alignX = ((srt_file.maxWidth - inboxSize.width) * srt_file.boxAlignX) / 100;
        const alignY = ((srt_file.maxHeight - inboxSize.height) * srt_file.boxAlignY) / 100;

        return `
        --box_align_x: ${alignX}px;
        --box_align_y: ${alignY}px;
    `;
    }
    // 表示スタイルを反映する関数
    function setParam(tag_key) {
        const style = json_data.styles[tag_key] ?? Object.values(json_data.styles)[0];
        if (!style) return "";
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
            --shadow_text:${calculate_shadow(style.shadow)};
        `;
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

    function currentSrtFile() {
        return layout ? displayLayout : null;
    }

    function beginDrag() {
        dragLayout = layout;
        dragBody = body;
        dragClip = clip;
        dragProject = json_data;
        commitDrag = body && clip && (body.layout || clip.additionalBlocks?.length || blockId !== null)
            ? beginEditorEdit(srt, [clip]) : null;
    }

    function finishDrag() {
        commitDrag?.();
        commitDrag = null;
        dragLayout = null;
    }

    function currentDragLayout() {
        // Never use the next clip (or a layout replaced by undo) during an ongoing gesture.
        if (json_data !== dragProject || clip !== dragClip || layout !== dragLayout
            || (clip && (srt.data[clipIndex] !== clip || getBlock(clip, blockId) !== dragBody))) {
            stopMove();
            stopResize();
            return null;
        }
        return dragLayout;
    }

    function clampBoxSize(value) {
        return Math.max(minBoxSize, value);
    }

    function writeDragLayout(changes) {
        if (!currentDragLayout() || !Object.entries(changes).some(([key, value]) => displayLayout[key] !== value)) return;
        // Selection inherits without writing. The first actual edit owns its own layout.
        if (dragBody && dragClip && !dragBody.layout && (dragClip.additionalBlocks?.length || blockId !== null)) {
            dragBody.layout = createBlockLayout(json_data.scriptFiles[srt.id]);
            dragLayout = dragBody.layout;
        }
        Object.assign(dragLayout, changes);
    }

    function resizeDragStart(e, horizon, vertical) {
        e.preventDefault();
        e.stopPropagation();
        const srt_file = currentSrtFile();
        if (!srt_file) return;
        if (e.button !== 0) return;
        selectTrackAndStyle(displayLayout.defaultStyle);
        beginDrag();
        outboxRef?.focus();
        isResizing = true;
        dragStart = { x: e.clientX, y: e.clientY };
        itemStart = { x: srt_file.x, y: srt_file.y, w: srt_file.maxWidth, h: srt_file.maxHeight };
        handlePoint = { horizon, vertical };
        window.addEventListener("mousemove", handleResizing);
        window.addEventListener("mouseup", stopResize);
    }

    function handleResizing(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!isResizing) return;
        const srt_file = currentDragLayout();
        if (!srt_file) return;
        const scaleW = scale?.w || 1;
        const scaleH = scale?.h || 1;
        const offsetX = (e.clientX - dragStart.x) / scaleW;
        const offsetY = (e.clientY - dragStart.y) / scaleH;

        const changes = {};
        if (handlePoint.vertical === "top") {
            const height = clampBoxSize(itemStart.h - offsetY);
            changes.y = itemStart.y + (itemStart.h - height);
            changes.maxHeight = height;
        }
        if (handlePoint.vertical === "bottom") {
            changes.maxHeight = clampBoxSize(itemStart.h + offsetY);
        }
        if (handlePoint.horizon === "left") {
            const width = clampBoxSize(itemStart.w - offsetX);
            changes.x = itemStart.x + (itemStart.w - width);
            changes.maxWidth = width;
        }
        if (handlePoint.horizon === "right") {
            changes.maxWidth = clampBoxSize(itemStart.w + offsetX);
        }
        writeDragLayout(changes);
    }

    function stopResize() {
        if (isResizing) finishDrag();
        isResizing = false;
        handlePoint = { horizon: null, vertical: null };
        window.removeEventListener("mousemove", handleResizing);
        window.removeEventListener("mouseup", stopResize);
    }

    function moveDragStart(e, target, styleKey = null) {
        e.preventDefault();
        e.stopPropagation();
        const srt_file = currentSrtFile();
        if (!srt_file || isResizing) return;
        if (e.button !== 0) return;
        selectTrackAndStyle(styleKey ?? displayLayout.defaultStyle);
        beginDrag();
        outboxRef?.focus();
        isMoving = true;
        moveTarget = target;
        dragStart = { x: e.clientX, y: e.clientY };
        if (target === "out") {
            itemStart = { x: srt_file.x, y: srt_file.y, w: srt_file.maxWidth, h: srt_file.maxHeight };
        } else {
            itemStart = {
                x: ((srt_file.maxWidth - inboxSize.width) * srt_file.boxAlignX) / 100,
                y: ((srt_file.maxHeight - inboxSize.height) * srt_file.boxAlignY) / 100,
                w: srt_file.maxWidth,
                h: srt_file.maxHeight,
            };
        }
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", stopMove);
    }

    function handleMove(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!isMoving) return;
        const srt_file = currentDragLayout();
        if (!srt_file) return;
        const scaleW = scale?.w || 1;
        const scaleH = scale?.h || 1;
        const offsetX = (e.clientX - dragStart.x) / scaleW;
        const offsetY = (e.clientY - dragStart.y) / scaleH;

        if (moveTarget === "out") {
            writeDragLayout({ x: itemStart.x + offsetX, y: itemStart.y + offsetY });
            return;
        }

        const rangeX = displayLayout.maxWidth - inboxSize.width;
        const rangeY = displayLayout.maxHeight - inboxSize.height;
        const changes = {};
        if (rangeX > 0) {
            changes.boxAlignX = Math.max(0, Math.min(100, Math.round(((itemStart.x + offsetX) / rangeX) * 100)));
        }
        if (rangeY > 0) {
            changes.boxAlignY = Math.max(0, Math.min(100, Math.round(((itemStart.y + offsetY) / rangeY) * 100)));
        }
        writeDragLayout(changes);
    }

    function stopMove() {
        if (isMoving) finishDrag();
        isMoving = false;
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
        observer?.disconnect();
        stopMove();
        stopResize();
    });
</script>

<div class="srt_box {uiState.viewSrtFrame ? 'box_visible' : ''} {selected ? 'box_selected' : ''} {sentences.some(sentence => sentence.parts.some(part => part.text)) ? '' : 'box_empty'}" data-track-id={srt.id} data-clip-index={clipIndex} data-block-id={blockId ?? 'primary'} tabindex="0" bind:this={outboxRef} style={setPosition()} onmousedown={(e) => moveDragStart(e, "out")} onclick={(e) => e.stopPropagation()}>
    <div class="srt_inbox" bind:this={inboxRef} style={setAlign()} onmousedown={(e) => moveDragStart(e, "in")} onclick={(e) => e.stopPropagation()}>
        <div>
            {#each sentences as sentence}
                <span class="srt_sentence {sentence.gap ? 'sentence_gap' : ''}" style={setParam(displayLayout.defaultStyle)}>
                    {#each sentence.parts as part}
                        <span
                            class="srt_text"
                            style={setParam(part.tag)}
                            data-tag={part.tag}
                            data-text={part.text}
                            onmousedown={(e) => {
                                moveDragStart(e, "in", part.tag);
                            }}
                            onclick={(e) => e.stopPropagation()}
                        >
                            <span class="srt_layer srt_shadow" aria-hidden="true">{part.text}</span>
                            <span class="srt_layer srt_outline2" aria-hidden="true">{part.text}</span>
                            <span class="srt_content">{part.text}</span>
                        </span>
                    {/each}
                </span>
            {/each}
        </div>
    </div>
    <span class="resize-handle top" onmousedown={(e) => resizeDragStart(e, null, "top")} onclick={(e) => e.stopPropagation()}></span>
    <span class="resize-handle bottom" onmousedown={(e) => resizeDragStart(e, null, "bottom")} onclick={(e) => e.stopPropagation()}></span>
    <span class="resize-handle left" onmousedown={(e) => resizeDragStart(e, "left", null)} onclick={(e) => e.stopPropagation()}></span>
    <span class="resize-handle right" onmousedown={(e) => resizeDragStart(e, "right", null)} onclick={(e) => e.stopPropagation()}></span>
    <span class="resize-handle tleft" onmousedown={(e) => resizeDragStart(e, "left", "top")} onclick={(e) => e.stopPropagation()}></span>
    <span class="resize-handle tright" onmousedown={(e) => resizeDragStart(e, "right", "top")} onclick={(e) => e.stopPropagation()}></span>
    <span class="resize-handle bleft" onmousedown={(e) => resizeDragStart(e, "left", "bottom")} onclick={(e) => e.stopPropagation()}></span>
    <span class="resize-handle bright" onmousedown={(e) => resizeDragStart(e, "right", "bottom")} onclick={(e) => e.stopPropagation()}></span>
</div>

<style>
    .resize-handle {
        position: absolute;
        display: block;
        z-index: 50;
        background: rgba(0, 255, 255, 0.18);
        border: 1px solid rgba(0, 255, 255, 0.55);
        box-sizing: border-box;
    }
    .top {
        top: 0;
        right: 8px;
        left: 8px;
        height: 8px;
        cursor: ns-resize;
    }
    .bottom {
        bottom: 0;
        right: 8px;
        left: 8px;
        height: 8px;
        cursor: ns-resize;
    }
    .left {
        top: 8px;
        bottom: 8px;
        left: 0;
        width: 8px;
        cursor: ew-resize;
    }
    .right {
        top: 8px;
        right: 0;
        bottom: 8px;
        width: 8px;
        cursor: ew-resize;
    }
    .tleft,
    .tright,
    .bleft,
    .bright {
        width: 14px;
        height: 14px;
    }
    .tleft {
        top: 0;
        left: 0;
        cursor: nwse-resize;
    }
    .tright {
        top: 0;
        right: 0;
        cursor: nesw-resize;
    }
    .bleft {
        bottom: 0;
        left: 0;
        cursor: nesw-resize;
    }
    .bright {
        right: 0;
        bottom: 0;
        cursor: nwse-resize;
    }
    .srt_box:not(.box_visible):not(.box_selected) .resize-handle {
        display: none;
    }
    .srt_box.box_empty:not(.box_selected) {
        pointer-events: none;
    }
    .box_visible,
    .box_selected {
        outline-offset: -5px;
        outline: 5px solid rgba(0, 255, 255, 0.418);
        background-color: rgba(0, 255, 255, 0.11);
    }
    .box_visible .srt_inbox,
    .box_selected .srt_inbox {
        outline-offset: -2px;
        outline: 3px solid rgba(255, 230, 0, 0.418);
        background-color: rgba(17, 0, 255, 0.13);
    }
</style>

