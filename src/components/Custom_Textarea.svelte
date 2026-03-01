<script>
    import { onMount } from "svelte";
    import { main_media, useState, useStyleList, useRefs } from "../lib/store.svelte";
    import { convSecToStr } from "../lib/util";
    const styleList = useStyleList();

    let { srt_id = $bindable(), data_id = $bindable(), ...props } = $props();

    const TAG_LIST = $derived.by(() => styleList.map((s) => s.name));

    let editorRef = $state();
    let undoStack = $state([]);
    let redoStack = $state([]);
    let data_list = $derived(main_media.media.srt_data[srt_id].data);
    let data = $derived(main_media.media.srt_data[srt_id].data[data_id]);
    let json_data = $derived(main_media.json_data_list[main_media.media_index]);
    let iscurrent = $derived.by(() => {
        if (data_list[data_id].startTime < json_data.seekTime && json_data.seekTime < data_list[data_id].endTime) {
            return true;
        }
        return false;
    });

    // 外部から呼ばれる用の関数
    export function scrollToIndex() {
        editorRef?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function pushUndo() {
        undoStack = [...undoStack, editorRef.innerHTML];
        redoStack = []; // 新しい操作が入ったら redo は無効になる
    }
    function onKeyDown(e) {
        if (e.ctrlKey && e.key === "z") {
            e.preventDefault();
            if (undoStack.length > 0) {
                const current = editorRef.innerHTML;
                const prev = undoStack.pop();
                redoStack = [...redoStack, current];
                editorRef.innerHTML = prev;
                updateTextFromHTML();
            }
        }

        if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
            e.preventDefault();
            if (redoStack.length > 0) {
                const current = editorRef.innerHTML;
                const next = redoStack.pop();
                undoStack = [...undoStack, current];
                editorRef.innerHTML = next;
                updateTextFromHTML();
            }
        }
    }

    let contextMenu = $state({
        show: false,
        x: 0,
        y: 0,
        range: null,
        tag: null,
        target: null,
    });

    const TAG_STYLES = {
        monologue: "color: purple;",
        angry: "color: red; font-weight: bold;",
    };

    function wrapWithTag(tag) {
        if (!contextMenu.range) return;

        pushUndo(); // ← undo記録
        const span = document.createElement("span");
        span.setAttribute("data-tag", tag);
        span.setAttribute("style", TAG_STYLES[tag] ?? "");

        // 選択範囲の DOM を抽出
        const contents = contextMenu.range.extractContents(); // 改行含むノード構造をそのまま取得

        span.appendChild(contents); // 中身を <span> にそのまま入れる

        contextMenu.range.insertNode(span);
        updateTextFromHTML();
        hideMenu();
    }

    // function removeTagFromElement(el) {
    //     const parent = el.parentNode;
    //     const textNode = document.createTextNode(el.textContent);
    //     parent.replaceChild(textNode, el);
    //     updateTextFromHTML();
    //     hideMenu();
    // }

    function removeTagFromElement(el) {
        pushUndo(); // ← undo記録
        const parent = el.parentNode;
        const fragment = document.createDocumentFragment();

        // 中のHTML（<br>なども含む）を一時的にdivで受けて再構築
        const temp = document.createElement("div");
        temp.innerHTML = el.innerHTML;
        Array.from(temp.childNodes).forEach((node) => fragment.appendChild(node));

        parent.replaceChild(fragment, el);
        updateTextFromHTML();
        hideMenu();
    }

    function onContextMenu(e) {
        e.preventDefault();
        const selection = window.getSelection();
        const target = e.target;

        // ======== 位置補正ロジック（メインメニュー） ========
        let posX = e.clientX;
        let posY = e.clientY;
        const margin = 8;

        // 仮のメニューサイズ
        const MENU_WIDTH = 200;
        const MENU_HEIGHT = 260;

        // ウィンドウ内に収まるように補正
        if (posX + MENU_WIDTH > window.innerWidth - margin) {
            posX = window.innerWidth - MENU_WIDTH - margin;
        }
        if (posY + MENU_HEIGHT > window.innerHeight - margin) {
            posY = window.innerHeight - MENU_HEIGHT - margin;
        }

        // ======== メニュー生成 ========
        if (target.dataset.tag) {
            contextMenu = {
                show: true,
                x: posX,
                y: posY,
                range: null,
                tag: target.dataset.tag,
                target,
            };
        } else if (!selection.isCollapsed) {
            contextMenu = {
                show: true,
                x: posX,
                y: posY,
                range: selection.getRangeAt(0),
                tag: null,
                target: null,
            };
        } else {
            contextMenu = {
                show: true,
                x: posX,
                y: posY,
                range: selection?.rangeCount ? selection.getRangeAt(0) : null,
                tag: null,
                target: null,
            };
        }

        // ======== サブメニュー反転制御用クラスを付ける ========
        // メインメニューが右端寄りに表示される場合 → サブメニューを左側に出す
        const willOverflowRight = posX > window.innerWidth - MENU_WIDTH * 1.5;
        document.body.dataset.submenuDirection = willOverflowRight ? "left" : "right";
    }

    function hideMenu() {
        contextMenu = {
            show: false,
            x: 0,
            y: 0,
            range: null,
            tag: null,
            target: null,
        };
    }

    let isComposing = false;
    function updateTextFromHTML() {
        console.log(editorRef.innerHTML);
        isComposing = true;
        data.text = extractTextFromHTML(editorRef.innerHTML);
        isComposing = false;
    }

    $effect(() => {
        if (editorRef && !isComposing && formatForDisplay(data.text) !== editorRef.innerHTML) {
            editorRef.innerHTML = formatForDisplay(data.text);
        }
    });
    // テキストからHTML装飾へ（表示用）
    function formatForDisplay(raw) {
        return raw
            .replace(/</g, "&lt;") // < をエスケープ（HTMLタグにならないように）
            .replace(/>/g, "&gt;") // > をエスケープ
            .replace(/\n/g, "<br>") // 改行を <br> に変換（HTMLで改行されるように）
            .replace(
                /&lt;([\w-]+)&gt;([\s\S]*?)&lt;\/&gt;/g, // タグ構造をキャプチャ（例：<monologue>…</>）
                (_, tag, content) => `<span data-tag="${tag}" style="color: #11a8a0;">${content}</span>`, // HTMLタグに変換して表示だけ赤くする
            );
    }

    // HTMLからタグ付きテキストへ（保存用）
    function extractTextFromHTML(html) {
        return html
            .replace(/<span data-tag="([\w-]+)"[^>]*>([\s\S]*?)<\/span>/g, "<$1>$2</>") // <span data-tag="xxx">…</span> → <xxx>…</>
            .replace(/<br>/g, "\n") // <br> → 改行
            .replace(/&nbsp;/g, " ") // ノンブレークスペース → 空白
            .replace(/&lt;/g, "<") // エスケープ解除
            .replace(/&gt;/g, ">");
    }

    function insertLineBreakAtCursor() {
        pushUndo(); // ← undo記録
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);
        const br = document.createElement("br");
        range.insertNode(br);

        // ↓ カーソルを <br> の後ろに移動
        range.setStartAfter(br);
        range.setEndAfter(br);
        sel.removeAllRanges();
        sel.addRange(range);
        inputTimeout = setTimeout(() => {
            updateTextFromHTML();
        }, 100); // タイピング後少しして記録
    }
    let inputTimeout;
    function onInput() {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(() => {
            pushUndo();
            updateTextFromHTML();
        }, 100); // タイピング後少しして記録
    }

    function execCommandSafe(cmd) {
        document.execCommand(cmd);
        updateTextFromHTML();
    }

    function deleteSelection() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        updateTextFromHTML();
    }

    function searchOnWeb(text) {
        const sel = window.getSelection();
        console.log(text);
        if (text) {
            const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
            window.open(url, "_blank");
        }
    }

    onMount(() => {
        function handleClickOutside(e) {
            if (!e.target.closest(".menu")) {
                hideMenu();
            }
        }

        document.body.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.body.removeEventListener("mousedown", handleClickOutside);
        };
    });
    function fragmentToHTML(fragment) {
        const div = document.createElement("div");
        div.appendChild(fragment.cloneNode(true)); // fragmentは一度しか使えないのでclone
        return div.innerHTML;
    }
    function getSplitText() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;

        const range = sel.getRangeAt(0);

        // エディタ外の選択は無視
        if (!editorRef.contains(range.commonAncestorContainer)) {
            console.warn("カーソルがエディタ外にあります");
            return { beforeTxt: "", afterTxt: "" };
        }
        const beforeRange = range.cloneRange();
        const afterRange = range.cloneRange();

        // 前半：エディタの先頭〜カーソル直前まで
        beforeRange.setStart(editorRef, 0);
        const beforeFragment = beforeRange.cloneContents();

        // 後半：カーソル位置〜エディタの最後まで
        afterRange.setEndAfter(editorRef.lastChild);
        const afterFragment = afterRange.cloneContents();

        function fragmentToHTML(fragment) {
            const div = document.createElement("div");
            div.appendChild(fragment);
            return div.innerHTML;
        }

        const beforeHtml = fragmentToHTML(beforeFragment);
        const afterHtml = fragmentToHTML(afterFragment);

        const beforeTxt = extractTextFromHTML(beforeHtml);
        const afterTxt = extractTextFromHTML(afterHtml);
        return { beforeTxt, afterTxt };
    }
    function splitData() {
        const split = getSplitText();
        let splitTime = (data_list[data_id].endTime + data_list[data_id].startTime) / 2;
        if (iscurrent) {
            splitTime = json_data.seekTime;
        }
        let splitTimeStr = convSecToStr(splitTime);

        const newdata = {
            startTimeStr: splitTimeStr,
            endTimeStr: data_list[data_id].endTimeStr,
            startTime: splitTime,
            endTime: data_list[data_id].endTime,
            text: split.afterTxt.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ""),
        };
        console.log(data_list[data_id]);
        data_list[data_id].text = split.beforeTxt.replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
        data_list[data_id].endTimeStr = splitTimeStr;
        data_list[data_id].endTime = splitTime;

        data_list.splice(data_id + 1, 0, newdata);

        // console.log("before:", beforeTxt);
        // console.log("after:", afterTxt);
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
            text: `${current.text}\n　\n${next.text}`,
        };
        // 元の2つを削除して、新しい1つを挿入
        data_list.splice(data_id, 2, newData);
    }
