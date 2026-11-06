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

    const markingImages = {};

    const eyeImages = {
        left: new Image(),
        right: new Image()
    }

    let leftEyeLoaded = false;
    let rightEyeLoaded = false;

    eyeImages.left.src = "assets/cats/eyes/left-eye.png";
    eyeImages.right.src = "assets/cats/eyes/right-eye.png";

    eyeImages.left.onload = () => {
        leftEyeLoaded = true;
        console.log("Left eye loaded!")
    }

    eyeImages.right.onload = () => {
        rightEyeLoaded = true;
        console.log("Right eye loaded!")
    }

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

    function loadMarking(name, src) {
        const image = new Image();
        image.src = src;

        markingImages[name] = image;

        image.onload = () => {
            console.log(`Marking loaded: ${name}`);
        };

        image.onerror = () => {
            console.error(`Could not load marking: ${name}`);
        };
    }

    const EYE_COLORS = {
        blue: "#6595C4",
        green: "#75A86B",
        amber: "#C58B35",
        gold: "#E0B94F",
        copper: "#A95F36"
    };

    const COAT_VARIATIONS = {
        black: [
            "#303039",
            "#393A40",
            "#45464A",
            "#292A30"
        ],

        chocolate: [
            "#68432F",
            "#79513A",
            "#895D43",
            "#704B3B"
        ],

        blue: [
            "#71818F",
            "#82909D",
            "#929EAA",
            "#667786"
        ],

        lilac: [
            "#A99AA8",
            "#B9A9B6",
            "#C4B5BF"
        ],

        red: [
            "#B85D32",
            "#C87542",
            "#D4864E",
            "#E0955B",
            "#A94F2D"
        ],

        cream: [
            "#E8D5A7",
            "#F0DDB7",
            "#F4E5C5",
            "#DDC89B"
        ],

        white: [
            "#EEEDEA",
            "#F5F2E9",
            "#E5E1D8"
        ]
    };

    function chooseCoatColor(base) {
        const variations = COAT_VARIATIONS[base];

        if (!variations) {
            return "#808080";
        }

        return variations[
            Math.floor(Math.random() * variations.length)
        ];
    }



    function drawColoredEye(ctx, image, color, width, height) {
        if (!image.complete || !image.naturalWidth) {
            return;
        }

        const eyeCanvas = document.createElement("canvas");
        eyeCanvas.width = width;
        eyeCanvas.height = height;

        const eyeCtx = eyeCanvas.getContext("2d");

        eyeCtx.drawImage(image, 0, 0, width, height);

        eyeCtx.globalCompositeOperation = "source-in";
        eyeCtx.fillStyle = EYE_COLORS[color] || EYE_COLORS.blue;
        eyeCtx.fillRect(0, 0, width, height);

        ctx.drawImage(eyeCanvas, 0, 0);
    }

    function renderEyes(canvas, leftColor, rightColor) {
        if (!leftEyeLoaded || !rightEyeLoaded) {
            return;
        }

        const ctx = canvas.getContext("2d");

        drawColoredEye(
            ctx,
            eyeImages.left,
            leftColor,
            canvas.width,
            canvas.height
        );

        drawColoredEye(
            ctx,
            eyeImages.right,
            rightColor,
            canvas.width,
            canvas.height
        );
    }

    // safe marking rendering for null and mismatched names
    function renderMarkings(canvas, markingName) {
        console.log("Rendering marking:", markingName);
        if (!markingName) {
            return;
        }

        const image = markingImages[markingName];

        if (!image) {
            console.warn(`Unknown marking: ${markingName}`);
            return;
        }

        if (!image.complete || !image.naturalWidth) {
            return;
        }

        const ctx = canvas.getContext("2d");

        ctx.drawImage(
            image,
            0,
            0,
            canvas.width,
            canvas.height
        );
    }

    function renderIcon(canvas, traits) {
        const coatColor = traits.coatShade || chooseCoatColor(traits.base);

        const patternName = traits.pattern === "tabby"
            ? "tabby"
            : null;

        if (!imageLoaded || !silhouetteLoaded || !leftEyeLoaded || !rightEyeLoaded) {
            const retry = () => {
                if (imageLoaded && silhouetteLoaded && leftEyeLoaded && rightEyeLoaded) {
                    renderIcon(canvas, traits);
                }
            };

            if (!imageLoaded) baseImage.addEventListener("load", retry, { once: true });
            if (!silhouetteLoaded) silhouetteImage.addEventListener("load", retry, { once: true });
            if (!leftEyeLoaded) eyeImages.left.addEventListener("load", retry, { once: true });
            if (!rightEyeLoaded) eyeImages.right.addEventListener("load", retry, { once: true });

            return;
        }

        renderBase(canvas, coatColor, patternName);
        renderMarkings(canvas, traits.whiteMarking);
        renderEyes(canvas, traits.eyeColor, traits.rightEyeColor);
        // Draw outline on top of markings
        const ctx = canvas.getContext("2d");
        ctx.drawImage(baseImage, 0, 0);

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

        canvas.getContext("2d").drawImage(croppedCanvas, 0, 0);
    }

    function renderCat(canvas, traits) {
        const coatColor = traits.coatShade || chooseCoatColor(traits.base);

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
        renderMarkings(canvas, traits.whiteMarking);
        renderEyes(canvas, traits.eyeColor, traits.rightEyeColor);
        // Draw outline on top of markings
        const ctx = canvas.getContext("2d");
        ctx.drawImage(baseImage, 0, 0);
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
    loadMarking("bootfl", "assets/cats/markings/bootfl.png");
    loadMarking("maskmantle", "assets/cats/markings/maskmantle.png");
    loadMarking("piebald", "assets/cats/markings/piebald.png");
    loadMarking("van", "assets/cats/markings/van.png");
    loadMarking("van-2", "assets/cats/markings/van2.png");
    loadMarking("mustache", "assets/cats/markings/stache.png");
    loadMarking("sansa", "assets/cats/markings/sansa.png");
    loadMarking("winter", "assets/cats/markings/winter.png");
    loadMarking("socks-bib", "assets/cats/markings/socks-bib.png");
    loadMarking("tuxedo", "assets/cats/markings/tuxedo.png");
    loadMarking("socks-full", "assets/cats/markings/socks-full.png");
    loadMarking("white", "assets/cats/markings/white.png");

    return {
        initialize,
        chooseCoatColor,
        renderEyes,
        renderMarkings,
        renderBase,
        renderCat,
        renderIcon,
        loadPattern,
        renderCoat
    };
})();