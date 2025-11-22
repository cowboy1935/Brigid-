// Brigid - Flame Whisperer Engine

const captureBtn = document.getElementById("captureBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const analysisArea = document.getElementById("analysisArea");
const analysisCanvas = document.getElementById("analysisCanvas");
const ctx = analysisCanvas.getContext("2d");

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

function analyzeFlame(imageSrc) {
    analysisArea.innerHTML = "🔥 Analyzing flame...";

    const img = new Image();
    img.onload = () => {
        // Downscale to analysis size (auto-adaptive)
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

        // Compute whisper report
        const report = buildWhisperReport(w, h, bbox, stats);

        analysisArea.innerHTML = report;
    };
    img.src = imageSrc;
}

/**
 * Build a simple flame mask based on brightness + blue/orange tint.
 * Returns:
 * - mask: boolean array (true = flame pixel)
 * - bbox: bounding box of flame region
 * - stats: basic stats (left/right intensity, area, etc.)
 */
function buildFlameMask(imageData, width, height) {
    const data = imageData.data;
    const mask = new Array(width * height).fill(false);

    let minX = width, maxX = 0, minY = height, maxY = 0;
    let leftIntensity = 0;
    let rightIntensity = 0;
    let totalIntensity = 0;
    let count = 0;

    // crude threshold values - we can tune later
    const brightnessThreshold = 80; // minimum brightness
    const blueBonus = 1.15; // emphasize blue regions

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            const brightness = (r + g + b) / 3;

            // emphasize flames: bright + bluish or bright + warm
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
        // No flame detected
        return {
            mask,
            bbox: null,
            stats: {
                detected: false
            }
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

/**
 * Build a first-draft "whisper report" from the flame geometry.
 */
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
