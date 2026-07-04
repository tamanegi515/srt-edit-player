<script>
    import { onMount } from "svelte";
    import { mediaState, projectState, useStyleList } from "../lib/store.svelte";
    import { getSrtItemText, setSrtItemText } from "../lib/data_process";
    import { convSecToStr } from "../lib/util";

    const styleList = useStyleList();

    let { track_id, data_id, selected = false, onfocus = () => {}, ...props } = $props();

    const tagList = $derived.by(() => styleList.map((style) => style.name));
    let editorRef = $state();
    let menuRef = $state();
    let undoStack = $state([]);
    let redoStack = $state([]);
    let track = $derived(mediaState.media.srt_data.find((item) => item.id === track_id));
    let data_list = $derived(track?.data ?? []);
    let data = $derived(data_list[data_id]);
    let json_data = $derived(projectState.jsonDataList[projectState.mediaIndex]);
    let iscurrent = $derived.by(() => data?.startTime <= json_data.seekTime && json_data.seekTime <= data?.endTime);
    let contextMenu = $state(emptyContextMenu());
    let isComposing = false;
    // このエディタ自身に未コミットの入力（debounce 待ち）がある間だけ true。
    // フォーカスの有無ではなく実際の未コミット編集の有無で DOM 保護を判定するためのフラグ。
    let hasPendingEdit = false;
    let inputTimeout;

    export function scrollToIndex() {
        editorRef?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function emptyContextMenu() {
        return {
            show: false,
            x: 0,
            y: 0,
            range: null,
            tag: null,
            target: null,
            selectedText: "",
        };
    }

    function getEditorText(item) {
        if (Array.isArray(item?.sentences) && item.sentences.length) {
            return item.sentences.join("\n\n");
        }
        return getSrtItemText(item).replace(/\r\n/g, "\n\n");
    }

    function positionMenu(x, y) {
        setTimeout(() => {
            const menus = document.querySelectorAll(".menu");
            for (const menu of menus) {
                menu.style.top = `${y}px`;
                menu.style.left = `${x}px`;
            }
        }, 0);
    }

    function pushUndo() {
        if (!editorRef) return;
        undoStack = [...undoStack, editorRef.innerHTML];
        redoStack = [];
    }

    function onKeyDown(e) {
        if (e.ctrlKey && e.key === "z") {
            e.preventDefault();
            if (undoStack.length > 0) {
                const current = editorRef.innerHTML;
                const prev = undoStack[undoStack.length - 1];
                undoStack = undoStack.slice(0, -1);
                redoStack = [...redoStack, current];
                editorRef.innerHTML = prev;
                updateTextFromHTML();
                placeCaretAtEnd();
            }
        }

        if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
            e.preventDefault();
            if (redoStack.length > 0) {
                const current = editorRef.innerHTML;
                const next = redoStack[redoStack.length - 1];
                redoStack = redoStack.slice(0, -1);
                undoStack = [...undoStack, current];
                editorRef.innerHTML = next;
                updateTextFromHTML();
                placeCaretAtEnd();
            }
        }
    }

    function wrapWithTag(tag) {
        if (!contextMenu.range) return;
        pushUndo();

        const span = document.createElement("span");
        span.setAttribute("data-tag", tag);
        span.setAttribute("style", "color: #11a8a0;");
        span.appendChild(contextMenu.range.extractContents());
        contextMenu.range.insertNode(span);
        updateTextFromHTML();
        hideMenu();
    }

    function removeTagFromElement(el) {
        if (!el) return;
        pushUndo();
        const parent = el.parentNode;
        const fragment = document.createDocumentFragment();
        const temp = document.createElement("div");
        temp.innerHTML = el.innerHTML;
        Array.from(temp.childNodes).forEach((node) => fragment.appendChild(node));
        parent.replaceChild(fragment, el);
        updateTextFromHTML();
        hideMenu();
    }

    function onContextMenu(e) {
        e.preventDefault();
        e.stopPropagation();
        onfocus();

        const selection = window.getSelection();
        const target = e.target;
        const margin = 8;
        const menuWidth = 200;
        const menuHeight = 260;
        let x = e.clientX;
        let y = e.clientY;
        if (x + menuWidth > window.innerWidth - margin) x = window.innerWidth - menuWidth - margin;
        if (y + menuHeight > window.innerHeight - margin) y = window.innerHeight - menuHeight - margin;

        if (target?.dataset?.tag) {
            contextMenu = {
                show: true,
                x,
                y,
                range: null,
                tag: target.dataset.tag,
                target,
                selectedText: "",
            };
        } else if (selection && !selection.isCollapsed && editorRef?.contains(selection.anchorNode) && editorRef?.contains(selection.focusNode)) {
            contextMenu = {
                show: true,
                x,
                y,
                range: selection.getRangeAt(0),
                tag: null,
                target: null,
                selectedText: selection.toString(),
            };
        } else {
            contextMenu = {
                show: true,
                x,
                y,
                range: selection?.rangeCount ? selection.getRangeAt(0) : null,
                tag: null,
                target: null,
                selectedText: "",
            };
        }

        document.body.dataset.submenuDirection = x > window.innerWidth - menuWidth * 1.5 ? "left" : "right";
        positionMenu(x, y);
    }

    function hideMenu() {
        contextMenu = emptyContextMenu();
    }

    function updateTextFromHTML() {
        if (!data) return;
        setSrtItemText(data, extractTextFromHTML(editorRef.innerHTML));
    }

    $effect(() => {
        if (!editorRef || !data) return;
        const text = getEditorText(data);
        // このエディタに未コミットの入力（通常入力の debounce 待ち・IME 変換中）がある間だけ
        // DOM を正としてキャレットを保持する。フォーカスの有無では判定しない。
        // （同じクリップを別列でも表示している場合、フォーカスが移った直後は pending が無いため
        //   即座に同期でき、フォーカス中の列だけ表示が古いまま残ってモデルを上書きする事故を防ぐ）
        if (isComposing || hasPendingEdit) return;
        if (extractTextFromHTML(editorRef.innerHTML) !== text) {
            editorRef.innerHTML = formatForDisplay(text);
        }
    });

    function formatForDisplay(raw) {
        return String(raw ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>")
            .replace(
                /&lt;([\w-]+)&gt;([\s\S]*?)&lt;\/&gt;/g,
                (_, tag, content) => `<span data-tag="${tag}" style="color: #11a8a0;">${content}</span>`,
            );
    }

    function extractTextFromHTML(html) {
        return String(html ?? "")
            .replace(/<span data-tag="([\w-]+)"[^>]*>([\s\S]*?)<\/span>/g, "<$1>$2</>")
            .replace(/<div><br><\/div>/g, "<br>")
            .replace(/<div>/g, "<br>")
            .replace(/<\/div>/g, "")
            .replace(/<br\s*\/?>/g, "\n")
            .replace(/\u200B/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&");
    }

    function insertLineBreakAtCursor() {
        pushUndo();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const br = document.createElement("br");
        range.deleteContents();
        range.insertNode(br);
        const spacer = document.createTextNode("\u200B");
        br.after(spacer);
        range.setStartAfter(spacer);
        range.setEndAfter(spacer);
        sel.removeAllRanges();
        sel.addRange(range);
        clearTimeout(inputTimeout);
        hasPendingEdit = true;
        inputTimeout = setTimeout(() => {
            updateTextFromHTML();
            hasPendingEdit = false;
        }, 0);
    }

    function onInput() {
        // IME 変換中はモデルへ書き戻さない（確定時にまとめて反映し、変換の分断を防ぐ）
        if (isComposing) return;
        hasPendingEdit = true;
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(() => {
            pushUndo();
            updateTextFromHTML();
            hasPendingEdit = false;
        }, 100);
    }

    function onCompositionStart() {
        isComposing = true;
    }

    function onCompositionEnd() {
        isComposing = false;
        hasPendingEdit = true;
        // 変換確定後に一度だけモデルへ反映
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(() => {
            pushUndo();
            updateTextFromHTML();
            hasPendingEdit = false;
        }, 0);
    }

    function onBlur() {
        if (isComposing) return;
        // 保留中の入力を確定し、モデルの正準形で表示を整える（フォーカスが外れた後なので安全）
        clearTimeout(inputTimeout);
        hasPendingEdit = false;
        updateTextFromHTML();
        if (!data || !editorRef) return;
        const text = getEditorText(data);
        if (extractTextFromHTML(editorRef.innerHTML) !== text) {
            editorRef.innerHTML = formatForDisplay(text);
        }
    }

    function placeCaretAtEnd() {
        if (!editorRef) return;
        const range = document.createRange();
        range.selectNodeContents(editorRef);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }

    function execCommandSafe(cmd) {
        editorRef?.focus();
        document.execCommand(cmd);
        updateTextFromHTML();
        hideMenu();
    }

    function deleteSelection() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        sel.getRangeAt(0).deleteContents();
        updateTextFromHTML();
        hideMenu();
    }

    function searchOnWeb(text) {
        if (!text) return;
        window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, "_blank");
        hideMenu();
    }

    function fragmentToHTML(fragment) {
        const div = document.createElement("div");
        div.appendChild(fragment);
        return div.innerHTML;
    }

    function getSplitText() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !editorRef) return { beforeTxt: getEditorText(data), afterTxt: "" };

        const range = sel.getRangeAt(0);
        if (!editorRef.contains(range.commonAncestorContainer)) {
            return { beforeTxt: getEditorText(data), afterTxt: "" };
        }

        const beforeRange = range.cloneRange();
        beforeRange.setStart(editorRef, 0);
        const afterRange = range.cloneRange();
        afterRange.setEndAfter(editorRef.lastChild ?? editorRef);

        return {
            beforeTxt: extractTextFromHTML(fragmentToHTML(beforeRange.cloneContents())),
            afterTxt: extractTextFromHTML(fragmentToHTML(afterRange.cloneContents())),
        };
    }

    function splitData() {
        if (!data) return;
        const split = getSplitText();
        let splitTime = (data.endTime + data.startTime) / 2;
        if (iscurrent) splitTime = json_data.seekTime;
        const splitTimeStr = convSecToStr(splitTime);
        const newdata = {
            startTimeStr: splitTimeStr,
            endTimeStr: data.endTimeStr,
            startTime: splitTime,
            endTime: data.endTime,
            text: "",
            ref: {},
        };
        setSrtItemText(newdata, split.afterTxt.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ""));
        data.endTimeStr = splitTimeStr;
        data.endTime = splitTime;
        setSrtItemText(data, split.beforeTxt.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ""));
        data_list.splice(data_id + 1, 0, newdata);
        hideMenu();
    }

    function unionData() {
        if (data_list.length <= data_id + 1) return;
        const current = data_list[data_id];
        const next = data_list[data_id + 1];
        if (!current || !next) return;
        const newData = {
            startTimeStr: current.startTimeStr,
            endTimeStr: next.endTimeStr,
            startTime: current.startTime,
            endTime: next.endTime,
            text: "",
            ref: current.ref ?? {},
        };
        setSrtItemText(newData, `${getEditorText(current)}\n　\n${getEditorText(next)}`);
        data_list.splice(data_id, 2, newData);
        hideMenu();
    }

    function menuKey(e, fn) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fn();
        }
    }

    onMount(() => {
        function handleClickOutside(e) {
            if (!e.target.closest(".menu")) hideMenu();
        }
        document.body.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.body.removeEventListener("mousedown", handleClickOutside);
        };
    });
