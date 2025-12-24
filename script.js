// --- DOM Elements ---
const fileInput = document.getElementById("file-input");
const uploadScreen = document.getElementById("upload-screen");
const previewScreen = document.getElementById("preview-screen");
const fileListContainer = document.getElementById("file-list");
const fileCount = document.getElementById("file-count");
const clearAllBtn = document.getElementById("clear-all");
const controlsPanel = document.getElementById("controls-panel");
const settingsTitle = document.getElementById("settings-title");

const navConverter = document.getElementById("nav-converter");
const navResizer = document.getElementById("nav-resizer");
const mobNavConverter = document.getElementById("mob-nav-converter");
const mobNavResizer = document.getElementById("mob-nav-resizer");

const navEditor = document.getElementById("nav-editor");
const mobNavEditor = document.getElementById("mob-nav-editor");
const editorTools = document.getElementById("editor-tools");
const cropSelect = document.getElementById("crop-select");

const converterTools = document.getElementById("converter-tools");
const resizerTools = document.getElementById("resizer-tools");

const widthInput = document.getElementById("width-input");
const heightInput = document.getElementById("height-input");
const scaleInput = document.getElementById("scale-input");
const scaleValue = document.getElementById("scale-value");

const formatSelect = document.getElementById("format-select");
const qualityWrapper = document.getElementById("quality-wrapper");
const qualityInput = document.getElementById("quality-input");
const qualityVal = document.getElementById("quality-val");

const processBtn = document.getElementById("process-btn");
const processBtnText = document.getElementById("process-btn-text");

const themeToggle = document.getElementById("theme-toggle");
const html = document.documentElement;

// --- Additional Elements ---
const addMoreBtn = document.getElementById("add-more-btn");

// --- State ---
let currentMode = "converter"; // 'converter' | 'resizer'
let fileQueue = []; // Array of { file, id, status, blob, bitmap }
let isProcessing = false;
let batchTimer = null;

// Editor State
let editorState = {
  rotation: 0, // 0, 90, 180, 270
  flipH: false,
  flipV: false,
  crop: "none", // 'none', 'square', '4:5', '16:9', '9:16'
};

// --- Init ---
if (
  localStorage.theme === "dark" ||
  (!("theme" in localStorage) &&
    window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  html.classList.add("dark");
} else html.classList.remove("dark");

themeToggle.addEventListener("click", () => {
  html.classList.toggle("dark");
  localStorage.theme = html.classList.contains("dark") ? "dark" : "light";
});

// Define function FIRST (hoisted)
// Define function FIRST (hoisted)
function setMode(mode) {
  currentMode = mode;

  // Update Nav
  const activeClass = "text-brand shadow-sm bg-white dark:bg-dark-surface";
  const inactiveClass =
    "text-secondary dark:text-dark-secondary hover:text-primary dark:hover:text-white";

  const updateNavBtn = (btn, isActive) => {
    btn.className = isActive
      ? `px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeClass}`
      : `px-4 py-1.5 text-sm font-medium rounded-md transition-all ${inactiveClass}`;
  };

  const updateMobNav = (btn, isActive) => {
    btn.className = isActive
      ? "flex-1 py-2 text-sm font-medium border-b-2 border-brand text-brand"
      : "flex-1 py-2 text-sm font-medium border-b-2 border-transparent text-secondary";
  };

  updateNavBtn(navConverter, mode === "converter");
  updateNavBtn(navResizer, mode === "resizer");
  updateNavBtn(navEditor, mode === "editor");

  updateMobNav(mobNavConverter, mode === "converter");
  updateMobNav(mobNavResizer, mode === "resizer");
  updateMobNav(mobNavEditor, mode === "editor");

  converterTools.classList.remove("hidden"); // Format/Quality always visible (shared)
  resizerTools.classList.add("hidden");
  editorTools.classList.add("hidden");

  if (mode === "converter") {
    settingsTitle.textContent = "Conversion de format";
    processBtnText.textContent = "Convertir tout";
  } else if (mode === "resizer") {
    settingsTitle.textContent = "Redimensionnement";
    resizerTools.classList.remove("hidden");
    processBtnText.textContent = "Redimensionner tout";
  } else {
    settingsTitle.textContent = "Édition";
    editorTools.classList.remove("hidden");
    processBtnText.textContent = "Appliquer tout";
  }

  // Trigger update on mode switch to reflect changes
  triggerBatchUpdate();
}

// Now call it
setMode("converter"); // Default

// --- Event Listeners ---
window.switchMode = function (mode) {
  setMode(mode);
};

// Editor Actions
window.rotate = function (deg) {
  editorState.rotation = (editorState.rotation + deg) % 360;
  while (editorState.rotation < 0) editorState.rotation += 360;
  triggerBatchUpdate();
};

window.flip = function (axis) {
  if (axis === "h") editorState.flipH = !editorState.flipH;
  if (axis === "v") editorState.flipV = !editorState.flipV;
  triggerBatchUpdate();
};

cropSelect.addEventListener("change", () => {
  editorState.crop = cropSelect.value;
  triggerBatchUpdate();
});

// Upload
["dragover", "dragleave", "drop"].forEach((evt) => {
  uploadScreen.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadScreen.classList.toggle("border-brand", evt === "dragover");
  });
});
uploadScreen.addEventListener("drop", (e) => handleFiles(e.dataTransfer.files));
fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

