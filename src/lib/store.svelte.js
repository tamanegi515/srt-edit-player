import { getDefaultJsonData, getDefaultMedia } from "./data_process";

export const colorPalette = ["#da5740", "#4282b6", "#62cc62", "#e9d566", "#894dc2", "#d85d9f", "#47ccce"];

export const projectState = $state({
    dirHandle: undefined,
    folderName: "フォルダを選択してください。",
    jsonDataList: [getDefaultJsonData()],
    mediaIndex: 0,
});

export const mediaState = $state({
    media: getDefaultMedia(),
    imageScale: { w: 1, h: 1 },
    imageBaseScale: { w: 1, h: 1 },
    imagePos: { x: 0, y: 0 },
});

export const selectionState = $state({
    trackId: null,
    selectedTrackId: null,
    styleKey: null,
    editorTrackId: null,
    editorClipIndex: null,
});

export const uiState = $state({
    viewSrtFrame: false,
    jsonSaveStatus: 0,
    srtSaveStatus: 0,
    autoScroll: false,
    viewRibbon: true,
    viewTrack: true,
    timeLineAuto: true,
    timeLineRatio: 2,
    imageAuto: false,
});

export const editorLayoutState = $state({
    columns: [{ id: 1, width: 500, trackId: 0 }],
    nextColumnId: 2,
});

const activeJsonData = $derived(projectState.jsonDataList[projectState.mediaIndex]);

const styleList = $derived.by(() => {
    const data = projectState.jsonDataList[projectState.mediaIndex];
    if (!data?.styles || Object.keys(data.styles).length === 0) {
        return [{ name: "dummy", color: "#000000" }];
    }
    return Object.keys(data.styles).map((name, i) => ({
        name,
        color: colorPalette[i % colorPalette.length],
    }));
});

const editableTracks = $derived(mediaState.media.srt_data.filter((track) => !track.isImageTrack));

export function getActiveJsonData() { return activeJsonData; }
export function useStyleList() { return styleList; }
export function useEditableTracks() { return editableTracks; }

export function firstEditableTrackId() {
    return editableTracks[0]?.id ?? 0;
}

export function activeTrackId() {
    const existing = editableTracks.find((track) => track.id === selectionState.trackId);
    if (existing) return existing.id;
    return firstEditableTrackId();
}

export function activeStyleKey() {
    const data = activeJsonData;
    if (selectionState.styleKey && data?.styles?.[selectionState.styleKey]) return selectionState.styleKey;
    const track = data?.scriptFiles?.[activeTrackId()];
    if (track?.defaultStyle && data?.styles?.[track.defaultStyle]) return track.defaultStyle;
    return Object.keys(data?.styles ?? {})[0] ?? "dummy";
}

export function selectTrack(trackId) {
    const nextTrackId = Number.isInteger(trackId) ? trackId : firstEditableTrackId();
    selectionState.trackId = nextTrackId;
}

export function selectOverlayTrack(trackId, styleKey = null) {
    selectTrack(trackId);
    selectionState.selectedTrackId = selectionState.trackId;
    if (styleKey && activeJsonData?.styles?.[styleKey]) selectionState.styleKey = styleKey;
}

export function selectStyle(styleKey) {
    if (!styleKey || !activeJsonData?.styles?.[styleKey]) return;
    selectionState.styleKey = styleKey;
}

export function clearOverlaySelection() {
    selectionState.selectedTrackId = null;
}

export function createStyleKey(styleKey, baseStyleKey = null) {
    const nextKey = String(styleKey ?? "").trim();
    if (!/^[A-Za-z0-9_-]+$/.test(nextKey)) {
        return { ok: false, message: "style keyは半角英数字、_、- で入力してください。" };
    }
    if (activeJsonData?.styles?.[nextKey]) {
        return { ok: false, message: "同じstyle keyが既にあります。" };
    }
    const sourceKey = baseStyleKey && activeJsonData?.styles?.[baseStyleKey]
        ? baseStyleKey
        : Object.keys(activeJsonData?.styles ?? {})[0];
    const sourceStyle = activeJsonData?.styles?.[sourceKey];
    if (!sourceStyle) {
        return { ok: false, message: "複製元のstyleがありません。" };
    }
    activeJsonData.styles[nextKey] = JSON.parse(JSON.stringify(sourceStyle));
    selectionState.styleKey = nextKey;
    return { ok: true, message: "" };
}

