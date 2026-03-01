import { saveFile, getFileFromPath, convSecToStr, convStrToSec, COLOR } from "./util";


/*
*　　-- media処理関連 --
*　　vc_jsonファイル単位のメディアデータ（audio、img、srtなど）関連の処理
*/
export function getDefaultMedia(){
    return {
        name: "メディアなし",
        image_data: { currentId: 0, currentImage: null, currentImagePath: null, size: { x: 0, y: 0 } },
        srt_data: [],
        isAudio: true,
        isPlaying: false,
        duration: 0,
        playbackRate: 1,
        volume: 0.5,
      }
}

export async function getMedia(data,dirHandle) {
    console.log("メディア読み込み開始")
    if (!dirHandle || !data || data.name === "dummy") {
      return getDefaultMedia();
    }
    const audiofile = await getFileFromPath(dirHandle, data.audioFilePath);
    const audiourl = URL.createObjectURL(audiofile);
    const audio = new Audio(audiourl);
    await new Promise((resolve) => (audio.onloadedmetadata = resolve));
    audio.currentTime = data.seekTime;

    const srtDatafiles = [];
    for (const [i, srt] of data.srtFiles.entries()) {
      const srtfile = await getFileFromPath(dirHandle, srt.filePath);
      const text = await srtfile.text();
      const srt_data = parseSrt(text);
      srtDatafiles.push({
        id: i,
        name: srtfile.name,
        file_path: srt.filePath,
        height: 40,
        default_class: srt.default_class,
        currentText: srt_data[0].text,
        currentTextId: 0,
        data: srt_data,
      });
    }

    const imgSrtFile = await getFileFromPath(dirHandle, data.imageSrtPath);
    const imgSrtText = await imgSrtFile.text();
    const imgSrtparts = parseSrt(imgSrtText);
    // 画像track を srt_data の末尾に追加（字幕トラックと同じ構造）
    srtDatafiles.push({
        id: srtDatafiles.length,
        name: imgSrtFile.name,
        file_path: data.imageSrtPath,
        height: 40,
        isImageTrack: true,
        currentText: imgSrtparts[0]?.text ?? '',
        currentTextId: 0,
        data: imgSrtparts,
    });
    const imageFile = await getFileFromPath(dirHandle, imgSrtparts[0]?.text?.replace(/\\/g, "/"));
    const imageURL = URL.createObjectURL(imageFile);

    return {
      name: data.name,
      audio,
      image_data: {
        currentId: 0,
        currentImage: imageURL,
        currentImagePath: imgSrtparts[0]?.text,
        size: { x: 0, y: 0 },
      },
      srt_data: srtDatafiles,
      isAudio: true,
      isPlaying: false,
      duration: audio.duration,
      playbackRate: 1,   // 呼び出し元で現在値に上書きされる
      volume: 0.5,       // 同上
    };
  }


/*
*　　-- media処理関連 --
*　　vc_jsonファイル単位のメディアデータ（audio、img、srtなど）関連の処理
*/
export function getDefaultJsonData() {
    return {
        name: "dummy",
        seekTime: 0,
        audioFilePath: '',
        imageSrtPath: '',
        srtFiles: [
            {
                filePath: '',
                defaultStyle: 'dummy',
                x: 100,
                y: 100,
                maxWidth: 500,
                maxHeight: 500,
                boxAlignX: 0,
                boxAlignY: 0,
                textRotate: "horizontal-tb",
                textAlign: "left"
            }
        ],
        styles: {
            dummy: {
                font: "りいポップ角",
                fontSize: 30,
                textColor: "rgba(0, 0, 0,1)",
                letterSpace: 0,
                lineSpace: 10,
                fontStyle: "italic",
                fontWeight: "bold",
                isItalic: false,
                outline1: {
                    enable: true,
                    size: 7,
                    color: "rgba(177, 34, 34, 0.95)"
                },
                outline2: {
                    enable: true,
                    offsetX: 0,
                    offsetY: 0,
                    size: 5,
                    color: "rgba(32, 32, 32, 0.8)"
                },
                shadow: {
                    enable: true,
                    steps: 8,
                    offsetX: 0,
                    offsetY: 0,
                    size: 10,
                    color: "rgba(170, 0, 119, 0.1)",
                    blur: 16
                }
            }
        }
    };
}
export function getVCJsonData(text) {
    const raw = JSON.parse(text);
    const def = getDefaultJsonData();

    const result = {
        ...def,
        ...raw,
        srtFiles: (raw.srtFiles || []).map((srt, i) => ({
            ...def.srtFiles[0],
            ...srt
        })),
        styles: Object.fromEntries(
            Object.entries(raw.styles || {}).map(([key, style]) => {
                return [key, {
                    ...def.styles.dummy,
                    ...style,
                    outline1: { ...def.styles.dummy.outline1, ...style.outline1 },
                    outline2: { ...def.styles.dummy.outline2, ...style.outline2 },
                    shadow:   { ...def.styles.dummy.shadow,   ...style.shadow   }
                }];
            })
        )
    };

    return result;
}