</script>

<div
    role="textbox"
    tabindex="0"
    class="editor {iscurrent ? 'current' : ''}"
    contenteditable
    bind:this={editorRef}
    oncontextmenu={onContextMenu}
    oninput={onInput}
    onkeydown={(e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            insertLineBreakAtCursor();
        } else {
            onKeyDown(e);
        }
    }}
></div>

{#if contextMenu.show}
    <div class="menu" style="top: {contextMenu.y}px; left: {contextMenu.x}px;">
        {#if contextMenu.range != "" && !contextMenu.tag}
            <div class="menu-item submenu">
                タグを付ける ▶
                <div class="submenu-panel">
                    {#each TAG_LIST as tag}
                        <div
                            role="button"
                            tabindex="0"
                            class="menu-item"
                            onclick={() => wrapWithTag(tag)}
                            onkeydown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    wrapWithTag(tag);
                                }
                            }}
                        >
                            {tag}
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        {#if contextMenu.range == null || contextMenu.range == ""}
            <div
                role="button"
                tabindex="0"
                class="menu-item"
                onclick={() => splitData()}
                onkeydown={(e) => {
                    splitData();
                }}
            >
                カーソル位置で分割
            </div>
        {/if}

        {#if contextMenu.tag}
            <div
                role="button"
                tabindex="0"
                class="menu-item"
                onclick={() => removeTagFromElement(contextMenu.target)}
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        removeTagFromElement(contextMenu.target);
                    }
                }}
            >
                タグを外す
            </div>
        {/if}

        <div
            role="button"
            tabindex="0"
            class="menu-item"
            onclick={unionData}
            onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    unionData();
                }
            }}
        >
            下と結合する
        </div>
        <div
            role="button"
            tabindex="0"
            class="menu-item"
            onclick={() =>
                onKeyDown({
                    ctrlKey: true,
                    key: "z",
                    preventDefault: () => {},
                })}
            onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onKeyDown({
                        ctrlKey: true,
                        key: "z",
                        preventDefault: () => {},
                    });
                }
            }}
        >
            元に戻す（Ctrl+Z）
        </div>

        <div
            role="button"
            tabindex="0"
            class="menu-item"
            onclick={() =>
                onKeyDown({
                    ctrlKey: true,
                    key: "y",
                    preventDefault: () => {},
                })}
            onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onKeyDown({
                        ctrlKey: true,
                        key: "y",
                        preventDefault: () => {},
                    });
                }
            }}
        >
            やり直し（Ctrl+Y）
        </div>
        {#if contextMenu.range != ""}
            <div
                role="button"
                tabindex="0"
                class="menu-item"
                onclick={() => searchOnWeb(contextMenu.range)}
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        searchOnWeb(contextMenu.range);
                    }
                }}
            >
                Webで"{contextMenu.range}"を検索する
            </div>
            <div
                role="button"
                tabindex="0"
                class="menu-item"
                onclick={() => execCommandSafe("cut")}
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        execCommandSafe("cut");
                    }
                }}
            >
                切り取り（Ctrl+X）
            </div>

            <div
                role="button"
                tabindex="0"
                class="menu-item"
                onclick={() => execCommandSafe("copy")}
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        execCommandSafe("copy");
                    }
                }}
            >
                コピー（Ctrl+C）
            </div>

            <div
                role="button"
                tabindex="0"
                class="menu-item"
                onclick={() => execCommandSafe("paste")}
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        execCommandSafe("paste");
                    }
                }}
            >
                貼り付け（Ctrl+V）
            </div>

            <div
                role="button"
                tabindex="0"
                class="menu-item"
                onclick={deleteSelection}
                onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        deleteSelection;
                    }
                }}
            >
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
    }
    .current {
        outline: 2px solid #00bd9db0;
    }

    /* --- メニュー全体 --- */
    .menu {
        position: fixed;
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
    }
    .menu-item:hover {
        background-color: #eef;
    }

    /* --- サブメニュー本体 --- */
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

    /* ホバーで展開 */
    .submenu:hover .submenu-panel {
        display: block;
    }

    /* --- 右側に出す（デフォルト） --- */
    body[data-submenu-direction="right"] .submenu-panel {
        left: 100%;
    }

    /* --- 左側に出す（右端でクリックしたとき） --- */
    body[data-submenu-direction="left"] .submenu-panel {
        right: 100%;
    }
</style>
