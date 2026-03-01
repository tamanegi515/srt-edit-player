import { getDefaultJsonData, getDefaultMedia, getVCJsonData, getVoiceJsonData } from "./data_process";

// フラグ・UI操作まわり
export const useState = $state({
    dirHandle: undefined,
    is_original_text: false,
    view_srt_frame: false,
    json_save_status: 0,
    srt_save_status: 0,
    autoScroll: false,
    viewRibbon: true,
    viewTrack: true,
    timeLineAuto: true,
    timeLineRatio: 2,   // タイムラインの拡大率
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


// Audio (HTMLMediaElement) は Proxy 化すべき Web API オブジェクトのため $state の外で管理
let _audio = /** @type {HTMLAudioElement|null} */ (null);

export const useAudio = {
    /** @returns {HTMLAudioElement|null} */
    get audio() { return _audio; },
    /** @param {HTMLAudioElement|null} a */
    set(a) { _audio = a; },
    stop() {
        if (_audio) {
            _audio.pause();
            _audio.src = '';
        }
        main_media.media.isPlaying = false;
    },
    pause() {
        _audio?.pause();
        main_media.media.isPlaying = false;
    },
    play() {
        _audio?.play();
        main_media.media.isPlaying = true;
    },
    seek(time = json_data.seekTime) {
        json_data.seekTime = time;
        if (_audio) _audio.currentTime = time;
    },
    setVol(vol = main_media.media.volume) {
        main_media.media.volume = vol;
        if (_audio) _audio.volume = vol;
    },
    setRate(rate = main_media.media.playbackRate) {
        main_media.media.playbackRate = rate;
        if (_audio) _audio.playbackRate = rate;
    }
};