</script>

<div
    role="textbox"
    tabindex="0"
    class="editor {iscurrent ? 'current' : ''} {selected ? 'selected' : ''}"
    contenteditable
    bind:this={editorRef}
    onfocus={onfocus}
    onblur={onBlur}
    oncontextmenu={onContextMenu}
    oninput={onInput}
    oncompositionstart={onCompositionStart}
    oncompositionend={onCompositionEnd}
    onkeydown={(e) => {
        if (e.key === "Enter") {
            // IME変換確定のEnterはisComposing=true（一部ブラウザはkeyCode 229）で届く。
            // ここで改行を挿入すると変換確定のたびに余計な改行が混入するため何もしない。
            if (e.isComposing || e.keyCode === 229 || isComposing) return;
            e.preventDefault();
            insertLineBreakAtCursor();
        } else {
            onKeyDown(e);
        }
    }}
></div>

{#if contextMenu.show}
    <div class="menu" bind:this={menuRef} onmousedown={(e) => e.stopPropagation()}>
        {#if contextMenu.selectedText && !contextMenu.tag}
            <div class="menu-item submenu">
                タグを付ける ▶
                <div class="submenu-panel">
                    {#each tagList as tag}
                        <div role="button" tabindex="0" class="menu-item" onclick={() => wrapWithTag(tag)} onkeydown={(e) => menuKey(e, () => wrapWithTag(tag))}>
                            {tag}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        {#if !contextMenu.selectedText && !contextMenu.tag}
            <div role="button" tabindex="0" class="menu-item" onclick={splitData} onkeydown={(e) => menuKey(e, splitData)}>
                カーソル位置で分割
            </div>
        {/if}

        {#if contextMenu.tag}
            <div role="button" tabindex="0" class="menu-item" onclick={() => removeTagFromElement(contextMenu.target)} onkeydown={(e) => menuKey(e, () => removeTagFromElement(contextMenu.target))}>
                タグを外す
            </div>
        {/if}

        <div role="button" tabindex="0" class="menu-item" onclick={unionData} onkeydown={(e) => menuKey(e, unionData)}>
            下と結合する
        </div>
        <div role="button" tabindex="0" class="menu-item" onclick={() => onKeyDown({ ctrlKey: true, key: "z", preventDefault: () => {} })} onkeydown={(e) => menuKey(e, () => onKeyDown({ ctrlKey: true, key: "z", preventDefault: () => {} }))}>
            元に戻す（Ctrl+Z）
        </div>
        <div role="button" tabindex="0" class="menu-item" onclick={() => onKeyDown({ ctrlKey: true, key: "y", preventDefault: () => {} })} onkeydown={(e) => menuKey(e, () => onKeyDown({ ctrlKey: true, key: "y", preventDefault: () => {} }))}>
            やり直し（Ctrl+Y）
        </div>

        {#if contextMenu.selectedText}
            <div role="button" tabindex="0" class="menu-item" onclick={() => searchOnWeb(contextMenu.selectedText)} onkeydown={(e) => menuKey(e, () => searchOnWeb(contextMenu.selectedText))}>
                Webで"{contextMenu.selectedText}"を検索する
            </div>
            <div role="button" tabindex="0" class="menu-item" onclick={() => execCommandSafe("cut")} onkeydown={(e) => menuKey(e, () => execCommandSafe("cut"))}>
                切り取り（Ctrl+X）
            </div>
            <div role="button" tabindex="0" class="menu-item" onclick={() => execCommandSafe("copy")} onkeydown={(e) => menuKey(e, () => execCommandSafe("copy"))}>
                コピー（Ctrl+C）
            </div>
            <div role="button" tabindex="0" class="menu-item" onclick={() => execCommandSafe("paste")} onkeydown={(e) => menuKey(e, () => execCommandSafe("paste"))}>
                貼り付け（Ctrl+V）
            </div>
            <div role="button" tabindex="0" class="menu-item" onclick={deleteSelection} onkeydown={(e) => menuKey(e, deleteSelection)}>
                削除（Delete）
            </div>
        {/if}
    </div>
{/if}

<style>
    .editor {
        box-sizing: border-box;
        border: 1px solid #cccccc57;
        border-radius: 4px;
        margin: 2px 3px 10px 3px;
        padding: 5px;
        min-height: 50px;
        max-height: 200px;
        font-family: monospace;
        white-space: pre-wrap;
        overflow-y: auto;
        scrollbar-gutter: auto;
        font-size: 15px;
        background: #242424;
        color: #c2c2c2;
    }
    .current {
        outline: 2px solid #00bd9db0;
    }
    .selected {
        outline: 2px solid #007bff;
    }
    .menu {
        position: fixed;
        top: 8px;
        left: 8px;
        background: white;
        border: 1px solid #aaa;
        z-index: 999;
        min-width: 180px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    }
    .menu-item {
        padding: 6px 12px;
        cursor: pointer;
        white-space: nowrap;
        color: #111;
    }
    .menu-item:hover {
        background-color: #eef;
    }
    .submenu {
        position: relative;
    }
    .submenu-panel {
        display: none;
        position: absolute;
        top: 0;
        background: white;
        border: 1px solid #aaa;
        min-width: 140px;
        z-index: 1000;
    }
    .submenu:hover .submenu-panel {
        display: block;
    }
    body[data-submenu-direction="right"] .submenu-panel {
        left: 100%;
    }
    body[data-submenu-direction="left"] .submenu-panel {
        right: 100%;
    }
</style>
