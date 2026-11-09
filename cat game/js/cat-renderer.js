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

    const artworkBases = {
        default: {
            base: baseImage,
            silhouette: silhouetteImage,
            patterns: patternImages,
            markings: markingImages,
            eyes: eyeImages
        }
    }

    function initialize(colors) {
        coatColors = colors;
    }

    function loadArtworkBase(name, baseSrc, silhouetteSrc) {
        const base = new Image();
        const silhouette = new Image();

        artworkBases[name] = {
            base,
            silhouette,
            patterns: {},
            markings: {},
            eyes: {
                left: new Image(),
                right: new Image()
            }
        };

        base.onload = () => {
            console.log(`Base loaded: ${name}`)
        };

        base.onerror = () => {
            console.log(`Could not load base: ${name}`)
        }

        silhouette.onload = () => {
            console.log(`Silhouette loaded: ${name}`)
        }

        silhouette.onerror = () => {
            console.log(`Could not load silhouette: ${name}`)
        }

        base.src = baseSrc;
        silhouette.src = silhouetteSrc;
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

    function loadArtworkPattern(artworkName, name, src) {
        const artwork = artworkBases[artworkName];

        if (!artwork) {
            console.error(`Unknown base: ${artworkName}`);
            return;
        }

        const image = new Image();
        artwork.patterns[name] = image;

        image.onload = () => {
            console.log(`Pattern loaded: ${artworkName} - ${name}`)
        }

        image.onerror = () => {
            console.log(`Could not load pattern: ${artworkName} - ${name}`);
        }

        image.src = src;
    }

    function loadArtworkMarking(artworkName, name, src) {
        const artwork = artworkBases[artworkName];

        if (!artwork) {
            console.error(`Unknown artwork base: ${artworkName}`);
            return;
        }

        const image = new Image();
        artwork.markings[name] = image;

        image.onload = () => {
            console.log(`Marking loaded: ${artworkName} - ${name}`);
        }

        image.onerror = () => {
            console.error(`Could not load marking: ${artworkName} - ${name}`)
        }

        image.src = src;
    }

    function loadArtworkEyes(artworkName, leftSrc, rightSrc) {
        const artwork = artworkBases[artworkName];

        if (!artwork) {
            console.error(`Unknown artwork base: ${artworkName}`);
            return;
        }

        artwork.eyes.left.onload = () => {
            console.log(`${artworkName} left eye loaded!`);
        };

        artwork.eyes.right.onload = () => {
            console.log(`${artworkName} right eye loaded!`);
        };

        artwork.eyes.left.onerror = () => {
            console.error(`Failed to load ${artworkName} left eye: ${leftSrc}`);
        };

        artwork.eyes.right.onerror = () => {
            console.error(`Failed to load ${artworkName} right eye: ${rightSrc}`);
        };

        artwork.eyes.left.src = leftSrc;
        artwork.eyes.right.src = rightSrc;
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

    function renderEyes(canvas, leftColor, rightColor, artworkName = "default") {
        const artwork = artworkBases[artworkName];

        if (!artwork || !artwork.eyes) {
            console.error(`Eyes not found for artwork: ${artworkName}`);
            return;
        }

        const leftEye = artwork.eyes.left;
        const rightEye = artwork.eyes.right;

        if (
            !leftEye.complete || !leftEye.naturalWidth ||
            !rightEye.complete || !rightEye.naturalWidth
        ) {
            return;
        }

        const ctx = canvas.getContext("2d");

        drawColoredEye(
            ctx,
            leftEye,
            leftColor,
            canvas.width,
            canvas.height
        );

        drawColoredEye(
            ctx,
            rightEye,
            rightColor,
            canvas.width,
            canvas.height
        );
    }

    // safe marking rendering for null and mismatched names
    function renderMarkings(canvas, markingName, artworkName = "default") {
        console.log("Rendering marking:", markingName);
        if (!markingName) {
            return;
        }

        const artwork = artworkBases[artworkName];

        if (!artwork) {
            console.error(`Unknown artwork base: ${artworkName}`);
            return;
        }

        const image = artwork.markings[markingName];

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

    function renderIcon(canvas, traits, options = {}) {
        const artworkName = options.artwork || "default";
        const coatColor = traits.coatShade || chooseCoatColor(traits.base);

        const patternName = traits.pattern === "tabby"
            ? "tabby"
            : null;

        const artwork = artworkBases[artworkName];

        // give time for art to load before returning default
        if (!artwork) {
            console.error(`Unknown artwork: ${artworkName}`);
            return;
        }

        const images = [
            artwork.base,
            artwork.silhouette,
            artwork.eyes.left,
            artwork.eyes.right
        ];

        const allLoaded = images.every(
            image => image.complete && image.naturalWidth > 0
        );

        if (!allLoaded) {
            const retry = () => renderIcon(canvas, traits, options);

            images.forEach(image => {
                if (!image.complete) {
                    image.addEventListener("load", retry, { once: true });
                }
            });

            return;
        }

        renderBase(canvas, coatColor, patternName, artworkName);
        renderMarkings(canvas, traits.whiteMarking, artworkName);
        renderEyes(canvas, traits.eyeColor, traits.rightEyeColor, artworkName);
        // Draw outline on top of markings
        const ctx = canvas.getContext("2d");
        ctx.drawImage(artworkBases[artworkName].base, 0, 0);

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

    function renderCat(canvas, traits, options = {}) {
        const artworkName = options.artwork || "default";
        const coatColor = traits.coatShade || chooseCoatColor(traits.base);

        const patternName = traits.pattern === "tabby"
            ? "tabby"
            : null;

        // Wait until the base and silhouette images are loaded.
        const artwork = artworkBases[artworkName];

        if (!artwork) {
            console.error(`Unknown artwork: ${artworkName}`);
            return;
        }

        const images = [
            artwork.base,
            artwork.silhouette,
            artwork.eyes.left,
            artwork.eyes.right
        ];

        const allLoaded = images.every(
            image => image.complete && image.naturalWidth > 0
        );

        if (!allLoaded) {
            const retry = () => renderCat(canvas, traits, options);

            images.forEach(image => {
                if (!image.complete) {
                    image.addEventListener("load", retry, { once: true });
                }
            });

            return;
        }

        renderBase(canvas, coatColor, patternName, artworkName);
        renderMarkings(canvas, traits.whiteMarking, artworkName);
        renderEyes(canvas, traits.eyeColor, traits.rightEyeColor, artworkName);
        // Draw outline on top of markings
        const ctx = canvas.getContext("2d");
        ctx.drawImage(artworkBases[artworkName].base, 0, 0);
    }

    function renderBase(
        canvas,
        coatColor = "#808080",
        patternName = null,
        artworkName = "default"
    ) {
        const artwork = artworkBases[artworkName];

        if (!artwork) {
            console.error(`Unknown artwork base: ${artworkName}`);
            return;
        }

        const base = artwork.base;
        const silhouette = artwork.silhouette;

        if (!base.complete || !base.naturalWidth ||
            !silhouette.complete || !silhouette.naturalWidth) {
            console.warn(`Artwork is not loaded yet: ${artworkName}`);
            return;
        }

        const ctx = canvas.getContext("2d");

        const coatCanvas = document.createElement("canvas");
        coatCanvas.width = silhouette.naturalWidth;
        coatCanvas.height = silhouette.naturalHeight;

        const coatCtx = coatCanvas.getContext("2d");

        coatCtx.drawImage(silhouette, 0, 0);

        coatCtx.globalCompositeOperation = "source-in";
        coatCtx.fillStyle = coatColor;
        coatCtx.fillRect(0, 0, coatCanvas.width, coatCanvas.height);

        coatCtx.globalCompositeOperation = "source-over";

        canvas.width = base.naturalWidth;
        canvas.height = base.naturalHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.drawImage(coatCanvas, 0, 0);

        const patterns = artwork.patterns;

        if (patternName && patterns[patternName]) {
            const pattern = patterns[patternName];

            if (pattern.complete && pattern.naturalWidth > 0) {
                ctx.drawImage(pattern, 0, 0, canvas.width, canvas.height);
            }
        }

        ctx.drawImage(base, 0, 0);
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

    // ART LOADERS //
    // adult shorthair
    loadArtworkBase("sh-adult",
        "assets/cats/body/cat-base.png",
        "assets/cats/body/cat-silhouette.png"
    );
    loadArtworkEyes(
        "sh-adult",
        "assets/cats/eyes/left-eye.png",
        "assets/cats/eyes/right-eye.png"
    );
    loadArtworkPattern("sh-adult",
        "tabby",
        "assets/cats/patterns/tabby.png"
    );
    loadArtworkMarking("sh-adult",
        "bootfl",
        "assets/cats/markings/bootfl.png"
    );
    loadArtworkMarking("sh-adult",
        "maskmantle",
        "assets/cats/markings/maskmantle.png"
    );
    loadArtworkMarking("sh-adult",
        "piebald",
        "assets/cats/markings/piebald.png"
    );
    loadArtworkMarking("sh-adult",
        "van",
        "assets/cats/markings/van.png"
    );
    loadArtworkMarking("sh-adult",
        "van-2",
        "assets/cats/markings/van2.png"
    );
    loadArtworkMarking("sh-adult",
        "mustache",
        "assets/cats/markings/stache.png"
    );
    loadArtworkMarking("sh-adult",
        "sansa",
        "assets/cats/markings/sansa.png"
    );
    loadArtworkMarking("sh-adult",
        "winter",
        "assets/cats/markings/winter.png"
    );
    loadArtworkMarking("sh-adult",
        "socks-bib",
        "assets/cats/markings/socks-bib.png"
    );
    loadArtworkMarking("sh-adult",
        "tuxedo",
        "assets/cats/markings/tuxedo.png"
    );
    loadArtworkMarking("sh-adult",
        "socks-full",
        "assets/cats/markings/socks-full.png"
    );
    loadArtworkMarking("sh-adult",
        "white",
        "assets/cats/markings/white.png"
    );

    // PLACEHOLDER shorthair apprentice
    // adult shorthair
    loadArtworkBase("sh-adult",
        "assets/cats/body/cat-base.png",
        "assets/cats/body/cat-silhouette.png"
    );
    loadArtworkEyes(
        "sh-adult",
        "assets/cats/eyes/left-eye.png",
        "assets/cats/eyes/right-eye.png"
    );
    loadArtworkPattern("sh-adult",
        "tabby",
        "assets/cats/patterns/tabby.png"
    );
    loadArtworkMarking("sh-adult",
        "bootfl",
        "assets/cats/markings/bootfl.png"
    );
    loadArtworkMarking("sh-adult",
        "maskmantle",
        "assets/cats/markings/maskmantle.png"
    );
    loadArtworkMarking("sh-adult",
        "piebald",
        "assets/cats/markings/piebald.png"
    );
    loadArtworkMarking("sh-adult",
        "van",
        "assets/cats/markings/van.png"
    );
    loadArtworkMarking("sh-adult",
        "van-2",
        "assets/cats/markings/van2.png"
    );
    loadArtworkMarking("sh-adult",
        "mustache",
        "assets/cats/markings/stache.png"
    );
    loadArtworkMarking("sh-adult",
        "sansa",
        "assets/cats/markings/sansa.png"
    );
    loadArtworkMarking("sh-adult",
        "winter",
        "assets/cats/markings/winter.png"
    );
    loadArtworkMarking("sh-adult",
        "socks-bib",
        "assets/cats/markings/socks-bib.png"
    );
    loadArtworkMarking("sh-adult",
        "tuxedo",
        "assets/cats/markings/tuxedo.png"
    );
    loadArtworkMarking("sh-adult",
        "socks-full",
        "assets/cats/markings/socks-full.png"
    );
    loadArtworkMarking("sh-adult",
        "white",
        "assets/cats/markings/white.png"
    );

    // adult longhair
    loadArtworkBase("lh-adult",
        "assets/cats/body/adult-lh-base.png",
        "assets/cats/body/adult-lh-silhouette.png"
    );
    loadArtworkEyes("lh-adult",
        "assets/cats/eyes/adult-lh-l-eye.png",
        "assets/cats/eyes/adult-lh-r-eye.png"
    );
    loadArtworkPattern("lh-adult",
        "tabby",
        "assets/cats/patterns/adult-lh-tabby.png"
    );

    // apprentice longhair
    loadArtworkBase("lh-apprentice",
        "assets/cats/body/app-lh-base.png",
        "assets/cats/body/app-silhouette-lh.png"
    );
    loadArtworkEyes("lh-apprentice",
        "assets/cats/eyes/app-lh-l-eye.png",
        "assets/cats/eyes/app-lh-r-eye.png"
    )
    loadArtworkPattern("lh-apprentice",
        "tabby",
        "assets/cats/patterns/applh-tabby.png"
    );
    loadArtworkMarking("lh-apprentice",
        "maskmantle",
        "assets/cats/markings/lh-app-maskmantle.png"
    );

    return {
        initialize,
        chooseCoatColor,
        loadArtworkBase,
        loadArtworkPattern,
        loadArtworkMarking,
        loadArtworkEyes,
        renderEyes,
        renderMarkings,
        renderBase,
        renderCat,
        renderIcon,
        loadPattern,
        renderCoat
    };
})();