addMoreBtn.addEventListener("click", () => fileInput.click());

clearAllBtn.addEventListener("click", () => {
  fileQueue = [];
  editorState = { rotation: 0, flipH: false, flipV: false, crop: "none" };
  cropSelect.value = "none";
  renderList();
  resetUI();
});

scaleInput.addEventListener("input", (e) => {
  scaleValue.textContent = `${e.target.value}%`;
  widthInput.value = "";
  heightInput.value = "";
  triggerBatchUpdate();
});

// Quality
qualityInput.addEventListener("input", (e) => {
  qualityVal.textContent = `${e.target.value}%`;
  triggerBatchUpdate();
});

formatSelect.addEventListener("change", () => {
  const newFormat = formatSelect.value;

  // Update global UI
  const showQuality = ["image/jpeg", "image/webp", "image/avif"].includes(
    newFormat
  );
  qualityWrapper.classList.toggle("opacity-30", !showQuality);
  qualityWrapper.classList.toggle("pointer-events-none", !showQuality);

  // Update ALL items in queue to this new global default
  fileQueue.forEach((item) => {
    item.format = newFormat;
    item.status = "pending";
  });

  triggerBatchUpdate();
});

[widthInput, heightInput].forEach((input) => {
  input.addEventListener("input", () => {
    if (input.value) scaleValue.textContent = "Custom";
    triggerBatchUpdate();
  });
});

processBtn.addEventListener("click", () => processQueue(false));

// --- Core Logic ---

function triggerBatchUpdate() {
  if (fileQueue.length === 0) return;

  if (batchTimer) clearTimeout(batchTimer);

  batchTimer = setTimeout(() => {
    processQueue(true);
  }, 600);
}

async function handleFiles(files) {
  if (!files || files.length === 0) return;

  const globalFormat = formatSelect.value;

  for (const file of files) {
    // Relaxed check to allow HEIC (which might have empty type or different type)
    const isHeic = file.name.toLowerCase().endsWith(".heic") ||
      file.name.toLowerCase().endsWith(".heif") ||
      file.type === "image/heic" ||
      file.type === "image/heif";

    if (!file.type.startsWith("image/") && !isHeic) continue;

    const id = Math.random().toString(36).substr(2, 9);
    const item = {
      id,
      file,
      bitmap: null,
      status: "pending",
      blob: null,
      format: globalFormat,
    };

    try {
      let sourceBlob = file;

      if (isHeic) {
        // Normalize HEIC to JPEG blob immediately so browsers can read it
        console.log("Converting HEIC...", file.name);
        const converted = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.9
        });
        sourceBlob = Array.isArray(converted) ? converted[0] : converted;
      }

      item.sourceBlob = sourceBlob; // Store for preview
      item.bitmap = await createImageBitmap(sourceBlob);
      fileQueue.push(item);
    } catch (e) {
      console.error("Skipped bad file or HEIC conversion failed", file.name, e);
    }
  }

  fileInput.value = "";

  if (fileQueue.length > 0) {
    uploadScreen.classList.add("hidden");
    previewScreen.classList.remove("hidden");
    controlsPanel.setAttribute("data-active", "true");
    renderList();
    processBtn.disabled = false;

    triggerBatchUpdate();
  }
}

