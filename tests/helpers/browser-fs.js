export async function installFolder(page, files) {
  await page.addInitScript((initialFiles) => {
    const files = { ...initialFiles };
    window.__files = files;
    window.__writes = {};
    window.__pickerMode = "open";
    function directory(prefix = "") {
      return {
        kind: "directory", name: "review-fixture",
        async requestPermission() { return window.__pickerMode === "denied" ? "denied" : "granted"; },
        async *values() {
          for (const path of Object.keys(files)) {
            if (path.startsWith(prefix) && !path.slice(prefix.length).includes("/")) {
              yield await this.getFileHandle(path.slice(prefix.length));
            }
          }
        },
        async getDirectoryHandle(name) { return directory(`${prefix}${name}/`); },
        async getFileHandle(name, options = {}) {
          const path = prefix + name;
          if (!(path in files) && !options.create) throw new DOMException("Missing", "NotFoundError");
          return {
            kind: "file", name,
            async getFile() { return new File([files[path] ?? ""], name); },
            async createWritable() {
              let contents;
              return {
                async write(value) { contents = String(value); },
                async close() { files[path] = contents; window.__writes[path] = contents; },
              };
            },
          };
        },
      };
    }
    window.showDirectoryPicker = async () => {
      if (window.__pickerMode === "cancel") throw new DOMException("Cancelled", "AbortError");
      if (window.__pickerMode === "invalid") return {
        name: "bad-folder", async requestPermission() { return "granted"; },
        async *values() { throw new Error("Read failed"); },
      };
      return directory();
    };
  }, files);
}

export function project(name, path) {
  return JSON.stringify({ name, scriptFiles: [{ filePath: path, name: path }] });
}

export function subtitles(text) {
  return JSON.stringify([{ start: "00:00:00,000", end: "00:00:02,000", sentences: [text] }]);
}
