

// @ts-ignore wheelAdjust.js
export function wheelAdjust(node, { min = 1, step = 1, shiftStep = 10, oninput } = {}) {
    const handleWheel = (e) => {
        e.preventDefault();
        const delta = Math.sign(e.deltaY);
        const currentStep = e.shiftKey ? shiftStep : step;
        let value = parseFloat(node.value);
        // 値を更新（min以上に制限）
        value = Math.max(min, value - delta * currentStep);
        node.value = value;
        // 入力イベントを発火させて、Svelteの双方向バインドを更新する
        node.dispatchEvent(new Event('input'));

        // 最後に oninput があれば実行
        if (typeof oninput === "function") {
            oninput(e);
        }
    };

    node.addEventListener('wheel', handleWheel);
    return {
        destroy() {
            node.removeEventListener('wheel', handleWheel);
        }
    };
}



export async function saveFile(dirHandle, name, text, subdir = null) {
    if (!dirHandle) return false;

    try {
        // 保存先ディレクトリの取得
        const targetDirHandle = subdir
            ? await dirHandle.getDirectoryHandle(subdir, { create: true })
            : dirHandle;

        // 書き込むファイルのハンドル
        const fileHandle = await targetDirHandle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();

        // jsondata.name を name に置き換えたコピーを作成
        const nameWithoutExt = name;

        await writable.write(text);
        await writable.close();

        console.log(`保存完了: ${subdir ? `${subdir}/` : ""}${name}`);
        return true;
    } catch (err) {
        console.error("保存失敗:", err);
        return false;
    }
}



export async function getFileFromPath(dirHandle, path) {
    if (!dirHandle || !path) {
        return null;
    }
    const normalizedPath = String(path).replace(/\\/g, "/");
    const parts = normalizedPath.split("/").filter(Boolean); // 空文字を除く
    if (parts.length === 0) return null;
    let currentHandle = dirHandle;

    for (let i = 0; i < parts.length - 1; i++) {
        currentHandle = await currentHandle.getDirectoryHandle(parts[i]);
    }

    const fileHandle = await currentHandle.getFileHandle(parts.at(-1));
    return await fileHandle.getFile();
}


// 秒単位のfloat数値 を hh:mm:ss,xxx へ変換
export const convSecToStr = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    const milliseconds = Math.floor((remainingSeconds - Math.floor(remainingSeconds)) * 1000);

    const hh = hours.toString().padStart(2, '0');
    const mm = minutes.toString().padStart(2, '0');
    const ss = Math.floor(remainingSeconds).toString().padStart(2, '0');
    const ms = milliseconds.toString().padStart(3, '0');

    return `${hh}:${mm}:${ss},${ms}`;
}

// hh:mm:ss,xxx を 秒単位のfloat数値 へ変換
export const convStrToSec = (timeString) => {
    const timeParts = timeString.match(/(\d+):(\d+):(\d+),(\d+)/);

    if (!timeParts) {
        throw new Error('Invalid time format');
    }

    const hours = parseInt(timeParts[1], 10);
    const minutes = parseInt(timeParts[2], 10);
    const seconds = parseInt(timeParts[3], 10);
    const milliseconds = parseInt(timeParts[4], 10);

    const totalSeconds = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;

    return totalSeconds;
};