function getPrettyFormat(mime, filename) {
  if (filename && (filename.toLowerCase().endsWith(".heic") || filename.toLowerCase().endsWith(".heif"))) {
    return "HEIC";
  }
  if (!mime) return "???";
  const sub = mime.split("/")[1].toUpperCase();
  if (sub === "JPEG") return "JPG";
  return sub;
}

function renderList() {
  fileCount.textContent = fileQueue.length;
  fileListContainer.innerHTML = "";

  fileQueue.forEach((item) => {
    const row = document.createElement("div");
    row.className =
      "bg-white dark:bg-dark-surface border border-border dark:border-dark-border rounded-xl overflow-hidden shadow-sm mb-4";

    // Use converted sourceBlob for preview if available (fixes HEIC preview)
    const originalUrl = URL.createObjectURL(item.sourceBlob || item.file);

    const isDone = item.status === "done";
    const isProcessingItem = item.status === "processing";

    let outputUrl = item.blob ? URL.createObjectURL(item.blob) : originalUrl;
    let outputSize = item.blob ? formatBytes(item.blob.size) : "---";
    let outputDimsStr = item.blob
      ? `${item.blobDims.w}x${item.blobDims.h}`
      : "---";

    let badge = "";
    if (item.blob) {
      const diff = item.file.size - item.blob.size;
      const pct = Math.round((diff / item.file.size) * 100);
      if (pct > 0)
        badge = `<span class="text-xs font-bold text-green-600 bg-green-100 dark:bg-green-900/40 dark:text-green-400 px-2 py-0.5 rounded">-${pct}%</span>`;
      else
        badge = `<span class="text-xs font-bold text-red-500 bg-red-100 dark:bg-red-900/40 dark:text-red-400 px-2 py-0.5 rounded">+${Math.abs(
          pct
        )}%</span>`;
    }

    const inputFormat = getPrettyFormat(item.file.type, item.file.name);

    row.innerHTML = `
            <div class="px-4 py-2 bg-gray-50 dark:bg-[#202020] border-b border-border dark:border-dark-border flex justify-between items-center">
                <span class="text-xs font-medium truncate max-w-[200px] text-secondary dark:text-dark-secondary" title="${item.file.name
      }">${item.file.name}</span>
                <div class="flex items-center gap-2">
                     ${isDone
        ? `<button onclick="downloadSingle('${item.id}')" class="text-xs bg-brand text-white px-2 py-1 rounded hover:bg-brand/90 transition-colors">Télécharger</button>`
        : ""
      }
                    <button onclick="removeFile('${item.id
      }')" class="text-gray-400 hover:text-red-500"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>
                </div>
            </div>

            <div class="grid grid-cols-2 divide-x divide-border dark:divide-dark-border">

                <!-- Original Column -->
                <div class="p-4 flex flex-col gap-3">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <h4 class="text-xs font-bold uppercase tracking-wider text-secondary dark:text-dark-secondary">Original</h4>
                            <span class="text-[10px] font-bold bg-gray-200 dark:bg-dark-border px-1.5 py-0.5 rounded text-secondary dark:text-dark-secondary">${inputFormat}</span>
                        </div>
                        <span class="text-[10px] font-mono bg-gray-100 dark:bg-dark-border px-1.5 py-0.5 rounded">${formatBytes(
        item.file.size
      )}</span>
                    </div>
                    <div class="aspect-video bg-gray-100 dark:bg-[#151515] rounded-lg overflow-hidden flex items-center justify-center border border-border dark:border-dark-border relative group">
                        <img src="${originalUrl}" class="max-w-full max-h-full object-contain">
                        <div class="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1.5 rounded backdrop-blur-sm">
                            ${item.bitmap.width} x ${item.bitmap.height}
                        </div>
                    </div>
                </div>

                <!-- Transformed Column -->
                <div class="p-4 flex flex-col gap-3 relative">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <h4 class="text-xs font-bold uppercase tracking-wider text-brand">Résultat</h4>
                            <select onchange="updateItemFormat('${item.id
      }', this.value)"
                                class="text-[10px] bg-brand/10 text-brand font-bold border-none rounded py-0.5 pl-1.5 pr-6 cursor-pointer outline-none focus:ring-1 focus:ring-brand">
                                <option value="image/jpeg" ${item.format === "image/jpeg" ? "selected" : ""
      }>JPG</option>
                                <option value="image/png" ${item.format === "image/png" ? "selected" : ""
      }>PNG</option>
                                <option value="image/webp" ${item.format === "image/webp" ? "selected" : ""
      }>WEBP</option>
                                <option value="image/avif" ${item.format === "image/avif" ? "selected" : ""
      }>AVIF</option>
                            </select>
                        </div>
                        <div class="flex gap-2 items-center">
                            ${badge}
                            <span class="text-[10px] font-mono bg-brand/10 text-brand px-1.5 py-0.5 rounded">${outputSize}</span>
                        </div>
                    </div>
                    <div class="aspect-video bg-gray-100 dark:bg-[#151515] rounded-lg overflow-hidden flex items-center justify-center border border-brand/20 dark:border-brand/20 relative group">
                        <img src="${outputUrl}" class="max-w-full max-h-full object-contain transition-opacity duration-300 ${!isDone ? "opacity-40 grayscale" : ""
      }">
                        ${isProcessingItem
        ? `
                        <div class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-sm">
                            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-brand"></div>
                        </div>`
        : ""
      }
                        ${!isDone && !isProcessingItem
        ? `
                        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span class="text-[10px] text-secondary dark:text-dark-secondary bg-white dark:bg-dark-surface px-2 py-1 rounded shadow-sm border border-border dark:border-dark-border">Aperçu auto...</span>
                        </div>`
        : ""
      }
                        ${isDone
        ? `
                        <div class="absolute bottom-1 right-1 bg-brand text-white text-[9px] px-1.5 rounded backdrop-blur-sm shadow-sm">
                            ${outputDimsStr}
                        </div>`
        : ""
      }
                    </div>
                </div>

            </div>
        `;
    fileListContainer.appendChild(row);
  });
}

