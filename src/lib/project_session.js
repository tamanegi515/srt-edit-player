// Session-only drafts and saved baselines. Never serialize DOM refs or media URLs.
const sessions = new Map();
const sources = new Map();

const sourceKey = (track) => String(track.file_path ?? "").replace(/\\/g, "/").toLowerCase();

export function projectSnapshot(project) {
    const { seekTime, ...settings } = project;
    return JSON.stringify({
        ...settings,
        scriptFiles: settings.scriptFiles?.map(({ inlineData, ...script }) => script),
    });
}

export function trackSnapshot(track) {
    return JSON.stringify(track.data.map(({ ref, ...clip }) => clip));
}

export function resetProjectSessions(projects) {
    sessions.clear();
    sources.clear();
    for (const project of projects) {
        sessions.set(project, { projectSaved: projectSnapshot(project), tracks: null });
    }
}

export function rememberMedia(project, media) {
    const session = sessions.get(project);
    if (session) session.tracks = media.srt_data;
}

export function restoreMediaDraft(project, media) {
    const session = sessions.get(project);
    if (session?.tracks) media.srt_data = session.tracks;
    for (const track of media.srt_data) {
        const source = sources.get(sourceKey(track));
        if (source) {
            track.data = source.data;
            track.loadStatus = source.loadStatus;
            track.loadError = source.loadError;
        }
    }
    return media;
}

export function registerLoadedMedia(project, media) {
    const session = sessions.get(project);
    if (!session) return;
    for (const track of media.srt_data) {
        const key = sourceKey(track);
        const source = sources.get(key);
        if (source) {
            track.data = source.data;
            track.loadStatus = source.loadStatus;
            track.loadError = source.loadError;
        } else sources.set(key, {
            data: track.data, loadStatus: track.loadStatus, loadError: track.loadError,
            saved: trackSnapshot(track),
        });
    }
    session.tracks = media.srt_data;
}

export function markProjectSaved(project, snapshot) {
    const session = sessions.get(project);
    if (session) session.projectSaved = snapshot;
}

export function markTrackSaved(project, track, snapshot) {
    if (!sessions.has(project)) return;
    const key = sourceKey(track);
    const source = sources.get(key);
    if (source) source.saved = snapshot;
    else sources.set(key, {
        data: track.data, loadStatus: track.loadStatus, loadError: track.loadError, saved: snapshot,
    });
}

export function hasUnsavedChanges(project, media) {
    if (project && media) rememberMedia(project, media);
    for (const [data, session] of sessions) {
        if (projectSnapshot(data) !== session.projectSaved) return true;
        if (session.tracks?.some((track) => sources.get(sourceKey(track))?.saved !== trackSnapshot(track))) return true;
    }
    return false;
}
