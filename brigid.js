// Brigid - Flame Whisperer Engine

const captureBtn = document.getElementById("captureBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");
const preview = document.getElementById("preview");
const analysisArea = document.getElementById("analysisArea");

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
    analysisArea.innerHTML =
        "🔥 Analyzing flame...<br><br>" +
        "This is Brigid’s early vision. " +
        "Flame outline detection, color extraction, and signature mapping will appear here.";
}
