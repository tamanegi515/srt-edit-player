import { getDefaultJsonData, getDefaultMedia, getVCJsonData, getVoiceJsonData } from "./data_process";

// フラグ・UI操作まわり
export const useState = $state({
    dirHandle: undefined,
    is_original_text: false,
    view_srt_frame: false,
    json_save_status: 0,
    srt_save_status: 0,
    hasUnloadHandler: false,
    autoScroll: false,
    blobUrls: [],
    viewRibbon: true,
    viewTrack: true,
    timeLineAuto: true
});




export const colorPalette = ["#da5740", "#4282b6", "#62cc62", "#e9d566", "#894dc2", "#d85d9f", "#47ccce"];


// メインモデル系
export const main_media = $state({
    json_data_list: [getDefaultJsonData()],
    media: getDefaultMedia(),

    // メインモデルに関わる変数
    selected_Folder: "フォルダを選択してください。",
    media_index: 0,
    currentStyle: 0,
    currentSrt: 0,
    activeSrt: 0,
    imageScale: { w: 1, h: 1 },
    imageBaseScale: { w: 1, h: 1 },
    imagePos: { x: 0, y: 0 }
});




const _style_list = $derived.by(() => {
    const data = main_media.json_data_list[main_media.media_index];
    if (!data || !data.styles || Object.keys(data.styles).length === 0) {
        console.log("styleデータ読み込み失敗：", data);
        return [{ name: "dummy", color: "#000000" }];
    }
    console.log("styleデータ読み込み成功：", data);
    return Object.keys(data.styles).map((name, i) => ({
        name,
        color: colorPalette[i % colorPalette.length],
    }));
});
export function useStyleList() { return _style_list; }
// export const $style_list = _style_list;




// DOM
export const useRefs = $state({
    tableRef: null,
    imageRef: null,
    editorRefs: [],
    trackRef: null
});


let json_data = $derived(main_media.json_data_list[main_media.media_index]);


export const useAudio = {
    pause() {
        main_media.media.audio.pause();
        main_media.media.isPlaying = false;
    },
    play() {
        main_media.media.audio.play();
        main_media.media.isPlaying = true;
    },
    seek(time = json_data.seekTime) {

        json_data.seekTime = time;
        main_media.media.audio.currentTime = time;
    },
    setVol(vol = main_media.media.volume) {
        main_media.media.volume = vol;
        main_media.media.audio.volume = vol;
    },
    setRate(rate = main_media.media.playbackRate) {
        main_media.media.playbackRate = rate;
        main_media.media.audio.playbackRate = rate;
    }
};

// export const style_list = $derived.by(() => {
//     const data = main_media.json_data_list[main_media.media_index];
//     if (!data || !data.styles || Object.keys(data.styles).length === 0) {
//         return [{ name: "dummy", color: "#000000" }];
//     }
//     return Object.keys(data.styles).map((name, i) => ({
//         name,
//         color: colorPalette[i % colorPalette.length],
//     }));
// });

//   let tableRef = $state();
//   let editorRefs = $state([]);
// フラグ・UI操作まわり
// export const is_original_text = $state(false);
// export const view_srt_frame = $state(false);
// export const json_save_status = $state(0);
// export const hasUnloadHandler = false;
// export const dirHandle = $state();

// // メモリ管理用
// export const blobUrls = $state([]);

// // メインモデルに関わる変数
// export const selected_Folder = $state("フォルダを選択してください。");
// export const currentStyle = $state(0);
// export const currentSrt = $state(0);
// export const media_index = $state(0);

// // メインモデル
// export const json_data_list = $state([getDefaultJsonData()]);
// export const media = $state(getDefaultMedia());