export function getVoiceJsonData(filename, text) {
    const raw = JSON.parse(text);
    const result = getDefaultJsonData();

    result.name = filename;
    result.seekTime = raw.seekTime || 0;
    result.audioFilePath = raw.audioFile || '';
    result.imageSrtPath = raw.imageSRT || '';
    result.srtFiles = [];
    // @ts-ignore
    result.styles = {};

    // 各SRTファイルを処理
    raw.srtFiles?.forEach((srt, index) => {
        const styleKey = `default-style-${index + 1}`;

        // スタイル部分を切り出し
        const {
            max_width, max_height, isVertical,
            textAlignSelect, verticalAlignSelect,
            font, fontSize, textColor,
            letter_space, line_space,
            isBold, isItalic,
            outline1, outline2, shadow,
            ...layoutProps
        } = srt;

        const fixColorObject = (obj) => {
            const { color, opacity, ...rest } = obj;
            return {
                ...rest,
                color: COLOR.mergeColorAndOpacity({ color, opacity:1-opacity })
            };
        };
        
        const outline1Fixed = fixColorObject(outline1);
        const outline2Fixed = fixColorObject({ ...outline2 });
        const shadowFixed = fixColorObject({
            ...shadow,
            steps: 1,
            offsetX: 0,
            offsetY: 0
        });

        const align = textAlignSelect == 1 ? "left" : textAlignSelect == 2 ? "center" : "right";
        // srtFilesに1つ追加（配列形式）
        result.srtFiles.push({
            ...layoutProps,
            maxWidth: max_width,
            maxHeight: max_height,
            defaultStyle: styleKey,
            textAlign: align,
            textRotate: isVertical ? "vertical-rl" : "horizontal-tb",

        });

        const fontStyle = isItalic ? "italic" : "normal";
        const fontWeight = isBold ? "bold" : "normal";

        // stylesにスタイル登録
        result.styles[styleKey] = {
            font, fontSize, textColor,
            letterSpace: letter_space,
            lineSpace: line_space,
            fontWeight, fontStyle,
            outline1:outline1Fixed, 
            outline2:outline2Fixed, 
            shadow:shadowFixed
        };
    });

    return result;
}




export async function saveJsonFile(dirHandle, name = "sample.vc_json", jsondata, subdir = null) {
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
        const dataToSave = {
            ...jsondata,
            name: nameWithoutExt,
        };

        await writable.write(JSON.stringify(dataToSave, null, 2));
        await writable.close();

        console.log(`保存完了: ${subdir ? `${subdir}/` : ""}${name}`);
        return true;
    } catch (err) {
        console.error("保存失敗:", err);
        return false;
    }
}