export function selectEditorClip(trackId, clipIndex) {
    selectTrack(trackId);
    selectionState.editorTrackId = selectionState.trackId;
    selectionState.editorClipIndex = clipIndex;
}

export function resetInteractionState() {
    selectionState.trackId = firstEditableTrackId();
    selectionState.selectedTrackId = null;
    selectionState.styleKey = activeStyleKey();
    selectionState.editorTrackId = null;
    selectionState.editorClipIndex = null;
    editorLayoutState.columns = [{ id: 1, width: 500, trackId: firstEditableTrackId() }];
    editorLayoutState.nextColumnId = 2;
}

export function setProjectDataList(list) {
    projectState.mediaIndex = 0;
    projectState.jsonDataList = list?.length ? list : [getDefaultJsonData()];
}

export function setLoadedMedia(media) {
    mediaState.media = media;
    resetInteractionState();
}

export function addSubtitleTrack(scriptFile, track) {
    const data = activeJsonData;
    if (!data?.scriptFiles || !mediaState.media?.srt_data) return false;
    data.scriptFiles = [...data.scriptFiles, scriptFile];
    const imageTracks = mediaState.media.srt_data.filter((item) => item.isImageTrack);
    const editable = mediaState.media.srt_data.filter((item) => !item.isImageTrack);
    mediaState.media.srt_data = [...editable, track, ...imageTracks];
    selectTrack(track.id);
    selectionState.selectedTrackId = track.id;
    selectionState.editorTrackId = track.id;
    selectionState.editorClipIndex = 0;
    for (const column of editorLayoutState.columns) {
        column.trackId = track.id;
        break;
    }
    return true;
}

export function addEditorColumn() {
    editorLayoutState.columns = [
        ...editorLayoutState.columns,
        { id: editorLayoutState.nextColumnId, width: 150, trackId: firstEditableTrackId() },
    ];
    editorLayoutState.nextColumnId += 1;
}

export function removeEditorColumn() {
    if (editorLayoutState.columns.length <= 1) return;
    editorLayoutState.columns = editorLayoutState.columns.slice(0, -1);
}

export function setEditorColumnTrack(columnId, trackId) {
    const column = editorLayoutState.columns.find((item) => item.id === columnId);
    const nextTrackId = Number(trackId);
    if (column) column.trackId = nextTrackId;
    selectTrack(nextTrackId);
    selectionState.selectedTrackId = null;
    selectionState.editorTrackId = null;
    selectionState.editorClipIndex = null;
}

// DOM refs are intentionally separated from app state. They are imperative integration points only.
export const useRefs = $state({
    tableRef: null,
    imageRef: null,
    editorRefs: [],
    trackRef: null,
});

// Audio (HTMLMediaElement) は Proxy 化すべき Web API オブジェクトのため $state の外で管理
let _audio = /** @type {HTMLAudioElement|null} */ (null);
let _audioUrl = /** @type {string|null} */ (null);

function releaseAudioUrl() {
    if (_audioUrl) {
        URL.revokeObjectURL(_audioUrl);
        _audioUrl = null;
    }
}

export const useAudio = {
    /** @returns {HTMLAudioElement|null} */
    get audio() { return _audio; },
    /** @param {HTMLAudioElement|null} a @param {string|null} url */
    set(a, url = null) {
        if (_audio && _audio !== a) {
            _audio.pause();
            _audio.src = "";
        }
        releaseAudioUrl();
        _audio = a;
        _audioUrl = url;
    },
    stop() {
        if (_audio) {
            _audio.pause();
            _audio.src = "";
        }
        releaseAudioUrl();
        _audio = null;
        mediaState.media.isPlaying = false;
    },
    pause() {
        _audio?.pause();
        mediaState.media.isPlaying = false;
    },
    play() {
        if (!_audio) return;
        _audio.play().then(() => {
            mediaState.media.isPlaying = true;
        }).catch((err) => {
            console.warn("音声再生に失敗:", err);
            mediaState.media.isPlaying = false;
        });
    },
    seek(time = activeJsonData?.seekTime ?? 0) {
        if (activeJsonData) activeJsonData.seekTime = time;
        if (_audio) _audio.currentTime = time;
    },
    setVol(vol = mediaState.media.volume) {
        mediaState.media.volume = vol;
        if (_audio) _audio.volume = vol;
    },
    setRate(rate = mediaState.media.playbackRate) {
        mediaState.media.playbackRate = rate;
        if (_audio) _audio.playbackRate = rate;
    }
};

