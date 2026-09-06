import { getSrtItemText, setSrtItemText } from "./data_process";
import { createBlockLayout, getBlock, getClipBlocks, hasClipBlockExtensions, validateClipBlocks } from "./subtitle_blocks";

const clone = (value) => JSON.parse(JSON.stringify(value));
const editorText = (body) => body.sentences?.length
    ? body.sentences.join("\n\n") : getSrtItemText(body).replace(/\r\n/g, "\n\n");

export function splitSubtitleBlock(clip, blockId, before, after, trackLayout) {
    const body = getBlock(clip, blockId);
    if (!body) return null;
    const layout = createBlockLayout(trackLayout, body.layout);
    const next = { id: crypto.randomUUID(), layout: { ...layout, x: layout.x + 32, y: layout.y + 32 } };
    setSrtItemText(next, after);
    const additional = [...(clip.additionalBlocks ?? [])];
    const index = blockId === null ? 0 : additional.findIndex((item) => item.id === blockId) + 1;
    additional.splice(index, 0, next);
    validateClipBlocks({ ...clip, additionalBlocks: additional });
    if (!clip.layout) clip.layout = createBlockLayout(trackLayout);
    setSrtItemText(body, before);
    clip.additionalBlocks = additional;
    return next.id;
}

export function mergeSubtitleBlock(clip, blockId) {
    const blocks = getClipBlocks(clip);
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index <= 0) return null;
    const previous = blocks[index - 1];
    setSrtItemText(previous.body, `${editorText(previous.body)}\n\n${editorText(blocks[index].body)}`);
    clip.additionalBlocks.splice(index - 1, 1);
    if (!clip.additionalBlocks.length) delete clip.additionalBlocks;
    return previous.id;
}

// A temporal split partitions the ordered boxes, without duplicating their text.
export function partitionClipBlocks(clip, blockId, before, after, nextClip) {
    const blocks = getClipBlocks(clip);
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return;
    const body = blocks[index].body;
    setSrtItemText(body, before);
    setSrtItemText(nextClip, after);
    if (body.layout) nextClip.layout = clone(body.layout);
    const following = blocks.slice(index + 1).map((block) => clone(block.body));
    if (following.length) nextClip.additionalBlocks = following;
    const preceding = blocks.slice(1, index + 1).map((block) => block.body);
    if (preceding.length) clip.additionalBlocks = preceding;
    else delete clip.additionalBlocks;
}

export function appendClipBlocks(current, next, trackLayout) {
    if (!hasClipBlockExtensions(current) && !hasClipBlockExtensions(next)) {
        setSrtItemText(current, `${editorText(current)}\n\n${editorText(next)}`);
        return;
    }
    if (!current.layout) current.layout = createBlockLayout(trackLayout);
    const following = getClipBlocks(next).map(({ body }) => ({
        ...clone(body === next ? {
            text: next.text,
            ...(next.sentences ? { sentences: next.sentences } : {}),
        } : body),
        id: crypto.randomUUID(),
        layout: createBlockLayout(trackLayout, body.layout),
    }));
    current.additionalBlocks = [...(current.additionalBlocks ?? []), ...following];
}
