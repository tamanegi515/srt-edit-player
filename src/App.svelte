<script>
  import StyleRibbon from "./components/Style_Ribbon.svelte";
  import MediaPlayer from "./components/Media_Player.svelte";
  import SrtEditor from "./components/Srt_Editor.svelte";
  import { onMount } from "svelte";
  import { devicePixelRatio, innerHeight, innerWidth, online, outerHeight, outerWidth, screenLeft, screenTop, scrollX, scrollY } from "svelte/reactivity/window";
  import { main_media, useState, useStyleList, useRefs } from "./lib/store.svelte";
  import { getDefaultMedia, getJsonDataList, getMedia, saveJsonFile, saveSrtFile } from "./lib/data_process";
  import Track from "./components/Track.svelte";
  import TrackView from "./components/Track_View.svelte";

  let dragging = $state(false);
  let startX = $state(0);
  let startWidth = $state();
  let json_data = $derived(main_media.json_data_list[main_media.media_index]);

  // @ts-ignore
  $effect(async () => {
    main_media.media = await getMedia(json_data, useState.dirHandle);
  });

  // UI部品まわりの変数
  let currentColumnIndex = $state(-1);
  let columnWidths = $state([500]);

  const totalWidth = $derived.by(() => {
    return columnWidths.reduce((sum, w) => sum + w, 0);
  });

  const tableHeight = $derived.by(() => {
    if (useRefs.tableRef) {
      const rect = useRefs.tableRef.getBoundingClientRect();
      const bottomSpace = innerHeight.current - rect.top;
      if (useRefs.trackRef){
        const trackRect = useRefs.trackRef.getBoundingClientRect();
        return bottomSpace - (10 + trackRect.height);
      }
      return bottomSpace - 10;
    }
  });

  // メインモデルの監視用
  // $effect(() => {
  //   console.log("json_data_list:", $state.snapshot(json_data_list));
  //   console.log("media_index:", $state.snapshot(media_index));
  //   console.log("media:", $state.snapshot(media));
  //   console.log("style_list:", $state.snapshot(style_list));
  // });

  function stopAudio() {
    if (main_media.media.audio instanceof Audio && !main_media.media.audio.paused) {
      main_media.media.audio.pause();
      main_media.media.audio.src = ""; // 再利用を防ぐ（GC対象にする）
    }
  }

  // フォルダを読み込み、json_dataを作成
  async function handleLoad() {
    stopAudio();
    // @ts-ignore
    useState.dirHandle = await window.showDirectoryPicker();

    // 書き込み権限をリクエスト
    const permission = await useState.dirHandle.requestPermission({ mode: "readwrite" });

    if (permission !== "granted") {
      console.warn("書き込み権限が許可されませんでした。");
      return;
    }

    main_media.selected_Folder = useState.dirHandle.name;
    try {
      const result = await getJsonDataList(useState.dirHandle);
      main_media.json_data_list = result;
      console.log("フォルダ読み込み完了：", result);
    } catch (err) {
      console.warn("読み込みエラー:", err);
      main_media.selected_Folder = "";
    }
  }

  async function save_VC_JSON_File() {
    if (useState.dirHandle) {
      const nameWithoutExt = main_media.media.name.replace(/\.[^/.]+$/, "");
      const name = `${nameWithoutExt}.vc_json`;

      const success = await saveJsonFile(useState.dirHandle, name, json_data);
      useState.json_save_status = success ? 1 : -1;

      // 1秒後にアイコンを通常に戻す
      setTimeout(() => {
        useState.json_save_status = 0;
      }, 2000);
    }
  }

  async function save_SRT_Files() {
    let success = false;
    if (useState.dirHandle) {
      console.log(main_media.media);
      for (const srtfile of main_media.media.srt_data) {
        console.log(srtfile.data);
        success = await saveSrtFile(useState.dirHandle, srtfile.name, srtfile.data, "srt");
        if (!success) break;
      }
      useState.srt_save_status = success ? 1 : -1;

      // 1秒後にアイコンを通常に戻す
      setTimeout(() => {
        useState.srt_save_status = 0;
      }, 2000);
    }
  }

  function scrollEditor() {
    for (const ref of useRefs.editorRefs) {
      console.log(ref);
      if (ref) {
        ref.scrollToIndex(json_data.seekTime);
      }
    }
  }

  // ドラッグ開始
  const startDrag = (event, index) => {
    dragging = true;
    startX = event.clientX;
    currentColumnIndex = index;
    startWidth = columnWidths[index];
    const newWidths = [...columnWidths];

    const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0);

    // ドラッグ中の処理
    const onMouseMove = (moveEvent) => {
      if (dragging) {
        const diff = moveEvent.clientX - startX;

        if (currentColumnIndex == -1) {
          const scale = (totalWidth - diff) / totalWidth; // 拡大なら scale > 1、縮小なら < 1
          const newTotal = totalWidth + diff;
          columnWidths = newWidths.map((w) => Math.max(50, w * scale));
        } else {
          // 元の幅を複製してから調整

          const current = currentColumnIndex;
          const prev = current - 1;

          const newWidth = Math.max(50, startWidth - diff);
          // 現在列に delta を加える
          newWidths[current] = newWidth;
          if (prev >= 0) {
            const delta = newWidth - columnWidths[current];

            // 前の列から delta を引く
            newWidths[prev] = Math.max(50, columnWidths[prev] - delta);
          }
          columnWidths = newWidths;
        }
      }
    };

    // ドラッグ終了時の処理
    const stopDrag = () => {
      dragging = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopDrag);
    };

    // イベントリスナーを追加
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopDrag);
  };

  onMount(() => {
    if (!useState.hasUnloadHandler) {
      window.addEventListener("beforeunload", () => {
        for (const url of useState.blobUrls) {
          URL.revokeObjectURL(url);
        }
        useState.blobUrls.length = 0;
      });
      useState.hasUnloadHandler = true;
    }
  });