export async function getJsonDataList(dirHandle) {
    const result = [];

    let files = [];

    // vc_jsonファイルを読み込み
    for await (const entry of dirHandle.values()) {
        if (entry.kind === "file" && entry.name.endsWith(".vc_json")) {
            files.push(entry); // ← entry を集める
        }
    }
    // 名前順にソート（昇順）
    files.sort((a, b) => a.name.localeCompare(b.name));

    // ソート済みファイルを順に処理
    for (const entry of files) {
        const file = await entry.getFile();
        const text = await file.text();
        const data = getVCJsonData(text);
        result.push(data);
    }
    // console.log(files);
    files = [];
    // voice_jsonファイルを読み込み
    for await (const entry of dirHandle.values()) {
        if (entry.kind === "file" && entry.name.endsWith(".voice_json")) {
            files.push(entry); // ← entry を集める
        }
    }

    // 名前順にソート（昇順）
    files.sort((a, b) => a.name.localeCompare(b.name));

    // ソート済みファイルを順に処理
    for (const entry of files) {
        const file = await entry.getFile();
        const text = await file.text();
        const data = getVoiceJsonData(file.name, text);
        result.push(data);
    }
    return result;

}


/*
*　　-- srtdata処理関連 --
*　　字幕ファイル・字幕データ関連の処理
*/
export function getDefaultSrtFiles() {
    return {
        name: "default",
        file_path: '',
        default_class: 'default1',
        height: 50,
        currentText: '',
        currentTextId: 0,
        data: [
            {
                id: 1,
                startTimeStr: "00:00:00,000",
                endTimeStr: "00:00:18,330",
                startTime: 0,
                endTime: 18.33,
                text: ''
            }
        ]
    };
}



// SRTファイルをパースしてデータ配列に変換する関数
export function parseSrt(srt_text) {
    if (srt_text === null) return [];

    // 改行コードを標準の '\n' に統一
    let Parse = srt_text.replace(/\r\n|\r|\n/g, '\n');

    //srtファイルの構造の記述
    //  "通し番号"
    //  "時間 --> 時間" 
    //  "文章 + 改行2回(もしくは末尾)"
    let Pattern = /(\d+)\n([\d:,]+)\s-{2}\>\s([\d:,]+)(?:\n{2}|$|(\n[\s\S]*?)(?=\n{2}|$))/g;

    const textList = Parse.match(Pattern);
    if (!textList) return [];
    const srtList = [];
    for (const text of textList) {
        srtList.push(parseSrtBlock(text))
    }
    return srtList ? normalizeSrtItems(srtList) : [];
};


// SRTファイルのブロックをデータに変換する関数
export function parseSrtBlock(part) {

    // 各部分を行ごとに分割
    const lines = part.split('\n');

    // 通し番号, 開始時間, 終了時間を抽出
    const id = parseInt(lines[0]);
    const [start, end] = lines[1].split(' --> ');

    // 字幕本文を抽出
    const text = lines.slice(2).join('\n');

    const entry = {
        startTimeStr: start,
        endTimeStr: end,
        startTime: convStrToSec(start),
        endTime: convStrToSec(end),
        text: text,
        ref: {}
    };
    return entry;
}





export async function saveSrtFile(dirHandle, name, data, subdir = null) {
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

        await writable.write(combineToSRT(data));
        await writable.close();

        console.log(`保存完了: ${subdir ? `${subdir}/` : ""}${name}`);
        return true;
    } catch (err) {
        console.error("保存失敗:", err);
        return false;
    }
}


export function combineToSRT(data) {
    console.log(data);
    let srtText = "";
    let id = 1;
    for (const srtPart of data) {
        srtText += id + '\r\n';
        srtText += srtPart.startTimeStr + ' --> ' + srtPart.endTimeStr;
        if (srtPart.text) {
            srtText += '\r\n' + srtPart.text.replace(/\r\n\r\n/g, '\r\n　\r\n').replace(/\n\n/g, '\r\n　\r\n');
            if (srtPart.text !== "\r\n") srtText += '\r\n\r\n';
        } else {
            srtText += '\r\n\u3000\r\n\r\n';
        }
        id++;
    }
    return srtText;
}


