// Brigid - Flame Whisperer Engine (with 4-slot Memory)

// Buttons & elements
const captureBtn = document.getElementById("captureBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const analysisArea = document.getElementById("analysisArea");
const analysisCanvas = document.getElementById("analysisCanvas");
const ctx = analysisCanvas.getContext("2d");

const saveFlameBtn = document.getElementById("saveFlameBtn");
const viewMemoryBtn = document.getElementById("viewMemoryBtn");
const memoryPanel = document.getElementById("memoryPanel");

const MEMORY_KEY = "brigid_memory_v1";
const MAX_SLOTS = 4;

// Holds the last analyzed snapshot so user can decide to save
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

        // Save snapshot object for Memory Engine
        currentSnapshot = {
            imageSrc,
            reportHtml,
            time: new Date().toISOString()
        };

        // Enable Save button now that we have something meaningful
        saveFlameBtn.disabled = false;
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

    // Newest at the front
    mem.unshift(currentSnapshot);

    // Limit to MAX_SLOTS
    if (mem.length > MAX_SLOTS) {
        mem = mem.slice(0, MAX_SLOTS);
    }

    saveMemory(mem);

    analysisArea.innerHTML +=
        "<br><br><small>✅ Saved to Brigid’s memory. " +
        `Currently storing ${mem.length} snapshot(s).</small>`;

    // Keep button enabled for subsequent saves on new analyses
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
                    <button onclick="BrigidMemory.delete(${idx})">Delete</button>
                </div>
            </div>
        `;
    });

    memoryPanel.innerHTML = html;
}

// Expose small helper for inline buttons
window.BrigidMemory = {
    load(index) {
        const mem = loadMemory();
        const item = mem[index];
        if (!item) return;

        // Show snapshot back in main view
        preview.src = item.imageSrc;
        preview.style.display = "block";
        analysisArea.innerHTML = item.reportHtml;

        currentSnapshot = item;
        saveFlameBtn.disabled = false;
    },
    delete(index) {
        let mem = loadMemory();
        if (index < 0 || index >= mem.length) return;
        mem.splice(index, 1);
        saveMemory(mem);
        renderMemoryPanel(mem);
    }
};