</script>

<main>
  <div class="folder-path">{main_media.selected_Folder}</div>
  <button class="nmorph_button" onclick={handleLoad}>
    <span class="material-symbols-outlined"> folder_open </span>
  </button>
  <button
    class="nmorph_button"
    onclick={() => {
      if (main_media.media_index > 0) {
        main_media.media_index -= 1;
        stopAudio();
      }
    }}
  >
    ◀
  </button>

  <!-- <div class="folder-path">{media.name}</div> -->
  <select class="folder-path" bind:value={main_media.media_index}>
    {#each main_media.json_data_list as jsondata, index}
      <option value={index}>{jsondata.name}</option>
    {/each}
  </select>

  <button class="nmorph_button" title="vc_jsonを保存" onclick={save_VC_JSON_File}>
    {#if useState.json_save_status == 0}
      <span class="material-symbols-outlined"> save_as </span>
    {:else if useState.json_save_status > 0}
      <span class="material-symbols-outlined"> check </span>
    {:else}
      <span class="material-symbols-outlined"> error </span>
    {/if}
  </button>
  <button class="nmorph_button" onclick={() => {
    if (main_media.media_index < main_media.json_data_list.length - 1) {
      main_media.media_index += 1;
      stopAudio();
    }
  }}>
    ▶
  </button>
  <span class="head-text">View Frame：</span>
  <div class="design-radio-container">
    <div class="design-radio-tile-group">
      <div class="design-radio-input-container">
        <input class="radio-button" checked={useState.view_srt_frame === true} onchange={() => (useState.view_srt_frame = true)} type="radio" name="view_srt_frame" id="view_srt_frame1" />
        <label class="radio-tile" for="view_srt_frame1">
          <span class="material-symbols-outlined icon"> select_all </span>
        </label>
      </div>
      <div class="design-radio-input-container">
        <input class="radio-button" checked={useState.view_srt_frame === false} onchange={() => (useState.view_srt_frame = false)} type="radio" name="view_srt_frame" id="view_srt_frame2" />
        <label class="radio-tile" for="view_srt_frame2">
          <span class="material-symbols-outlined icon"> deselect </span>
        </label>
      </div>
    </div>
  </div>

  <div class="CheckButtonArea">
    <input type="checkbox" bind:checked={useState.autoScroll} id="BoldButton" />
    <label for="BoldButton"><span>Auto Scroll</span></label>
  </div>

  <span class="head-text">View Ribbon：</span>
  <label class="toggle_switch" style="margin-right: 5px;">
    <input type="checkbox" bind:checked={useState.viewRibbon} style="visibility: hidden;" />
    <span class="toggle-slider"></span>
  </label>
  {#if useState.viewRibbon}
    <StyleRibbon></StyleRibbon>
  {/if}
  {#if main_media.json_data_list.length > main_media.media_index && json_data?.styles}
    <table style="width: 100%; height: {tableHeight}px;" bind:this={useRefs.tableRef} cellspacing="0" cellpadding="0">
      <tbody>
        <tr>
          <!-- 🎬 左側：メディアプレイヤー -->
          <td>
            {#if main_media.media}
              <MediaPlayer />
            {/if}
          </td>

          <!-- 🟦 リサイズバー -->
          <td style="width: 5px;">
            <div class="resizer" role="button" tabindex="-1" style="cursor: ew-resize; height: 100%;" onmousedown={(event) => startDrag(event, -1)}></div>
          </td>

          <!-- 📝 右側：編集エリア（ネストテーブル）-->
          <td style="width:{totalWidth}px; vertical-align: top;">
            <table class="srt_area" style="width: 100%; height: 100%;" cellspacing="0" cellpadding="0">
              <tbody>
                <!-- 上部操作エリア -->
                <tr>
                  <td colspan={columnWidths.length} style="height: 30px;">
                    <button class="nmorph_button" style="margin-left:15px;" onclick={() => (columnWidths = columnWidths.slice(0, -1))}>◀</button>
                    <span>{columnWidths.length}</span>
                    <button class="nmorph_button" onclick={() => (columnWidths = [...columnWidths, 150])}>▶</button>
                    <label style="margin-left: 10px;">
                      <input class="dark" type="checkbox" bind:checked={useState.is_original_text} style="transform: scale(1.3); margin-right: 5px;" />
                      raw
                    </label>
                    <button class="nmorph_button" onclick={scrollEditor} title="再生位置にスクロール"> Scroll </button>
                    <button class="nmorph_button" onclick={save_SRT_Files} title="字幕を保存">
                      {#if useState.srt_save_status == 0}
                        <span class="material-symbols-outlined"> save_as </span>
                      {:else if useState.srt_save_status > 0}
                        <span class="material-symbols-outlined"> check </span>
                      {:else}
                        <span class="material-symbols-outlined"> error </span>
                      {/if}
                    </button>
                  </td>
                </tr>

                <!-- 各列（字幕編集欄） -->
                <tr>
                  {#each columnWidths as column, index}
                    <td style="width: {column}px; position: relative; height: 100%;">
                      <div style="display: flex; height: 100%;">
                        <div class="resize-bar" role="button" tabindex="-1" onmousedown={(event) => startDrag(event, index)}></div>
                        <div style="flex-grow: 1; height: 100%;">
                          <SrtEditor bind:this={useRefs.editorRefs[index]} parents_height={tableHeight} bind:is_original_text={useState.is_original_text} style="height: 100%;" />
                        </div>
                      </div>
                    </td>
                  {/each}
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>

    {#if useState.viewTrack}
      <TrackView></TrackView>
    {/if}
  {/if}
</main>

<style>
  main {
    padding: 10px;
  }
  .folder-path {
    margin: 5px;
    display: inline-block;
    padding: 1px 10px;
    min-width: 300px;
    max-width: 600px;
    height: 25px;
    vertical-align: middle;
    align-content: center;
    font-size: 15px;
    border-radius: 5px;
    color: #000000;
    background: #a7a7a7c5;
    box-shadow:
      inset 4px 5px 10px #0000008e,
      inset -4px -4px 15px #ffffff28;

    overflow-x: auto;
    white-space: nowrap;
    cursor: text; /* ← テキストっぽい見た目に */

    /* スクロールバー非表示 */
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */

    user-select: text;
  }
  .folder-path::-webkit-scrollbar {
    display: none; /* Chrome/Safari */
  }

  .resizer {
    align-self: center;
    position: relative;
    cursor: ew-resize;
    background-color: rgba(231, 0, 0, 0); /* 背景透明感を調整 */
    width: 11px;
    height: 95%;
    margin: 0;
    padding: 0;
    flex-shrink: 0;
    /* display: inline-block; */
  }

  .resize-bar {
    align-self: center;
    position: relative;
    cursor: col-resize;
    background-color: rgba(0, 0, 0, 0); /* 背景透明感を調整 */
    width: 14px;
    height: 95%;
    margin: 0;
    padding: 0;
    flex-shrink: 0;
    align-content: center;
    /* display: inline-block; */
  }
  /* 中心線を描画 */
  .resize-bar::before,
  .resize-bar::after {
    content: "";
    position: absolute;
    width: 1px;
    height: 30px;
    border-radius: 4px;
    left: 4px;
    background-color: #505050fd;
    pointer-events: none; /* クリックを通す */
    box-shadow: -1px -1px 1px #b8b8b82c;
  }
  .resize-bar::after {
    transform: translateX(4px);
  }

  .material-symbols-outlined {
    font-size: 18px;
    vertical-align: middle;
    font-variation-settings:
      "FILL" 1,
      "wght" 400,
      "GRAD" 0,
      "opsz" 48;
  }
  .srt_area {
    box-sizing: border-box;
    padding: 10px 15px 0px 3px;
    background-color: #0e0e0e52;
    /* border: 1px solid #ff0a0a; */

    box-shadow:
      inset 5px 10px 15px rgba(5, 5, 5, 0.712),
      inset -5px -5px 8px #dbdbdb21;
    border-radius: 8px;
  }
  table {
    overflow: hidden;
  }

  /* === ボタンを表示するエリア ============================== */
  .CheckButtonArea {
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
    transition: 0.1s; /* ゆっくり変化       */

    color: #8d8d8d;
    margin: 5px 0px;
    padding: 0px 10px;
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
</style>
