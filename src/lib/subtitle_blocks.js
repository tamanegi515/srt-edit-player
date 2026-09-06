const LAYOUT_FIELDS = [
    "x", "y", "maxWidth", "maxHeight", "boxAlignX", "boxAlignY",
    "textAlign", "textRotate", "defaultStyle",
];
const NUMERIC_LAYOUT_FIELDS = new Set(LAYOUT_FIELDS.slice(0, 6));
const TEXT_ALIGN_VALUES = new Set(["left", "center", "right"]);
const TEXT_ROTATE_VALUES = new Set(["horizontal-tb", "vertical-rl"]);
const BLOCK_FIELDS = new Set(["id", "text", "sentences", "layout"]);
const MAX_ADDITIONAL_BLOCKS = 256;
const MAX_BLOCK_SENTENCES = 10000;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function isRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function validateLayout(layout) {
    if (!isRecord(layout)) throw new TypeError("Invalid subtitle block layout");
    for (const [key, value] of Object.entries(layout)) {
        if (!LAYOUT_FIELDS.includes(key)) throw new TypeError("Unknown subtitle block layout field");
        if (NUMERIC_LAYOUT_FIELDS.has(key)) {
            if (!Number.isFinite(value)) throw new TypeError("Invalid subtitle block layout number");
            if ((key === "maxWidth" || key === "maxHeight") && value < 0) {
                throw new TypeError("Invalid subtitle block size");
            }
            if ((key === "boxAlignX" || key === "boxAlignY") && (value < 0 || value > 100)) {
                throw new TypeError("Invalid subtitle block alignment percentage");
            }
        } else if (typeof value !== "string") {
            throw new TypeError("Invalid subtitle block layout string");
        } else if (key === "textAlign" && !TEXT_ALIGN_VALUES.has(value)) {
            throw new TypeError("Invalid subtitle block text alignment");
        } else if (key === "textRotate" && !TEXT_ROTATE_VALUES.has(value)) {
            throw new TypeError("Invalid subtitle block writing mode");
        }
    }
}

/** Returns body references in display order; the primary box is always the clip itself. */
export function getClipBlocks(clip) {
    if (!clip) return [];
    return [{ id: null, body: clip }, ...(clip.additionalBlocks ?? []).map((body) => ({ id: body.id, body }))];
}

export function getBlock(clip, id = null) {
    if (id === null) return clip ?? undefined;
    return clip?.additionalBlocks?.find((body) => body.id === id);
}

/** Copies layout values only. Calling this helper never materializes a clip override. */
export function createBlockLayout(trackLayout, overrides = {}) {
    const layout = {};
    for (const source of [trackLayout, overrides]) {
        if (source == null) continue;
        for (const key of LAYOUT_FIELDS) {
            if (hasOwn(source, key)) layout[key] = source[key];
        }
    }
    validateLayout(layout);
    return layout;
}

export function hasClipBlockExtensions(clip) {
    return !!clip && (hasOwn(clip, "layout") || hasOwn(clip, "additionalBlocks"));
}

/** Validates only the additive extension, preserving existing primary text semantics. */
export function validateClipBlocks(clip) {
    if (!clip || typeof clip !== "object") throw new TypeError("Invalid subtitle clip");
    if (hasOwn(clip, "layout")) validateLayout(clip.layout);
    if (!hasOwn(clip, "additionalBlocks")) return;
    const blocks = clip.additionalBlocks;
    if (!Array.isArray(blocks) || blocks.length > MAX_ADDITIONAL_BLOCKS) {
        throw new TypeError("Invalid subtitle additional blocks");
    }
    const ids = new Set();
    for (const block of blocks) {
        if (!isRecord(block) || Object.keys(block).some((key) => !BLOCK_FIELDS.has(key))) {
            throw new TypeError("Invalid subtitle block fields");
        }
        if (typeof block.id !== "string" || !block.id.trim() || block.id.length > 256 || /[\u0000-\u001f\u007f]/.test(block.id) || ids.has(block.id)) {
            throw new TypeError("Invalid or duplicate subtitle block ID");
        }
        ids.add(block.id);
        if (hasOwn(block, "text") && typeof block.text !== "string") {
            throw new TypeError("Invalid subtitle block text");
        }
        if (hasOwn(block, "sentences")) {
            if (!Array.isArray(block.sentences) || block.sentences.length > MAX_BLOCK_SENTENCES) {
                throw new TypeError("Invalid subtitle block sentences");
            }
            for (const sentence of block.sentences) {
                if (typeof sentence !== "string") throw new TypeError("Invalid subtitle block sentence");
            }
        }
        if (hasOwn(block, "layout")) validateLayout(block.layout);
    }
}