window.updateItemFormat = function (id, newFormat) {
  const item = fileQueue.find((f) => f.id === id);
  if (item) {
    item.format = newFormat;
    item.status = "pending";
    triggerBatchUpdate();
  }
};

window.removeFile = function (id) {
  fileQueue = fileQueue.filter((f) => f.id !== id);
  if (fileQueue.length === 0) resetUI();
  else renderList();
};

function resetUI() {
  uploadScreen.classList.remove("hidden");
  previewScreen.classList.add("hidden");
  controlsPanel.setAttribute("data-active", "false");
  processBtn.disabled = true;
  fileInput.value = "";
}

async function processQueue(isAuto = false) {
  if (isProcessing && !isAuto) return;
  isProcessing = true;
  if (!isAuto) {
    processBtn.disabled = true;
    processBtnText.textContent = "Traitement...";
  }

  const quality = parseInt(qualityInput.value) / 100;
  const scalePct = parseInt(scaleInput.value) / 100;
  const targetW = parseInt(widthInput.value);
  const targetH = parseInt(heightInput.value);

  for (const item of fileQueue) {
    item.status = "processing";
    renderList();

    try {
      // Source dimensions
      let srcW = item.bitmap.width;
      let srcH = item.bitmap.height;

      // Calculate target dimensions (Resizer Logic)
      let finalW = srcW;
      let finalH = srcH;

      if (currentMode === "resizer") {
        if (targetW && targetH) {
          finalW = targetW;
          finalH = targetH;
        } else if (targetW) {
          finalW = targetW;
          finalH = Math.round(srcH * (targetW / srcW));
        } else if (targetH) {
          finalH = targetH;
          finalW = Math.round(srcW * (targetH / srcH));
        } else {
          finalW = Math.round(srcW * scalePct);
          finalH = Math.round(srcH * scalePct);
        }
      }

      // --- EDITOR MODE LOGIC (Batch Crop & Transform) ---

      // 1. Calculate Crop Region (Source Crop)
      let sx = 0,
        sy = 0,
        sw = srcW,
        sh = srcH;

      if (
        currentMode === "editor" &&
        editorState.crop !== "none" &&
        editorState.crop !== "free"
      ) {
        // Determine target ratio
        let targetRatio = 1; // square
        if (editorState.crop === "4:5") targetRatio = 4 / 5;
        if (editorState.crop === "16:9") targetRatio = 16 / 9;
        if (editorState.crop === "9:16") targetRatio = 9 / 16;

        const currentRatio = srcW / srcH;

        if (currentRatio > targetRatio) {
          // Source is wider than target -> Crop width
          sw = srcH * targetRatio;
          sx = (srcW - sw) / 2;
        } else {
          // Source is taller than target -> Crop height
          sh = srcW / targetRatio;
          sy = (srcH - sh) / 2;
        }

        // Final dimensions match cropped area
        finalW = sw;
        finalH = sh;
      }

      // 2. Setup Canvas Size based on Rotation
      let canvasW = finalW;
      let canvasH = finalH;

      if (currentMode === "editor") {
        if (editorState.rotation === 90 || editorState.rotation === 270) {
          canvasW = finalH;
          canvasH = finalW;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // 3. Apply Transforms
      ctx.save();

      // Move to center of canvas
      ctx.translate(canvasW / 2, canvasH / 2);

      // Apply Rotation
      if (currentMode === "editor") {
        ctx.rotate((editorState.rotation * Math.PI) / 180);

        // Flip (happens in local coord system)
        const scaleX = editorState.flipH ? -1 : 1;
        const scaleY = editorState.flipV ? -1 : 1;
        ctx.scale(scaleX, scaleY);
      }

      ctx.drawImage(
        item.bitmap,
        sx,
        sy,
        sw,
        sh,
        -finalW / 2,
        -finalH / 2,
        finalW,
        finalH
      );

      ctx.restore();

      const format = item.format || formatSelect.value;
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, format, quality)
      );

      item.blob = blob;
      item.blobDims = { w: canvasW, h: canvasH };
      item.status = "done";
    } catch (err) {
      console.error(err);
      item.status = "error";
    }
  }

  renderList();

  isProcessing = false;
  processBtn.disabled = false;

  // Update button text logic
  if (currentMode === "converter")
    processBtnText.textContent = "Convertir tout";
  else if (currentMode === "resizer")
    processBtnText.textContent = "Redimensionner tout";
  else processBtnText.textContent = "Appliquer tout";

  if (!isAuto) {
    downloadZip();
  }
}

async function downloadZip() {
  const zip = new JSZip();

  fileQueue.forEach((item) => {
    if (item.blob) {
      const format = item.format || formatSelect.value;
      const ext = format.split("/")[1];
      const name =
        item.file.name.substring(0, item.file.name.lastIndexOf(".")) ||
        item.file.name;
      zip.file(`${name}_${currentMode}.${ext}`, item.blob);
    }
  });

  const content = await zip.generateAsync({ type: "blob" });
  triggerDownload(content, "images.zip");
}

window.downloadSingle = function (id) {
  const item = fileQueue.find((f) => f.id === id);
  if (item && item.blob) {
    const format = item.format || formatSelect.value;
    const ext = format.split("/")[1];
    const name =
      item.file.name.substring(0, item.file.name.lastIndexOf(".")) ||
      item.file.name;
    triggerDownload(item.blob, `${name}_${currentMode}.${ext}`);
  }
};

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
