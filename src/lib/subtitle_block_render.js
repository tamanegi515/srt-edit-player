import { getClipBlocks } from "./subtitle_blocks.js";

export function formatClipBlocks(clip, defaultTag, styles) {
    let activeTag = null;
    // Tags span sentences and boxes, but sentence spacing starts over in each box.
    return (clip ? getClipBlocks(clip) : [{ id: null, body: null }]).map(({ id, body }) => {
        const blockDefaultTag = body?.layout?.defaultStyle ?? defaultTag;
        const lines = Array.isArray(body?.sentences) && body.sentences.length
            ? body.sentences
            : String(body?.text ?? "").split("\r\n")
                .filter((line, index, all) => line !== "" || index !== 0 && index !== all.length - 1);
        const sentences = lines.map((line, index) => {
            const text = String(line ?? "");
            const parts = [];
            const tokenPattern = /<\/>|<([\w-]+)>/g;
            let cursor = 0;
            let match;
            while ((match = tokenPattern.exec(text))) {
                if (match.index > cursor) parts.push({ tag: activeTag ?? blockDefaultTag, text: voiceMarks(text.slice(cursor, match.index)) });
                activeTag = match[0] === "</>" || !styles?.[match[1]] ? null : match[1];
                cursor = match.index + match[0].length;
            }
            if (cursor < text.length) parts.push({ tag: activeTag ?? blockDefaultTag, text: voiceMarks(text.slice(cursor)) });
            return { gap: index > 0, parts };
        });
        return { id, body, sentences };
    });
}

function voiceMarks(text) {
    return text.replace(/([\u3041-\u3096\u30a1-\u30fa])([\u309b\u309c])/g, (_, char, mark) =>
        `${char}${mark === "\u309b" ? "\u3099" : "\u309a"}`);
}
