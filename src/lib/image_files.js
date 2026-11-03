export const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"];

export async function getImageFileFromPath(dirHandle, path) {
    if (!dirHandle || !path) return null;
    const parts = String(path).replace(/\\/g, "/").split("/").filter(Boolean);
    if (!parts.length) return null;
    let directory = dirHandle;
    for (const part of parts.slice(0, -1)) {
        directory = await directory.getDirectoryHandle(part);
    }

    const name = parts.at(-1);
    let exactHandle;
    try {
        exactHandle = await directory.getFileHandle(name);
    } catch (error) {
        if (error.name !== "NotFoundError") throw error;
    }
    // A read failure on an existing file must not silently select another image.
    if (exactHandle) return await exactHandle.getFile();

    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    const stem = (IMAGE_EXTENSIONS.includes(extension) ? name.slice(0, -extension.length) : name).toLowerCase();
    const matches = [];
    for await (const entry of directory.values()) {
        if (entry.kind !== "file") continue;
        const dot = entry.name.lastIndexOf(".");
        if (dot < 0 || !IMAGE_EXTENSIONS.includes(entry.name.slice(dot).toLowerCase())) continue;
        if (entry.name.slice(0, dot).toLowerCase() === stem) {
            matches.push({ handle: entry, priority: IMAGE_EXTENSIONS.indexOf(entry.name.slice(dot).toLowerCase()) });
        }
    }
    if (!matches.length) throw new DOMException("Image file not found", "NotFoundError");
    matches.sort((a, b) => a.priority - b.priority || a.handle.name.localeCompare(b.handle.name, "ja"));
    return await matches[0].handle.getFile();
}
