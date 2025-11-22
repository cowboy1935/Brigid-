// Brigid - Flame Whisperer Engine (with 4-slot Memory + Export Engine)

// Buttons & elements
const captureBtn = document.getElementById("captureBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const analysisArea = document.getElementById("analysisArea");
const analysisCanvas = document.getElementById("analysisCanvas");
const ctx = analysisCanvas.getContext("2d");

const saveFlameBtn = document.getElementById("saveFlameBtn");
const exportFlameBtn = document.getElementById("exportFlameBtn");
const viewMemoryBtn = document.getElementById("viewMemoryBtn");
const memoryPanel = document.getElementById("memoryPanel");

const MEMORY_KEY = "brigid_memory_v1";
const MAX_SLOTS = 4;

// Holds the last analyzed snapshot so user can save/export
let currentSnapshot = null;

// --- Capture / upload handling ---

captureBtn.addEventListener("click", () => {
    fileInput.capture = "environment";
    fileInput.click();
});

uploadBtn.addEventListener("click", () => {
    fileInput.capture = "";
    fileInput.click();
});

fileInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        preview.src = e.target.result;
        preview.style.display = "block";

        analyzeFlame(e.target.result);
    };
    reader.readAsDataURL(file);
});

// --- Main flame analysis ---

function analyzeFlame(imageSrc) {
    analysisArea.innerHTML = "🔥 Analyzing flame...";

    const img = new Image();
    img.onload = () => {
        const maxSize = 256;
        let w = img.width;
        let h = img.height;
        const scale = Math.min(maxSize / w, maxSize / h, 1);
        w = Math.floor(w * scale);
        h = Math.floor(h * scale);

        analysisCanvas.width = w;
        analysisCanvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const { mask, bbox, stats } = buildFlameMask(imageData, w, h);

        const reportHtml = buildWhisperReport(w, h, bbox, stats);

        analysisArea.innerHTML = reportHtml;

        // Save snapshot object for Memory & Export engine
        currentSnapshot = {
            imageSrc,
            reportHtml,
            time: new Date().toISOString()
        };

        // Enable Save + Export now that we have a valid snapshot
        saveFlameBtn.disabled = false;
        exportFlameBtn.disabled = false;
    };
    img.src = imageSrc;
}

