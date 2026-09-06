// A source array is the runtime identity, shared by aliases but never by reused IDs.
const histories = new WeakMap();
const fields = ["text", "sentences", "startTime", "endTime", "startTimeStr", "endTimeStr", "layout", "additionalBlocks"];

function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
    }
    return value;
}

function historyFor(track) {
    let history = histories.get(track.data);
    if (!history) {
        history = { undo: [], redo: [] };
        histories.set(track.data, history);
    }
    return history;
}

// A source conversion forks commands as well as data; aliases keep their own history.
export function forkEditorHistory(sourceData, targetData, makeReactive = (value) => value) {
    const source = histories.get(sourceData);
    if (!source) return;
    const clips = new Map(sourceData.map((clip, index) => [clip, targetData[index]]));
    const mappedClip = (clip) => {
        if (!clips.has(clip)) {
            const { ref, ...values } = clip;
            clips.set(clip, makeReactive(cloneValue(values)));
        }
        return clips.get(clip);
    };
    const command = (entry) => ({
        clip: mappedClip(entry.clip),
        before: entry.before?.map(mappedClip) ?? null,
        after: entry.after?.map(mappedClip) ?? null,
        changes: entry.changes.map((change) => ({
            ...change, clip: mappedClip(change.clip),
            before: cloneValue(change.before), after: cloneValue(change.after),
        })),
    });
    histories.set(targetData, { undo: source.undo.map(command), redo: source.redo.map(command) });
}

function snapshot(clip) {
    return Object.fromEntries(fields.map((key) => [key, cloneValue(clip[key])]));
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
        else clip[key] = cloneValue(value);
    }
    // Keep the original clip objects so keyed views and earlier commands stay attached.
    if (command[side]) track.data.splice(0, track.data.length, ...command[side]);
    (redo ? history.undo : history.redo).push(command);
    return track.data.includes(command.clip) ? command.clip : track.data[0];
}