export function getCurrentText(data, time) {
    for (let i = 0; i < data.length; i++) {
        const entry = data[i];
        if (time >= entry.startTime && time <= entry.endTime) {
            return { text: entry.text, index: i };
        }
    }
    return { text: "", index: -1 }; // 一致なし
}




export const calculate_shadow = ({ enable, steps, offsetX, offsetY, size, color, blur }) => {
    const shadowSize = size;
    const shadowBlur = blur;
    const shadowColor = color;
    let shadow_num = steps;

    let textShadow = ' ';
    if (steps == 1) {
        textShadow = `drop-shadow(${offsetX}px ${offsetY}px ${shadowBlur}px ${shadowColor})`
    } else {
        const outerShadows = createShadowDirections(steps).map(
            ([dx, dy]) =>
                `drop-shadow(${offsetX + dx * shadowSize}px ${offsetY + dy * shadowSize}px ${shadowBlur}px ${shadowColor})`
        );
        textShadow = [...outerShadows].join(' ');
    }

    return textShadow;
}

const createShadowDirections = (steps, offset = 0) => {
    steps = Math.ceil(steps);
    const angleStep = (2 * Math.PI) / steps;
    return Array.from({ length: steps }, (_, i) => {
        const angle = i * angleStep + offset;
        return [Math.round(Math.cos(angle)), Math.round(Math.sin(angle))];
    });
};



export function convertToStyledSpans(defaultStyleName, text) {
    const result = [];
    const tagPattern = /<(\w+)>([\s\S]*?)<\/>/g;
    let lastIndex = 0;

    for (const match of text.matchAll(tagPattern)) {
        const [fullMatch, styleName, content] = match;
        const start = match.index;

        // タグの前の通常テキスト
        if (start > lastIndex) {
            const normal = text.slice(lastIndex, start);
            result.push({ style: defaultStyleName, text: normal });
        }

        // タグ部分
        result.push({ style: styleName, text: content });

        lastIndex = start + fullMatch.length;
    }

    // 残り
    if (lastIndex < text.length) {
        result.push({ style: defaultStyleName, text: text.slice(lastIndex) });
    }

    return result;
}





function normalizeSrtItems(srtItems) {
    const sorted = [...srtItems].sort((a, b) => a.startTime - b.startTime);
    const normalized = [];

    for (let i = 0; i < sorted.length; i++) {
        const curr = { ...sorted[i] };
        const prev = normalized[normalized.length - 1];

        if (!prev) {
            if (curr.startTime > 0) {
                normalized.push({
                    startTime: 0,
                    endTime: curr.startTime,
                    startTimeStr: "00:00:00,000",
                    endTimeStr: convSecToStr(curr.startTime),
                    text: "　",
                    ref: {}
                });
            }
        } else {
            // 被り解消
            if (curr.startTime < prev.endTime) {
                prev.endTime = curr.startTime;
                prev.endTimeStr = convSecToStr(prev.endTime);
            }

            // 空白時間 → text: "" を挿入
            if (curr.startTime > prev.endTime) {
                normalized.push({
                    startTime: prev.endTime,
                    endTime: curr.startTime,
                    startTimeStr: convSecToStr(prev.endTime),
                    endTimeStr: convSecToStr(curr.startTime),
                    text: "　",
                    ref: {}
                });
            }
        }

        // 時間逆転防止（安全対策）
        if (curr.endTime < curr.startTime) {
            curr.endTime = curr.startTime;
        }

        // str更新
        curr.startTimeStr = convSecToStr(curr.startTime);
        curr.endTimeStr = convSecToStr(curr.endTime);

        // "　" 連続 → 結合処理
        if (
            prev &&
            isOnlyFullWidthSpace(prev.text) &&
            isOnlyFullWidthSpace(curr.text)
        ) {
            // prevのendを伸ばす
            prev.endTime = curr.endTime;
            prev.endTimeStr = convSecToStr(curr.endTime);
        } else {
            normalized.push(curr);
        }
    }

    return normalized;
}

function isOnlyFullWidthSpace(text) {
    return typeof text === "string" && text.trim() === "" && /　/.test(text);
}