// Build flame mask based on brightness + color bias
function buildFlameMask(imageData, width, height) {
    const data = imageData.data;
    const mask = new Array(width * height).fill(false);

    let minX = width, maxX = 0, minY = height, maxY = 0;
    let leftIntensity = 0;
    let rightIntensity = 0;
    let totalIntensity = 0;
    let count = 0;

    const brightnessThreshold = 80;
    const blueBonus = 1.15;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const brightness = (r + g + b) / 3;

            const blueScore = b > r && b > g ? blueBonus : 1.0;
            const warmScore = r > b && r > g ? 1.0 : 0.8;
            const flameScore = brightness * blueScore * warmScore;

            if (flameScore > brightnessThreshold) {
                mask[y * width + x] = true;
                count++;
                totalIntensity += flameScore;

                if (x < width / 2) {
                    leftIntensity += flameScore;
                } else {
                    rightIntensity += flameScore;
                }

                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (count === 0) {
        return {
            mask,
            bbox: null,
            stats: { detected: false }
        };
    }

    const bbox = { minX, maxX, minY, maxY };
    const stats = {
        detected: true,
        area: count,
        leftIntensity,
        rightIntensity,
        totalIntensity
    };

    return { mask, bbox, stats };
}

// Generate the Whisper Report from geometry + intensity
function buildWhisperReport(width, height, bbox, stats) {
    if (!stats.detected || !bbox) {
        return "⚠️ Brigid could not clearly see a flame in this image. " +
               "Try a closer shot focused on the active flame zone.";
    }

    const flameWidth = bbox.maxX - bbox.minX;
    const flameHeight = bbox.maxY - bbox.minY;

    const heightRatio = flameHeight / height;
    const widthRatio = flameWidth / width;

    const leftShare = stats.leftIntensity / Math.max(stats.totalIntensity, 1);
    const rightShare = stats.rightIntensity / Math.max(stats.totalIntensity, 1);

    let shapeDesc = "";
    if (heightRatio > 0.7 && widthRatio < 0.5) {
        shapeDesc = "Tall and tight — similar to a high-momentum NF2500-style flame.";
    } else if (heightRatio < 0.6 && widthRatio > 0.6) {
        shapeDesc = "Short and wide — similar to a softer, fuller NF1500-style flame.";
    } else {
        shapeDesc = "Intermediate profile — between wide and tight.";
    }

    let balanceDesc = "";
    if (Math.abs(leftShare - rightShare) < 0.1) {
        balanceDesc = "Left and right flame energy are fairly balanced.";
    } else if (leftShare > rightShare) {
        balanceDesc = "More intensity on the left side — check for angle, tile, or air on that side.";
    } else {
        balanceDesc = "More intensity on the right side — check for direction, obstruction, or air bias.";
    }

    let stabilityDesc = "";
    if (heightRatio > 0.8 && widthRatio < 0.3) {
        stabilityDesc = "Flame may be too tight / long — watch for roof strike or runaway jet behavior.";
    } else if (heightRatio < 0.4 && widthRatio > 0.7) {
        stabilityDesc = "Flame may be too short / scattered — possible excess air or low fuel.";
    } else {
        stabilityDesc = "Flame geometry appears reasonably stable for now.";
    }

    const summary =
        "🔥 Brigid Flame Whisper Report<br><br>" +
        `Approx flame coverage: ${(widthRatio * 100).toFixed(1)}% width, ` +
        `${(heightRatio * 100).toFixed(1)}% height of frame.<br>` +
        `${shapeDesc}<br><br>` +
        `${balanceDesc}<br>` +
        `${stabilityDesc}`;

    return summary;
}

// --- MEMORY ENGINE (Phase 2A: 4-slot rotating buffer) ---

function loadMemory() {
    try {
        const raw = localStorage.getItem(MEMORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed;
    } catch (e) {
        return [];
    }
}

function saveMemory(memoryArray) {
    try {
        localStorage.setItem(MEMORY_KEY, JSON.stringify(memoryArray));
    } catch (e) {
        console.warn("Could not save memory:", e);
    }
}

// Save currentSnapshot into memory
saveFlameBtn.addEventListener("click", () => {
    if (!currentSnapshot) {
        return;
    }

    let mem = loadMemory();

    mem.unshift(currentSnapshot);

    if (mem.length > MAX_SLOTS) {
        mem = mem.slice(0, MAX_SLOTS);
    }

    saveMemory(mem);

    analysisArea.innerHTML +=
        "<br><br><small>✅ Saved to Brigid’s memory. " +
        `Currently storing ${mem.length} snapshot(s).</small>`;
});

// View memory panel
viewMemoryBtn.addEventListener("click", () => {
    const mem = loadMemory();
    if (memoryPanel.style.display === "none") {
        renderMemoryPanel(mem);
        memoryPanel.style.display = "block";
    } else {
        memoryPanel.style.display = "none";
    }
});

// --- EXPORT ENGINE (Phase 2B) ---

// export current snapshot as combined PNG (flame + report)
exportFlameBtn.addEventListener("click", () => {
    if (!currentSnapshot) return;
    exportSnapshot(currentSnapshot, "Brigid_Flame");
});

// helper to strip HTML tags from report
function stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").trim();
}

// main export function
function exportSnapshot(snapshot, baseName) {
    const img = new Image();
    img.onload = () => {
        const exportCanvas = document.createElement("canvas");
        const ctx2 = exportCanvas.getContext("2d");

        const targetWidth = 900;
        const scale = Math.min(targetWidth / img.width, 1);
        const imgW = img.width * scale;
        const imgH = img.height * scale;

        const text = stripHtml(snapshot.reportHtml);
        const lines = wrapText(ctx2, text, targetWidth - 80);

        const padding = 40;
        const lineHeight = 24;
        const textHeight = lines.length * lineHeight + 40;

        exportCanvas.width = targetWidth;
        exportCanvas.height = padding + imgH + padding + textHeight + padding;

        // background
        ctx2.fillStyle = "#05070b";
        ctx2.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

        // draw flame image centered
        const imgX = (targetWidth - imgW) / 2;
        const imgY = padding;
        ctx2.drawImage(img, imgX, imgY, imgW, imgH);

        // text block
        ctx2.fillStyle = "#d9e4ff";
        ctx2.font = "16px Arial";
        let tx = 40;
        let ty = padding + imgH + 40;
        lines.forEach(line => {
            ctx2.fillText(line, tx, ty);
            ty += lineHeight;
        });

        // subtle watermark
        ctx2.fillStyle = "#6b8cff";
        ctx2.font = "14px Arial";
        const mark = "Brigid • Flame Whisperer";
        const mw = ctx2.measureText(mark).width;
        ctx2.fillText(mark, exportCanvas.width - mw - 20, exportCanvas.height - 20);

        const dataUrl = exportCanvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = (baseName || "Brigid_Flame") + "_" + Date.now() + ".png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    img.src = snapshot.imageSrc;
}

// simple text wrapping helper
function wrapText(ctx2, text, maxWidth) {
    ctx2.font = "16px Arial";
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";

    words.forEach(word => {
        const test = line ? line + " " + word : word;
        const w = ctx2.measureText(test).width;
        if (w > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    });

    if (line) lines.push(line);
    return lines;
}

// Memory panel rendering with Export per slot
function renderMemoryPanel(mem) {
    if (!mem || mem.length === 0) {
        memoryPanel.innerHTML = "<em>No stored flame snapshots yet.</em>";
        return;
    }

    let html = "<h3>Memory</h3>";
    mem.forEach((item, idx) => {
        const time = new Date(item.time).toLocaleString();
        html += `
            <div class="memory-item">
                <div>Slot M${idx + 1} — ${time}</div>
                <img class="memory-thumb" src="${item.imageSrc}" alt="Flame snapshot ${idx + 1}">
                <div>
                    <button onclick="BrigidMemory.load(${idx})">Load</button>
                    <button onclick="BrigidMemory.export(${idx})">Export</button>
                    <button onclick="BrigidMemory.delete(${idx})">Delete</button>
                </div>
            </div>
        `;
    });

    memoryPanel.innerHTML = html;
}

// Expose small helper for inline buttons in memory panel
window.BrigidMemory = {
    load(index) {
        const mem = loadMemory();
        const item = mem[index];
        if (!item) return;

        preview.src = item.imageSrc;
        preview.style.display = "block";
        analysisArea.innerHTML = item.reportHtml;

        currentSnapshot = item;
        saveFlameBtn.disabled = false;
        exportFlameBtn.disabled = false;
    },
    delete(index) {
        let mem = loadMemory();
        if (index < 0 || index >= mem.length) return;
        mem.splice(index, 1);
        saveMemory(mem);
        renderMemoryPanel(mem);
    },
    export(index) {
        const mem = loadMemory();
        const item = mem[index];
        if (!item) return;
        exportSnapshot(item, "Brigid_Memory_M" + (index + 1));
    }
};
