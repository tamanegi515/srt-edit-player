// A source array is the runtime identity, shared by aliases but never by reused IDs.
const histories = new WeakMap();
const fields = ["text", "sentences", "startTime", "endTime", "startTimeStr", "endTimeStr"];

function historyFor(track) {
    let history = histories.get(track.data);
    if (!history) {
        history = { undo: [], redo: [] };
        histories.set(track.data, history);
    }
    return history;
}

function snapshot(clip) {
    return Object.fromEntries(fields.map((key) => [key, Array.isArray(clip[key]) ? [...clip[key]] : clip[key]]));
}

export function beginEditorEdit(track, clips, structural = false) {
    const before = clips.map((clip) => ({ clip, values: snapshot(clip) }));
    const previousList = structural ? [...track.data] : null;
    let committed = false;
    return () => {
        if (committed) return;
        committed = true;
        const changes = before.flatMap(({ clip, values }) => {
            const after = snapshot(clip);
            return fields.filter((key) => JSON.stringify(values[key]) !== JSON.stringify(after[key]))
                .map((key) => ({ clip, key, before: values[key], after: after[key] }));
        });
        const nextList = structural ? [...track.data] : null;
        const listChanged = structural && (previousList.length !== nextList.length || previousList.some((clip, i) => clip !== nextList[i]));
        if (!changes.length && !listChanged) return;
        const history = historyFor(track);
        history.undo.push({ changes, before: previousList, after: nextList, clip: clips[0] });
        if (history.undo.length > 200) history.undo.shift();
        history.redo.length = 0;
    };
}

export function editClips(track, clips, edit, structural = false) {
    const commit = beginEditorEdit(track, clips, structural);
    edit();
    commit();
}

export function replayEditorEdit(track, redo = false) {
    const history = historyFor(track);
    const source = redo ? history.redo : history.undo;
    const command = source.pop();
    if (!command) return null;
    const side = redo ? "after" : "before";
    for (const { clip, key, ...values } of command.changes) {
        const value = values[side];
        if (value === undefined) delete clip[key];
        else clip[key] = Array.isArray(value) ? [...value] : value;
    }
    // Keep the original clip objects so keyed views and earlier commands stay attached.
    if (command[side]) track.data.splice(0, track.data.length, ...command[side]);
    (redo ? history.undo : history.redo).push(command);
    return track.data.includes(command.clip) ? command.clip : track.data[0];
}
