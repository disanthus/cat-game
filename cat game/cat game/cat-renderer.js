window.CatRenderer = (() => {
    const baseImage = new Image();

    baseImage.src = "assets/cats/body/cat-base.png";

    let imageLoaded = false;

    baseImage.onload = () => {
        imageLoaded = true;
        console.log("Base cat image loaded!");
        console.log("Image dimensions:", baseImage.naturalWidth, baseImage.naturalHeight);
    };

    baseImage.onerror = () => {
        console.error("Could not load base cat image.");
    };

    const silhouetteImage = new Image();
    silhouetteImage.src = "assets/cats/body/cat-silhouette.png";

    let silhouetteLoaded = false;

    silhouetteImage.onload = () => {
        silhouetteLoaded = true;
        console.log("Cat silhouette loaded!")
    }

    silhouetteImage.onerror = () => {
        console.error("Could not load cat silhouette.")
    }

    const patternImages = {};
    let coatColors = {};

    function initialize(colors) {
        coatColors = colors;
    }

    function loadPattern(name, src) {
        const image = new Image();
        image.src = src;

        patternImages[name] = image;

        image.onload = () => {
            console.log(`Pattern loaded: ${name}`);
        };

        image.onerror = () => {
            console.error(`Could not load pattern: ${name}`);
        };
    }

    function renderIcon(canvas, traits) {
        const coatColor = coatColors[traits.base] || "#808080";

        const patternName = traits.pattern === "tabby"
            ? "tabby"
            : null;

        if (!imageLoaded || !silhouetteLoaded) {
            const retry = () => {
                if (imageLoaded && silhouetteLoaded) {
                    renderFace(canvas, traits);
                }
            };

            if (!imageLoaded) {
                baseImage.addEventListener("load", retry, { once: true });
            }

            if (!silhouetteLoaded) {
                silhouetteImage.addEventListener("load", retry, { once: true });
            }

            return;
        }

        renderBase(canvas, coatColor, patternName);

        const ctx = canvas.getContext("2d");

        // Adjust these values to change the face crop.
        const crop = {
            x: 1400,
            y: 550,
            width: 1000,
            height: 900
        };

        const croppedCanvas = document.createElement("canvas");
        croppedCanvas.width = crop.width;
        croppedCanvas.height = crop.height;

        croppedCanvas.getContext("2d").drawImage(
            canvas,
            crop.x, crop.y, crop.width, crop.height,
            0, 0, crop.width, crop.height
        );

        canvas.width = crop.width;
        canvas.height = crop.height;

        ctx.drawImage(croppedCanvas, 0, 0);
    }

    function renderCat(canvas, traits) {
    const coatColor = coatColors[traits.base]?.hex || "#808080";

    const patternName = traits.pattern === "tabby"
        ? "tabby"
        : null;

    // Wait until the base and silhouette images are loaded.
    if (!imageLoaded || !silhouetteLoaded) {
        const retry = () => {
            if (imageLoaded && silhouetteLoaded) {
                renderCat(canvas, traits);
            }
        };

        if (!imageLoaded) {
            baseImage.addEventListener("load", retry, { once: true });
        }

        if (!silhouetteLoaded) {
            silhouetteImage.addEventListener("load", retry, { once: true });
        }

        return;
    }

    renderBase(canvas, coatColor, patternName);
}

function renderBase(canvas, coatColor = "#808080", patternName = null) {
    if (!imageLoaded) {
        console.warn("Base cat image is not loaded yet.");
        return;
    }

    const ctx = canvas.getContext("2d");

    const coatCanvas = document.createElement("canvas");
    coatCanvas.width = silhouetteImage.naturalWidth;
    coatCanvas.height = silhouetteImage.naturalHeight;

    const coatCtx = coatCanvas.getContext("2d");

    coatCtx.clearRect(0, 0, coatCanvas.width, coatCanvas.height);

    coatCtx.drawImage(
        silhouetteImage,
        0,
        0,
        coatCanvas.width,
        coatCanvas.height
    );

    coatCtx.globalCompositeOperation = "source-in";
    coatCtx.fillStyle = coatColor;
    coatCtx.fillRect(0, 0, coatCanvas.width, coatCanvas.height);

    coatCtx.globalCompositeOperation = "source-over";

    canvas.width = baseImage.naturalWidth;
    canvas.height = baseImage.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (silhouetteLoaded) {
        ctx.drawImage(coatCanvas, 0, 0);
    }

    if (patternName && patternImages[patternName]) {
        const pattern = patternImages[patternName];

        if (pattern.complete && pattern.naturalWidth > 0) {
            ctx.drawImage(
                pattern,
                0,
                0,
                canvas.width,
                canvas.height
            );
        }
    }
    ctx.drawImage(baseImage, 0, 0);
}

function renderCoat(canvas, color) {
    // draw base first
    renderBase(canvas);

    const ctx = canvas.getContext("2d");

    // Apply coat color while preserving shading
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Keep base transparency
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(baseImage, 0, 0);

    // Reset compositing
    ctx.globalCompositeOperation = "source-over";
}

loadPattern("tabby", "assets/cats/patterns/tabby.png");

return {
    initialize,
    renderBase,
    renderCat,
    renderIcon,
    loadPattern,
    renderCoat
};
}) ();