export const COLOR = {
    hexToRgba(hex) {
        hex = hex.replace(/^#/, '');
        if (hex.length === 6) hex += 'ff';
        const num = parseInt(hex, 16);
        return {
            r: (num >> 24) & 0xff,
            g: (num >> 16) & 0xff,
            b: (num >> 8) & 0xff,
            a: (num & 0xff) / 255
        };
    }, 
    hexToRgb(hex) {
        hex = hex.replace(/^#/, '');
        if (hex.length === 6) hex += 'ff';
        const num = parseInt(hex, 16);
        return {
            r: (num >> 24) & 0xff,
            g: (num >> 16) & 0xff,
            b: (num >> 8) & 0xff
        };
    }, 
    rgbaToHex({ r, g, b }, a) {
        const toHex = (v) => {
            const n = Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
            return n.toString(16).padStart(2, '0');
        };
        const alpha = Math.max(0, Math.min(1, Number.isFinite(a) ? a : 1));
        return (
            '#' +
            toHex(r) +
            toHex(g) +
            toHex(b) +
            toHex(Math.round(alpha * 255))
        );
    },
    // 任意の CSS 色文字列（#rgb / #rgba / #rrggbb / #rrggbbaa / カンマ区切り rgb() / rgba()）を
    // 正準形 #rrggbbaa へ変換する。カラーピッカーと保存データの色形式を一本化するための入口。
    // パースできない形式（名前付き色・hsl()・スペース区切り rgb() など）は元の文字列をそのまま返す。
    // ここで #000000ff へフォールバックすると、保存時に元の色情報を黒で潰して恒久的に破壊してしまうため。
    toHex8(color) {
        if (typeof color !== "string" || !color.trim()) return "#000000ff";
        const c = color.trim().toLowerCase();
        if (c[0] === "#") {
            let h = c.slice(1);
            if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("") + "ff";
            else if (h.length === 4) h = h.split("").map((ch) => ch + ch).join("");
            else if (h.length === 6) h += "ff";
            if (h.length !== 8 || /[^0-9a-f]/.test(h)) return color;
            return "#" + h;
        }
        const m = c.match(/^rgba?\(([^)]+)\)$/);
        if (m) {
            const p = m[1].split(",").map((s) => s.trim());
            const r = parseFloat(p[0]);
            const g = parseFloat(p[1]);
            const b = parseFloat(p[2]);
            if (p.length >= 3 && [r, g, b].every(Number.isFinite)) {
                const a = p[3] !== undefined ? parseFloat(p[3]) : 1;
                return this.rgbaToHex({ r, g, b }, Number.isFinite(a) ? a : 1);
            }
        }
        return color;
    },
    rgbToHsl({ r, g, b }) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        const d = max - min;

        let h = 0, s = 0;
        if (d !== 0) {
            s = d / (1 - Math.abs(2 * l - 1));
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
                case g: h = ((b - r) / d + 2); break;
                case b: h = ((r - g) / d + 4); break;
            }
            h *= 60;
        }

        return {
            h: Math.round(h),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }, 
    hslToRgb({ h, s, l }) {
        s /= 100; l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;

        let r = 0, g = 0, b = 0;
        if (h < 60) [r, g, b] = [c, x, 0];
        else if (h < 120) [r, g, b] = [x, c, 0];
        else if (h < 180) [r, g, b] = [0, c, x];
        else if (h < 240) [r, g, b] = [0, x, c];
        else if (h < 300) [r, g, b] = [x, 0, c];
        else[r, g, b] = [c, 0, x];

        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }, 
    rgbToHsv({ r, g, b }) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const d = max - min;

        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
            else if (max === g) h = ((b - r) / d + 2);
            else h = ((r - g) / d + 4);
            h *= 60;
        }

        const s = max === 0 ? 0 : d / max;
        const v = max;

        return {
            h: Math.round(h),
            s: Math.round(s * 100),
            v: Math.round(v * 100)
        };
    }, 
    hsvToRgb({ h, s, v }) {
        s /= 100; v /= 100;
        const c = v * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = v - c;

        let r = 0, g = 0, b = 0;
        if (h < 60) [r, g, b] = [c, x, 0];
        else if (h < 120) [r, g, b] = [x, c, 0];
        else if (h < 180) [r, g, b] = [0, c, x];
        else if (h < 240) [r, g, b] = [0, x, c];
        else if (h < 300) [r, g, b] = [x, 0, c];
        else[r, g, b] = [c, 0, x];

        return {
            r: Math.round((r + m) * 255),
            g: Math.round((g + m) * 255),
            b: Math.round((b + m) * 255)
        };
    }, 
    parseColorToRGBA(color) {
        if (color.startsWith("#")) {
            // hex → rgba
            const hex = color.replace(/^#/, "");
            const bigint = parseInt(hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex, 16);
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            return { r, g, b };
        } else if (color.startsWith("rgb")) {
            const result = color.match(/\d+/g);
            if (result && result.length >= 3) {
                return {
                    r: parseInt(result[0]),
                    g: parseInt(result[1]),
                    b: parseInt(result[2])
                };
            }
        }
        // fallback（無効な形式など）
        return { r: 0, g: 0, b: 0 };
    },
    mergeColorAndOpacity({ color, opacity }) {
        const rgb = this.parseColorToRGBA(color || "#000");
        return this.rgbaToHex(rgb, opacity ?? 1);
    }
}
