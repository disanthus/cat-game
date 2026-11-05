/* clan prototype
   One-file simulation engine: original lore, local-only save, simplified Mendelian genetics.
   This is a playable foundation, not a biologically complete feline genetics simulator. */
(() => {
    "use strict";

    const SAVE_KEY = "winterclan-save-v1";
    const catSuspicion = new Map();

    // Suspicion
    function addSuspicion(cat, amount = 1) {
        if (!cat) return 0;

        const current = catSuspicion.get(cat.id) || 0;
        const updated = clamp(current + amount, 0, 5);

        catSuspicion.set(cat.id, updated);

        return updated;
    }

    // Initialize NPC behavior
    function initializeNpcAI() {
        if (!window.NPC) {
            console.error("npc-ai.js has not loaded correctly.");
            return false;
        }

        window.NPC.initialize({
            getState: () => state,
            livingCats,
            clamp,
            rand,
            pick,
            chance,
            setRelationship,
            relationship,
            canBecomeNaturalMates,
            recordCatEvent,
            logEvent,
            showNotice,
            canHaveCrush,
            isProneToOutsideCrushes,
            addCrush,
            addSuspicion,
            updateBestFriendship,
            updateRivalry,
            seasonName,
            advanceMoon,
            tryGenerateGossip,
            LOCATIONS
        });

        return true;
    }

    function initializeRelationships() {
        if (!window.Relationships) {
            console.error("relationships.js has not loaded correctly.");
            return false;
        }

        window.Relationships.initialize({
            clamp,
            shareCrushOnSameCat,
            recordCatEvent
        });

        return true;
    }

    // Initialize social reactions module
    function initializeSocialReactions() {
        if (!window.SocialReactions) {
            console.error("social-reactions.js has not loaded correctly.")
            return false;
        }

        window.SocialReactions.initialize({
            jealousyAdmiration,
            setJealousyAdmiration,
            adjustJealousyAdmiration,
            relationship,
            shareCrushOnSameCat,
            cats: () => livingCats()
        });

        livingCats().forEach(cat => {
            if (!cat.relationships) {
                cat.relationships = {};
            }

            if (
                !cat.relationships.jealousyAdmiration ||
                typeof cat.relationships.jealousyAdmiration !== "object"
            ) {
                cat.relationships.jealousyAdmiration = {};
            }
        });

        return true;
    }

    // Initialize gossip module 
    function initializeGossip() {
        if (!window.Gossip) {
            console.error("gossip.js has not loaded correctly.");
            return false;
        }

        window.Gossip.initialize({
            livingCats,
            pick,
            chance,
            shareCrushOnSameCat,
            createCrushRivalry
        });

        return true;
    }

    // Memories
    function rememberEvent(cat, event, details = {}) {
        if (!cat) return;

        if (!Array.isArray(cat.memories)) {
            cat.memories = [];
        }

        const importance = details.importance ?? 1;

        cat.memories.push({
            day: state?.day ?? 1,
            event,
            importance,
            emotionalIntensity: importance * 25,
            ...details
        });

        // Keep up to 100 memories, removing the oldest
        // non-life-changing memory first when necessary.
        while (cat.memories.length > 100) {
            const removableIndex = cat.memories.findIndex(
                memory => (memory.importance ?? 1) < 4
            );

            if (removableIndex === -1) break;

            cat.memories.splice(removableIndex, 1);
        }
    }

    // Memory helper 
    function updateMemoryFeelings() {
        if (!state || !Array.isArray(state.cats)) return;

        for (const cat of state.cats) {
            if (!Array.isArray(cat.memories)) continue;

            for (const memory of cat.memories) {
                const importance = memory.importance ?? 1;

                // Initialize tracking for older memories.
                if (memory.emotionalIntensity === undefined) {
                    memory.emotionalIntensity = importance * 25;
                }

                if (memory.lastUpdatedDay === undefined) {
                    memory.lastUpdatedDay = memory.day ?? state.day ?? 1;
                }

                const currentDay = state.day ?? 1;
                const elapsedDays = Math.max(
                    0,
                    currentDay - memory.lastUpdatedDay
                );

                if (elapsedDays === 0) continue;

                let fadeRate = 0.15 / importance;

                // Personality affects how quickly feelings fade.
                if (cat.personality === "loyal") {
                    fadeRate *= 0.75;
                }

                if (cat.personality === "observant") {
                    fadeRate *= 0.80;
                }

                if (cat.personality === "playful") {
                    fadeRate *= 1.30;
                }

                if (cat.personality === "bold") {
                    fadeRate *= 1.20;
                }

                if (
                    cat.personality === "wary" &&
                    /rejection|embarrassment/i.test(memory.event)
                ) {
                    fadeRate *= 0.65;
                }

                memory.emotionalIntensity = Math.max(
                    0,
                    memory.emotionalIntensity - elapsedDays * fadeRate
                );

                memory.lastUpdatedDay = currentDay;
            }
        }
    }


    // Record events for involved cats
    function recordCatEvent(event, participants, details = {}) {
        const cats = participants.filter(Boolean);
        if (cats.length === 0) return;

        const eventId = `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const day = state?.day ?? 1;

        for (const cat of cats) {
            const others = cats.filter(other => other.id !== cat.id);

            rememberEvent(cat, event, {
                ...details,
                eventId,
                participants: others.map(other => other.id),
                day
            });
        }

        // Participants react emotionally to their shared interactions
        if (event === "friendly_interaction" || event === "disagreement") {
            cats.forEach(cat => {
                cats
                    .filter(other => other.id !== cat.id)
                    .forEach(other => {
                        window.SocialReactions.reactToInteraction(cat, other, event);
                    });
            });
        }

        // Only add a clan log entry when explicitly requested.
        if (details.logToChronicle === true && typeof logEvent === "function") {
            const names = cats.map(cat => cat.name).join(" and ");
            const description = details.description || `${names}: ${event.replaceAll("_", " ")}.`;

            logEvent(event, description);
        }
    }

    // Apply relationship and memory consequences from story choices.
    function applyStoryChoice(choice, participants) {
        if (!choice || !Array.isArray(participants)) return;

        const cats = participants.filter(
            cat => cat && cat.alive !== false
        );

        if (cats.length === 0) return;

        for (const effect of choice.effects || []) {
            if (effect.type === "relationship") {
                // Change the bond between the participating cats.
                for (let i = 0; i < cats.length; i++) {
                    for (let j = i + 1; j < cats.length; j++) {
                        const a = cats[i];
                        const b = cats[j];
                        const current = relationship(a, b);

                        const change =
                            effect.value === "positive" ? 5 :
                                effect.value === "negative" ? -5 : 0;

                        if (change !== 0) {
                            setRelationship(a, b, current + change);
                        }
                    }
                }
            }

            if (effect.type === "memory") {
                const memoryDetails = {
                    importance: 2,
                    description: choice.outcome
                };

                recordCatEvent(
                    effect.value || choice.id,
                    cats,
                    memoryDetails
                );
            }
        }
    }


    const SEASONS = ["Newleaf", "Greenleaf", "Leaf-fall", "Leaf-bare"];
    const RANKS = ["Leader", "Deputy", "Medicine Cat", "Warrior", "Apprentice", "Kit", "Elder"];

    const LOCATIONS = [
        { id: "pinewood", name: "Pinewood Trail", emoji: "🌲", desc: "A familiar path with plenty of cover and small prey.", difficulty: "Easy", risk: 1, prey: [2, 5], skill: "stealth" },
        { id: "river", name: "Glassriver Bend", emoji: "🌊", desc: "A quick river runs between smooth stones. Fish are plentiful, but the current is tricky.", difficulty: "Moderate", risk: 2, prey: [3, 6], skill: "swimming" },
        { id: "ridge", name: "Windcut Ridge", emoji: "⛰️", desc: "An exposed ridge where sharp eyes and steady paws matter.", difficulty: "Hard", risk: 3, prey: [1, 4], skill: "stamina" },
        { id: "ruins", name: "Old Twoleg Ruins", emoji: "🪨", desc: "Strange scents, hidden spaces, and the occasional useful discovery.", difficulty: "Moderate", risk: 2, prey: [0, 2], skill: "curiosity" },
        { id: "moonpool", name: "Moonpool Hollow", emoji: "🌙", desc: "A quiet hollow where the clan leaves offerings and listens to old stories.", difficulty: "Story", risk: 1, prey: [0, 0], skill: "intuition" },
        { id: "bramble", name: "Bramble Maze", emoji: "🍂", desc: "Dense thorn tunnels make this a good test of patience and agility.", difficulty: "Hard", risk: 3, prey: [1, 4], skill: "agility" }
    ];

    const NAMES = {
        prefixes: ["Ash", "Bracken", "Cinder", "Dapple", "Dawn", "Fern", "Frost", "Hazel", "Hollow", "Juniper", "Moss", "Moth", "Oak", "Owl", "Pebble", "Raven", "Reed", "Rowan", "Sedge", "Shade", "Thistle", "Willow", "Wren", "Yarrow", "Birch", "Cloud", "Flint", "Lark"],
        suffixes: [
            "fang", "strike", "blaze", "storm", "heart",
            "bloom", "flower", "shine", "fern", "fur",
            "pelt", "leap", "step", "flight", "cliff",
            "wind", "gaze", "ear", "nose", "shadow",
            "shade", "mist", "whisper", "pool", "brook",
            "stream", "stone", "tooth", "bite", "chaser",
            "branch", "claw", "cloud", "dapple", "fall",
            "frost", "leaf", "song", "tail", "throat",
            "whisker", "wing", "root", "thorn"
        ]
    };

    const PERSONALITIES = [
        "bold",
        "gentle",
        "curious",
        "patient",
        "helpful",
        "wary",
        "playful",
        "proud",
        "observant",
        "stubborn",
        "loyal",
        "ambitious"
    ];

    const COLORS = {
        black: { label: "black", hex: "#4a4b4a" },
        chocolate: { label: "chocolate", hex: "#775747" },
        blue: { label: "blue-gray", hex: "#8a9698" },
        lilac: { label: "lilac-gray", hex: "#b2a4a8" },
        red: { label: "red", hex: "#c7804b" },
        cream: { label: "cream", hex: "#e8d5a7" },
        white: { label: "white", hex: "#eeeade" }
    };

    const $ = (id) => document.getElementById(id);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const chance = (p) => Math.random() < p;
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    const escapeHtml = (value) =>
        String(value).replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[c]));

    let state;
    let selectedCatId = null;
    let selectedView = "camp";
    let noticeTimer;

    function ageLabel(months) {
        if (months < 6) return `${months} moon${months === 1 ? "" : "s"} old`;
        if (months < 12) return `${months} moons old`;

        const years = Math.floor(months / 12);
        const rest = months % 12;

        return `${years} year${years === 1 ? "" : "s"}${rest ? `, ${rest} moon${rest === 1 ? "" : "s"}` : ""}`;
    }

    function randomGenes() {
        const choosePair = (dominant, recessive, carrierChance = .35) => {
            const roll = Math.random();

            if (roll < .35) return [dominant, dominant];
            if (roll < .35 + carrierChance) return [dominant, recessive];

            return [recessive, recessive];
        };

        return {
            // B = black-based, b = chocolate-based
            B: choosePair("B", "b", .4),

            // D = dense pigment, d/d produces a diluted color
            D: choosePair("D", "d", .35),

            // L = short fur, l/l = long fur
            L: choosePair("L", "l", .35),

            // S = white spotting tendency
            S: choosePair("S", "s", .45),

            // A = tabby/agouti; a/a = solid
            A: choosePair("A", "a", .45),

            // W = simplified warm-pigment modifier
            W: choosePair("W", "w", .25)
        };
    }

    function phenotype(genes) {
        const homo = (locus, allele) =>
            genes[locus].every(a => a === allele);

        const has = (locus, allele) =>
            genes[locus].includes(allele);

        let base;

        if (homo("W", "W")) base = "cream";
        else if (has("W", "W")) base = "red";
        else if (homo("B", "b")) {
            base = homo("D", "d") ? "lilac" : "chocolate";
        } else {
            base = homo("D", "d") ? "blue" : "black";
        }

        const pattern = has("A", "A") ? "tabby" : "solid";

        const fur = homo("L", "l") ? "long" : "short";

        // S = white spotting
        let whiteAmount;

        if (homo("S", "S")) {
            whiteAmount = "high white";
        } else if (has("S", "s")) {
            // Use the genes to choose a consistent result.
            whiteAmount = genes["B"].filter(a => a === "B").length === 1
                ? "low white"
                : "white markings";
        } else {
            whiteAmount = "no white";
        }

        return { base, pattern, fur, whiteAmount };
    }

    function catEmoji(cat) {
        const p = phenotype(cat.genes);

        if (p.base === "white" || p.whiteAmount === "high white") return "🐈";

        return cat.sex === "female" ? "🐈" : "🐈‍⬛";
    }

    // Name prefixes based on base fur color
    // Or by white amount
    function chooseCatPrefix(cat) {
        const p = phenotype(cat.genes);

        const prefixesByColor = {
            black: ["Shadow", "Night", "Raven", "Crow"],
            chocolate: ["Cocoa", "Chestnut", "Bramble", "Russet"],
            blue: ["Ash", "Silver", "Smoke", "Storm"],
            lilac: ["Misty", "Dove", "Heather", "Cloud"],
            red: ["Ember", "Flame", "Fox", "Rust"],
            cream: ["Honey", "Dawn", "Amber", "Sun"],
        };

        const prefixWhite = {
            "white markings": ["Patch", "Spotted", "Moss", "Lichen"],
            "high white": ["Snow", "Frost", "Cloud", "Pale", "White", "Bright"]
        };

        const choices = prefixWhite[p.whiteAmount]
            || prefixesByColor[p.base]
            || ["Willow", "Bramble", "Fern", "Moss"];

        return choices[Math.floor(Math.random() * choices.length)];
    }

    // Warrior suffixes with personality and skill weights
    // Keep consistent with names at the top
    function chooseWarriorSuffix(cat) {
        const weights = {
            fang: 1,
            strike: 1,
            blaze: 1,
            storm: 1,
            heart: 1,
            bloom: 1,
            flower: 1,
            shine: 1,
            fern: 1,
            fur: 1,
            pelt: 1,
            leap: 1,
            step: 1,
            flight: 1,
            cliff: 1,
            wind: 1,
            gaze: 1,
            ear: 1,
            nose: 1,
            shadow: 1,
            shade: 1,
            mist: 1,
            whisper: 1,
            pool: 1,
            brook: 1,
            stream: 1,
            stone: 1,
            tooth: 1,
            bite: 1,
            chaser: 1,
            branch: 1,
            claw: 1,
            cloud: 1,
            dapple: 1,
            fall: 1,
            frost: 1,
            leaf: 1,
            song: 1,
            tail: 1,
            throat: 1,
            whisker: 1,
            wing: 1
        };

        // Personality makes certain suffixes more likely.
        const personalityNames = {
            bold: ["claw", "fang", "strike", "blaze", "storm", "tooth", "bite", "chaser"],
            ambitious: ["claw", "fang", "strike", "blaze", "storm", "flight", "cliff", "wing"],
            gentle: ["bloom", "flower", "shine", "fern", "fur", "pelt", "heart", "leaf"],
            curious: ["leap", "step", "flight", "wind", "nose", "brook", "stream", "cloud"],
            observant: ["gaze", "ear", "nose", "shadow", "mist", "dapple", "whisker"],
            playful: ["leap", "shine", "bloom", "tail", "wing", "fall", "song"],
            loyal: ["heart", "bloom", "fern", "flower", "branch", "root"],
            stubborn: ["claw", "fang", "cliff", "storm", "stone", "tooth", "thorn"],
            wary: ["shadow", "shade", "mist", "whisper", "wind", "nose", "ear"],
            patient: ["stone", "heart", "step", "pool", "brook", "stream", "leaf"],
            helpful: ["heart", "bloom", "fern", "branch", "flower", "shine"],
            proud: ["blaze", "claw", "storm", "gaze", "fang", "flight", "shine"]
        };

        for (const suffix of personalityNames[cat.personality] || []) {
            weights[suffix] = (weights[suffix] || 1) + 3;
        }

        // Strong skills make related suffixes more likely.
        const skillNames = {
            fighting: ["claw", "fang", "strike", "bite", "tooth", "storm", "blaze"],
            hunting: ["fang", "chaser", "strike", "claw", "bite", "shadow", "gaze"],
            stealth: ["shadow", "shade", "whisper", "mist", "wind", "flight"],
            healing: ["heart", "bloom", "flower", "fern", "pool", "leaf", "shine"],
            climbing: ["cliff", "leap", "step", "stone", "branch", "wing"],
            agility: ["flight", "leap", "wind", "step", "tail", "wing"],
            swimming: ["pool", "brook", "stream", "mist"],
            stamina: ["storm", "stone", "heart", "fur", "pelt"],
            curiosity: ["flight", "wind", "shine", "gaze", "nose", "ear", "dapple", "cloud"]
        };

        for (const [skill, suffixes] of Object.entries(skillNames)) {
            if ((cat.skills[skill] || 0) >= 7) {
                for (const suffix of suffixes) {
                    weights[suffix] = (weights[suffix] || 1) + 3;
                }
            }
        }

        // Randomly select a suffix, weighted by personality and skills.
        const entries = Object.entries(weights);
        const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
        let roll = Math.random() * total;

        for (const [suffix, weight] of entries) {
            roll -= weight;
            if (roll < 0) return suffix;
        }

        return "heart";
    }

    function makeCat(overrides = {}) {
        const sex = overrides.sex || pick(["female", "male"]);
        const age = overrides.age ?? rand(12, 48);
        const genes = overrides.genes || randomGenes();
        const traits = phenotype(genes);
        const coatShade = overrides.coatShade || CatRenderer.chooseCoatColor(traits.base);
        const whiteMarking = overrides.whiteMarking ?? (() => {
            const variants = {
                "no white": [null],
                "low white": ["socks-full", "socks-bib", "sansa", "bootfl"],
                "white markings": ["winter", "tuxedo", "maskmantle"],
                "high white": ["white", "van", "winter", "van-2", "mustache", "piebald"]
            };

            return pick(variants[traits.whiteAmount] || [null]);
        })();

        const eyeColors = ["blue", "green", "amber", "gold", "copper"];

        // Choose a random eye color for the cat.
        const eyeColor = overrides.eyeColor || pick(eyeColors);

        // Most cats have matching eyes; some have heterochromia.
        const otherEyeColor = overrides.rightEyeColor ||
            (Math.random() < 0.15
                ? pick(eyeColors.filter(color => color !== eyeColor))
                : eyeColor);

        const role = overrides.rank ||
            (age < 6 ? "Kit" : age < 12 ? "Apprentice" : "Warrior");

        return {
            id: overrides.id || `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: overrides.name || `${pick(NAMES.prefixes)}${(overrides.age ?? 0) < 6 ? "kit" : (overrides.age ?? 0) < 12 ? "paw" : pick(NAMES.suffixes)}`,
            sex,
            age,
            rank: role,
            eyeColor,
            rightEyeColor: otherEyeColor,
            mentorId: overrides.mentorId || null,
            genes,
            coatShade,
            whiteMarking,
            personality: overrides.personality || pick(PERSONALITIES),
            attractionToMales: overrides.attractionToMales ?? rand(0, 100),
            attractionToFemales: overrides.attractionToFemales ?? rand(0, 100),

            skills: {
                hunting: rand(1, 5),
                fighting: rand(1, 5),
                stealth: rand(1, 5),
                healing: rand(0, 3),
                swimming: rand(0, 3),
                climbing: rand(1, 5),
                agility: rand(1, 5),
                stamina: rand(1, 5),
                curiosity: rand(1, 5),
                intuition: rand(1, 5),
                ...(overrides.skills || {})
            },

            preferences: overrides.preferences || {
                favoriteActivity: pick([
                    "hunting",
                    "exploring",
                    "training",
                    "socializing",
                    "leisuring",
                    "mischief",
                    "being alone"
                ]),
                favoriteLocation: pick(LOCATIONS).id,
                sociability: rand(1, 10),
                courage: rand(1, 10),
                independence: rand(1, 10)
            },

            health: overrides.health ?? 100,
            energy: overrides.energy ?? rand(65, 100),
            hunger: overrides.hunger ?? rand(10, 35),

            // social standing and beliefs from 0-100
            respect: overrides.respect ?? rand(35, 65),
            trust: overrides.trust ?? rand(35, 65),
            faith: overrides.faith ?? rand(35, 65),

            parents: overrides.parents || [],
            bornDay: overrides.bornDay ?? state?.day ?? 1,
            relationships: {
                crushes: [],
                rivals: [],
                bestFriends: [],
                mates: [],
                jealousyAdmiration: {},
                ...(overrides.relationships || {})
            },
            experience: overrides.experience ?? 0,
            alive: true,
            notes: overrides.notes || [],
            memories: overrides.memories || []
        };
    }

    function genesFromCreator(color, pattern, fur, white) {
        return {
            B: color === "chocolate" || color === "lilac"
                ? ["b", "b"] : ["B", "B"],

            D: color === "blue" || color === "lilac"
                ? ["d", "d"] : ["D", "D"],

            L: fur === "long" ? ["l", "l"] : ["L", "L"],

            S: white === "high"
                ? ["S", "S"]
                : white === "some" ? ["S", "s"] : ["s", "s"],

            A: pattern === "solid" ? ["a", "a"] : ["A", "a"],

            W: color === "red"
                ? ["W", "w"]
                : color === "cream" ? ["W", "W"] : ["w", "w"]
        };
    }

    function createPlayerCat(event) {
        event.preventDefault();

        const form = new FormData(event.currentTarget);
        const age = Number(form.get("age"));
        const name = String(form.get("name") || "").trim();
        console.log("Selected pattern:", form.get("pattern"));
        const cat = makeCat({
            name: name || undefined,
            sex: String(form.get("sex")),
            age,
            rank: age < 6 ? "Kit" : age < 12 ? "Apprentice" : "Warrior",
            personality: String(form.get("personality")),
            eyeColor: String(form.get("leftEye") || "blue"),
            rightEyeColor: form.get("rightEye") === "same"
                ? String(form.get("leftEye") || "blue")
                : String(form.get("rightEye") || "blue"),
            genes: genesFromCreator(
                String(form.get("color")),
                String(form.get("pattern")),
                String(form.get("fur")),
                String(form.get("white"))
            ),
            health: 100,
            energy: 90,
            hunger: 15

        });
        console.log("Created cat genes:", cat.genes);
        console.log("Created cat phenotype:", phenotype(cat.genes));
        state.cats.push(cat);
        state.playerCatId = cat.id;
        selectedCatId = cat.id;

        cat.notes.push("This is where their story in WinterClan begins.");

        logEvent(
            "cat",
            `${cat.name} arrived in WinterClan and began a new life among the clan.`
        );

        $("creatorOverlay").classList.remove("open");
        saveGame(false);
        render();
        showNotice(`Welcome to WinterClan, ${cat.name}. Your story begins today.`);
    }

    function initialState() {
        state = {
            day: 1,
            moon: 1,
            dayOfMoon: 1,
            seasonIndex: 0,
            prey: 9000,
            clanName: "WinterClan",
            cats: [],
            log: [],
            playerCatId: null,
            nextBirthNumber: 1,
            version: 1
        };

        const founderData = [
            {
                name: "Bramblestar",
                sex: "female",
                age: 48,
                rank: "Leader",
                personality: "patient",
                genes: {
                    B: ["B", "b"], D: ["D", "d"], L: ["L", "l"],
                    S: ["S", "s"], A: ["A", "a"], W: ["w", "w"]
                }
            },
            {
                name: "Mothfern",
                sex: "female",
                age: 35,
                rank: "Medicine Cat",
                personality: "observant",
                genes: {
                    B: ["B", "B"], D: ["D", "D"], L: ["l", "l"],
                    S: ["s", "s"], A: ["A", "a"], W: ["w", "w"]
                }
            },
            {
                name: "Flintstep",
                sex: "male",
                age: 30,
                rank: "Deputy",
                personality: "bold",
                genes: {
                    B: ["B", "b"], D: ["D", "D"], L: ["L", "l"],
                    S: ["s", "s"], A: ["a", "a"], W: ["w", "w"]
                }
            },
            {
                name: "Willowshade",
                sex: "female",
                age: 24,
                rank: "Warrior",
                personality: "gentle",
                genes: {
                    B: ["b", "b"], D: ["D", "d"], L: ["l", "l"],
                    S: ["S", "s"], A: ["A", "A"], W: ["w", "w"]
                }
            },
            {
                name: "Rookclaw",
                sex: "male",
                age: 26,
                rank: "Warrior",
                personality: "stubborn",
                genes: {
                    B: ["B", "b"], D: ["d", "d"], L: ["L", "L"],
                    S: ["s", "s"], A: ["A", "a"], W: ["w", "w"]
                }
            },
            { name: "Sedgepaw", sex: "female", age: 9, rank: "Apprentice", personality: "curious" },
            { name: "Firekit", sex: "male", age: 3, rank: "Kit", personality: "playful" },
            { name: "Duskwhisker", sex: "female", age: 60, rank: "Elder", personality: "wary" }
        ];

        founderData.forEach(d => state.cats.push(makeCat(d)));

        state.playerCatId = state.cats.find(c => c.name === "Willowshade").id;

        setRelationship(state.cats[0], state.cats[2], 45);
        setRelationship(state.cats[2], state.cats[0], 45);
        setRelationship(state.cats[3], state.cats[4], 18);
        setRelationship(state.cats[4], state.cats[3], 18);

        logEvent("lore", "Bramblestar gathered the clan beneath the cedar boughs. The season of Newleaf has begun.");
        logEvent("clan", "Mothfern says the old stories speak of a pale star appearing above the Moonpool when the clan must change.");
        logEvent("cat", "Your new cat will soon begin their life in WinterClan.");

        return state;
    }

    function setRelationship(a, b, value) {
        return window.Relationships.setRelationship(a, b, value);
    }

    function reactToMateDrama(mate, partner, crush) {
        if (!mate || !partner || !crush) return "";

        const mates = mate.relationships?.mates || [];
        const crushes = partner.relationships?.crushes || [];

        if (!mates.includes(partner.id)) return "";
        if (!crushes.includes(crush.id)) return "";

        const currentBond = relationship(mate, partner);
        const jealousyLoss = rand(3, 8);

        setRelationship(mate, partner, currentBond - jealousyLoss);

        return `${mate.name} feels jealous after learning ${partner.name} may have feelings for ${crush.name}. Their bond weakened.`;
    }

    function relationship(a, b) {
        return window.Relationships.relationship(a, b);
    }

    function jealousyAdmiration(a, b) {
        return window.Relationships.jealousyAdmiration(a, b);
    }

    function setJealousyAdmiration(a, b, value) {
        return window.Relationships.setJealousyAdmiration(a, b, value);
    }

    function adjustJealousyAdmiration(a, b, amount) {
        return window.Relationships.adjustJealousyAdmiration(a, b, amount);
    }

    function jealousyAdmirationLabel(value) {
        return window.Relationships.jealousyAdmirationLabel(value);
    }

    function getCat(id) {
        return state.cats.find(c => c.id === id && c.alive);
    }

    function livingCats() {
        return state.cats.filter(c => c.alive);
    }

    function selectedCat() {
        return getCat(selectedCatId || state.playerCatId) || livingCats()[0];
    }

    function playerCat() {
        return getCat(state.playerCatId) || selectedCat();
    }

    function logEvent(type, text) {
        state.log.unshift({
            day: state.day,
            season: SEASONS[state.seasonIndex],
            type,
            text
        });

        if (state.log.length > 120) state.log.length = 120;
    }

    function showNotice(text) {
        $("notice").textContent = text;

        clearTimeout(noticeTimer);
        $("notice").classList.add("notice-pop");

        noticeTimer = setTimeout(
            () => $("notice").classList.remove("notice-pop"),
            500
        );
    }

    function seasonName() {
        return SEASONS[state.seasonIndex];
    }

    function currentDate() {
        return `${seasonName()} · Day ${state.day}`;
    }

    function prettyTrait(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function geneText(genes, locus) {
        return genes[locus].join("");
    }

    function geneDescription(cat) {
        const p = phenotype(cat.genes);
        return `${p.base} ${p.pattern}, ${p.fur} fur, ${p.whiteAmount}`;
    }

    function catColor(cat) {
        const p = phenotype(cat.genes);

        if (p.whiteAmount === "high white") return "#e8e5d8";

        return COLORS[p.base]?.hex || "#b2a4a8";
    }

    function render() {
        $("seasonLabel").textContent = currentDate();
        $("foodLabel").textContent = `Prey: ${state.prey}`;

        renderStats();
        renderCamp();
        renderRoster();
        renderBreeding();
        renderTerritory();
        renderChronicle();
    }

    function renderStats() {
        const cats = livingCats();
        const kits = cats.filter(c => c.rank === "Kit").length;
        const adults = cats.filter(c => c.age >= 12).length;

        const avgHealth = cats.length
            ? Math.round(cats.reduce((n, c) => n + c.health, 0) / cats.length)
            : 0;

        const stats = [
            ["Living cats", cats.length, `${kits} kit${kits === 1 ? "" : "s"} in camp`],
            ["Clan prey", state.prey, state.prey < 6 ? "Food stores are low" : "Enough for now"],
            ["Clan morale", moraleScore(), "Based on bonds and wellbeing"],
            ["Average health", `${avgHealth}%`, `${adults} adult cats`]
        ];

        $("statsGrid").innerHTML = stats.map(([label, value, foot]) =>
            `<div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        <div class="stat-foot">${foot}</div>
      </div>`
        ).join("");
    }

    function moraleScore() {
        const cats = livingCats();

        if (!cats.length) return 0;

        let sum = 0;
        let pairs = 0;

        for (let i = 0; i < cats.length; i++) {
            for (let j = i + 1; j < cats.length; j++) {
                sum += relationship(cats[i], cats[j]);
                pairs++;
            }
        }

        const bond = pairs ? sum / pairs : 0;
        const health = cats.reduce((n, c) => n + c.health, 0) / cats.length;

        return `${Math.round(clamp(55 + bond * .18 + (health - 70) * .35, 0, 100))}%`;
    }
    function renderCamp() {
        const cats = livingCats();

        $("campGreeting").textContent = state.day === 1
            ? "The forest is waking."
            : `${seasonName()} brings another day.`;

        $("campSummary").textContent =
            `${state.clanName} has ${cats.length} living cats. The camp is quiet for now, but every cat carries a story.`;

        $("campEvents").innerHTML = state.log.slice(0, 5).map(eventHtml).join("") ||
            `<p class="empty-state">A quiet day in camp.</p>`;

        const c = selectedCat();

        $("selectedCatCard").innerHTML = c
            ? miniProfileHtml(c)
            : `<p class="empty-state">No cats remain.</p>`;
    }

    function renderChronicle() {
        $("chronicleList").innerHTML = state.log
            .map(event => `
                    <div class="event-item">
                        <span class="event-dot"></span>
                        <div>
                            ${escapeHtml(event.text)}
                            <small>
                                ${escapeHtml(event.season)} - Day ${event.day} - ${escapeHtml(event.type)}
                            </small>
                        </div>
                    </div>
                `)
            .join("") || `<p class="empty-state">No clan history yet!</p>`;
    }

    function eventHtml(e) {
        return `<div class="event-item">
      <span class="event-dot"></span>
      <div>
        ${escapeHtml(e.text)}
        <small>${escapeHtml(e.season)} · Day ${e.day} · ${escapeHtml(e.type)}</small>
      </div>
    </div>`;
    }

    function miniProfileHtml(c) {
        return `<div class="profile-header">
      <canvas id="profileCatCanvas" class="profile-avatar"></canvas>
      <div>
        <div class="profile-name">${escapeHtml(c.name)}</div>
        <div class="profile-meta">${escapeHtml(c.rank)} · ${ageLabel(c.age)}</div>
        <div class="tag-row">
          <span class="tag">${escapeHtml(c.personality)}</span>
          <span class="tag">${escapeHtml(geneDescription(c))}</span>
        </div>
      </div>
    </div>
    <p class="muted">${escapeHtml(catBio(c))}</p>
    <button class="button small" data-open-cat="${c.id}">View full profile</button>`;
    }

    function catBio(c) {
        const p = phenotype(c.genes);

        return `${c.name} is a ${c.personality} cat with ${p.base} ${p.pattern} markings and ${p.fur} fur. ${c.notes[c.notes.length - 1] || "Their story is still unfolding."
            }`;
    }

    function renderRoster() {
        const filter = $("rankFilter").value;

        const cats = livingCats()
            .filter(c => filter === "all" || c.rank === filter)
            .sort((a, b) =>
                RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) ||
                a.name.localeCompare(b.name)
            );

        $("catCount").textContent = cats.length;

        $("catRoster").innerHTML = cats.map(c =>
            `<button class="cat-row ${c.id === (selectedCatId || state.playerCatId) ? "selected" : ""}" data-select-cat="${c.id}">
        <span class="cat-avatar" style="--fur:${catColor(c)}">${catEmoji(c)}</span>
        <span class="cat-row-info">
          <span class="cat-row-name">${escapeHtml(c.name)}</span>
          <span class="cat-row-sub">${escapeHtml(c.rank)} · ${ageLabel(c.age)}</span>
        </span>
        <span class="cat-row-badge">${c.health < 40 ? "Unwell" : escapeHtml(c.personality)}</span>
      </button>`
        ).join("") || `<p class="empty-state">No cats match this filter.</p>`;

        const c = selectedCat();

        $("catDetails").innerHTML = c
            ? fullProfileHtml(c)
            : `<p class="empty-state">No cats remain.</p>`;

        if (c) {
            const canvas = $("profileCatCanvas");

            if (canvas) {
                const traits = {
                    ...phenotype(c.genes),
                    coatShade: c.coatShade,
                    whiteMarking: c.whiteMarking,
                    eyeColor: c.eyeColor,
                    rightEyeColor: c.rightEyeColor
                };

                const faceCanvas = $("profileCatCanvas");
                const fullCanvas = $("fullProfileCatCanvas");

                if (faceCanvas) {
                    CatRenderer.renderIcon(faceCanvas, traits);
                }

                if (fullCanvas) {
                    CatRenderer.renderCat(fullCanvas, traits);
                }
            }
        }
    }

    function fullProfileHtml(c) {
        const p = phenotype(c.genes);

        const parents = c.parents
            .map(id => getCat(id) || state.cats.find(x => x.id === id))
            .filter(Boolean);

        const rels = Object.entries(c.relationships)
            .filter(([id, val]) => typeof val === "number")
            .map(([id, val]) => ({ cat: getCat(id), val }))
            .filter(x => x.cat)
            .sort((a, b) => b.val - a.val)
            .slice(0, 4);

        const feelings = Object.entries(c.relationships.jealousyAdmiration || {})
            .map(([id, val]) => ({
                cat: getCat(id),
                val
            }))
            .filter(x => x.cat && typeof x.val === "number" && x.val !== 0)
            .sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
            .slice(0, 6);

        const skills = Object.entries(c.skills)
            .filter(([k]) =>
                ["hunting", "fighting", "stealth", "healing", "swimming", "climbing", "agility", "stamina"].includes(k)
            );

        const isPlayer = c.id === state.playerCatId;

        return `<div class="profile-header">
      <div class="profile-illustration">
        <canvas id="fullProfileCatCanvas"></canvas>
      </div>
      <div>
        <div class="profile-name">${escapeHtml(c.name)}</div>
        <div class="profile-meta">${escapeHtml(c.rank)} · ${escapeHtml(c.sex)} · ${ageLabel(c.age)}</div>
        <div class="tag-row">
          <span class="tag">${escapeHtml(c.personality)}</span>
          ${isPlayer ? '<span class="tag">Your viewpoint</span>' : ""}
        </div>
      </div>
    </div>

    <p>${escapeHtml(catBio(c))}</p>

    <div class="action-row">
      <button class="button primary small" data-play-as="${c.id}">
        ${isPlayer ? "Current viewpoint" : "Play as this cat"}
      </button>
      <button class="button small" data-promote="${c.id}">Change rank</button>
    </div>

    ${c.rank === "Apprentice" ? `
    <div class="profile-section">
    <h4>Apprentice Training</h4>
    <p>
      Mentor: ${escapeHtml(
            livingCats().find(m => m.id === c.mentorId)?.name
            || "Unassigned"
        )
                }
    </p>
    <button
      class="button small"
      data-assign-mentor="${c.id}"
    >
      Assign Mentor
    </button>
  </div>
` : ""}

    <div class="profile-section">
      <h4>Wellbeing</h4>
      ${meterHtml("Health", c.health)}
      ${meterHtml("Energy", c.energy)}
      ${meterHtml("Hunger", 100 - c.hunger)}
    </div>

    <div class="profile-section">
        <h4>Standing & Beliefs</h4>
        ${meterHtml("Respect", c.respect ?? 50)}
        ${meterHtml("Trust", c.trust ?? 50)}
        ${meterHtml("Faith", c.faith ?? 50)}
    </div>

    <div class="profile-section">
      <h4>Visible traits</h4>
      <div class="trait-grid">
        ${traitHtml("Left eye", c.eyeColor || "unknown")}
        ${traitHtml("Right eye", c.rightEyeColor || c.eyeColor || "unknown")}
        ${traitHtml("Coat color", p.base)}
        ${traitHtml("Pattern", p.pattern)}
        ${traitHtml("Fur length", p.fur)}
        ${traitHtml("White markings", p.whiteAmount)}
      </div>
    </div>

    <div class="profile-section">
      <h4>Genetic profile <span class="count">Alleles</span></h4>
      <div class="trait-grid">
        ${["B", "D", "L", "S", "A", "W"].map(k =>
                    traitHtml(geneNames[k], geneText(c.genes, k))
                ).join("")}
      </div>
      <p class="fine-print">
        B/b = base pigment · D/d = pigment dilution · L/l = fur length ·
        S/s = white spotting · A/a = agouti/tabby · W/w = warm-pigment modifier.
        This prototype uses simplified independent loci; it does not model every real cat gene or sex-linked inheritance.
      </p>
    </div>

    <div class="profile-section">
      <h4>Skills</h4>
      <div class="trait-grid">
        ${skills.map(([k, v]) =>
                    `<div class="trait">
            <div class="trait-label">${prettyTrait(k)}</div>
            <div class="trait-value">${v}/10</div>
            <div class="meter"><span style="width:${v * 10}%"></span></div>
          </div>`
                ).join("")}
      </div>
    </div>

    <div class="profile-section">
      <h4>Family</h4>
      <p class="muted">
        ${parents.length
                ? `Parents: ${parents.map(p => escapeHtml(p.name)).join(" and ")}`
                : "Parentage unknown or a founding cat."}
      </p>
      <p class="muted">
        Offspring: ${state.cats.filter(x => x.parents.includes(c.id)).map(x => escapeHtml(x.name)).join(", ") || "No known kits."}
      </p>
    </div>

    <div class="profile-section">
      <h4>Relationships</h4>
      ${rels.length
                ? rels.map(r =>
                    `<div class="gene-line">
            <span>${escapeHtml(r.cat.name)}</span>
            <span>${r.val > 0 ? "+" : ""}${r.val} · ${relationshipLabel(r.val)}</span>
          </div>`
                ).join("")
                : `<p class="muted">No notable bonds yet.</p>`}
                </div>
                <div class="profile-section">
                    <h4>Vibes</h4>
                    ${feelings.length
                ? feelings.map(f => `
                            <div class="gene-line"
                            <span>${escapeHtml(f.cat.name)}</span>
                            <span>
                                ${f.val > 0 ? "+" : ""}${f.val} - 
                                ${jealousyAdmirationLabel(f.val)}
                                </span>
                                </div>`).join("")
                : `<p class="muted">No notable feelings towards other cats yet.</p>`
            }
                        </div>
     <div class="profile-section">
      <h4>Mate</h4>
      ${c.relationships.mates
                .map(id => getCat(id))
                .filter(Boolean)
                .map(mate =>
                    `<div class="gene-line">
            <span>${escapeHtml(mate.name)}</span>
            <span>Mate</span>
          </div>`
                ).join("")
            || `<p class="muted">No mates yet.</p>`}
    </div>
     <div class="profile-section">
      <h4>Crushes</h4>
      ${c.relationships.crushes
                .map(id => getCat(id))
                .filter(Boolean)
                .map(crush =>
                    `<div class="gene-line">
            <span>${escapeHtml(crush.name)}</span>
            <span>Has a crush.</span>
          </div>`
                ).join("")
            || `<p class="muted">No crushes yet.</p>`}
    </div>
     
<div class="profile-section">
  <h4>Secret Admirers</h4>
  ${state.cats
                .filter(other =>
                    other.alive &&
                    other.id !== c.id &&
                    other.relationships.crushes.includes(c.id)
                )
                .map(other =>
                    `<div class="gene-line">
            <span>${escapeHtml(other.name)}</span>
            <span>Has a crush on ${escapeHtml(c.name)}</span>
            <button
              class="button small"
              data-reject-crush="${other.id}"
              data-reject-target="${c.id}"
            >
              Reject
            </button>
          </div>`
                ).join("")
            || `<p class="muted">No secret admirers yet.</p>`}
</div>

    
    <div class="profile-section">
      <h4>Best Friends</h4>
      ${c.relationships.bestFriends
                .map(id => getCat(id))
                .filter(Boolean)
                .map(friend =>
                    `<div class="gene-line">
            <span>${escapeHtml(friend.name)}</span>
            <span>Best Friend</span>
          </div>`
                ).join("")
            || `<p class="muted">No best friends yet.</p>`}
    </div>
    
    <div class="profile-section">
      <h4>Rivals</h4>
      ${c.relationships.rivals
                .map(id => getCat(id))
                .filter(Boolean)
                .map(rival =>
                    `<div class="gene-line">
            <span>${escapeHtml(rival.name)}</span>
            <span>Rival</span>
          </div>`
                ).join("")
            || `<p class="muted">No rivals yet.</p>`}
    </div>`;
    }

    const geneNames = {
        B: "Base pigment",
        D: "Dilution",
        L: "Fur length",
        S: "White spotting",
        A: "Tabby/agouti",
        W: "Warm pigment"
    };

    function traitHtml(label, value) {
        return `<div class="trait">
      <div class="trait-label">${escapeHtml(label)}</div>
      <div class="trait-value">${escapeHtml(value)}</div>
    </div>`;
    }

    function meterHtml(label, value) {
        return `<div class="trait-label">${label} · ${Math.round(value)}%</div>
      <div class="meter"><span style="width:${clamp(value, 0, 100)}%"></span></div>`;
    }

    function relationshipLabel(v) {
        return window.Relationships.relationshipLabel(v);
    }

    // Relationship Checkers
    function areBestFriends(a, b) {
        return window.Relationships.areBestFriends(a, b);
    }

    function areRivals(a, b) {
        return window.Relationships.areRivals(a, b);
    }

    function shareCrushOnSameCat(a, b) {
        if (!a || !b || a.id === b.id) {
            return false;
        }

        const aCrushes = a.relationships.crushes || [];
        const bCrushes = b.relationships.crushes || [];

        return aCrushes.some(id =>
            bCrushes.includes(id) &&
            id !== a.id &&
            id !== b.id
        );
    }


    function canHaveCrush(a, b) {
        return Boolean(
            a &&
            b &&
            a.id !== b.id &&
            a.alive &&
            b.alive &&
            a.age >= 12 &&
            b.age >= 12
        );
    }

    function canBecomeMates(a, b) {
        return Boolean(
            a &&
            b &&
            a.id !== b.id &&
            a.alive &&
            b.alive &&
            a.age >= 12 &&
            b.age >= 12 &&
            (!a.relationships.mates.length ||
                a.relationships.mates.includes(b.id)) &&
            (!b.relationships.mates.length ||
                b.relationships.mates.includes(a.id))
        );
    }


    function canBecomeNaturalMates(a, b) {
        return Boolean(
            canBecomeMates(a, b) &&
            (
                a.relationships.crushes.includes(b.id) ||
                b.relationships.crushes.includes(a.id)
            ) &&
            relationship(a, b) >= 40 &&
            relationship(b, a) >= 40
        );
    }

    function isProneToOutsideCrushes(cat) {
        const tendencies = {
            loyal: 0.02,
            helpful: 0.03,
            gentle: 0.05,
            patient: 0.05,
            observant: 0.15,
            curious: 0.20,
            playful: 0.25,
            bold: 0.30,
            proud: 0.35,
            stubborn: 0.30,
            ambitious: 0.25,
            wary: 0.05
        };

        return chance(tendencies[cat.personality] ?? 0.10);
    }

    function addCrush(a, b) {
        if (!canHaveCrush(a, b)) return;

        if (!Array.isArray(a.relationships.crushes)) {
            a.relationships.crushes = [];
        }

        if (!a.relationships.crushes.includes(b.id)) {
            a.relationships.crushes.push(b.id);
        }
    }

    function updateBestFriendship(a, b) {
        return window.Relationships.updateBestFriendship(a, b);
    }

    function updateRivalry(a, b) {
        return window.Relationships.updateRivalry(a, b);
    }

    function createCrushRivalry(a, b, sharedCrush) {
        return window.relationship.createCrushRivalry(a, b, sharedCrush);
    }

    function gamete(alleles) {
        return pick(alleles);
    }

    function inheritGenes(a, b) {
        const genes = {};

        Object.keys(a.genes).forEach(k => {
            genes[k] = [gamete(a.genes[k]), gamete(b.genes[k])];
        });

        return genes;
    }


    function inheritEyeColor(a, b, eyeKey) {
        const parentAColor = a[eyeKey];
        const parentBColor = b[eyeKey];

        const availableColors = [parentAColor, parentBColor]
            .filter(color => typeof color === "string" && color.length > 0);

        if (availableColors.length === 0) {
            return pick(["blue", "green", "amber", "gold", "copper"]);
        }

        return pick(availableColors);
    }

    function expectedRecessive(a, b, locus, recessive) {
        const prob = (alleles, allele) =>
            alleles.filter(x => x === allele).length / 2;

        const pa = prob(a.genes[locus], recessive);
        const pb = prob(b.genes[locus], recessive);

        return `${Math.round(pa * pb * 100)}%`;
    }

    function renderBreeding() {
        const adults = livingCats().filter(c =>
            c.age >= 12 && !["Kit", "Apprentice"].includes(c.rank)
        );

        const aSel = $("parentA");
        const bSel = $("parentB");

        const oldA = aSel.value;
        const oldB = bSel.value;

        const options = adults.map(c =>
            `<option value="${c.id}">${escapeHtml(c.name)} (${c.sex}, ${geneDescription(c)})</option>`
        ).join("");

        aSel.innerHTML = options || `<option value="">No eligible adults</option>`;
        bSel.innerHTML = options || `<option value="">No eligible adults</option>`;

        if (adults.some(c => c.id === oldA)) {
            aSel.value = oldA;
        } else if (adults.some(c => c.id === state.playerCatId)) {
            aSel.value = state.playerCatId;
        }

        if (adults.some(c => c.id === oldB)) {
            bSel.value = oldB;
        } else {
            bSel.value = adults.find(c => c.id !== aSel.value)?.id || aSel.value;
        }

        updateBreedingPreview();

        const litters = state.cats.filter(c => c.parents.length);

        $("familyNotes").innerHTML = litters.length
            ? litters.slice(-8).reverse().map(c =>
                `<div class="event-item">
          <span class="event-dot"></span>
          <div>
            <strong>${escapeHtml(c.name)}</strong> joined the clan.
            <small>
              Parents: ${c.parents.map(id =>
                    state.cats.find(x => x.id === id)?.name || "unknown"
                ).map(escapeHtml).join(" + ")}
              · ${geneDescription(c)}
            </small>
          </div>
        </div>`
            ).join("")
            : `<p class="empty-state">No kits have been born in this playthrough. Your first litter will start the family tree.</p>`;

        $("breedBtn").disabled = adults.length < 2;
    }

    function updateBreedingPreview() {
        const a = getCat($("parentA").value);
        const b = getCat($("parentB").value);

        if (!a || !b) {
            $("breedingPreview").innerHTML =
                `<p class="muted">You need two adult cats to breed.</p>`;
            return;
        }

        if (a.id === b.id) {
            $("breedingPreview").innerHTML = `<p>Please choose two different cats.</p>`;
            return;
        }

        const kin =
            a.parents.includes(b.id) ||
            b.parents.includes(a.id) ||
            a.parents.some(id => b.parents.includes(id));

        $("breedingPreview").innerHTML = `
      <div class="preview-title">Inheritance preview</div>
      <p>${escapeHtml(a.name)} (${geneDescription(a)}) × ${escapeHtml(b.name)} (${geneDescription(b)})</p>
      <div class="gene-line"><span>Long fur (l/l)</span><span>${expectedRecessive(a, b, "L", "l")} chance</span></div>
      <div class="gene-line"><span>Chocolate base (b/b)</span><span>${expectedRecessive(a, b, "B", "b")} chance</span></div>
      <div class="gene-line"><span>Dilution (d/d)</span><span>${expectedRecessive(a, b, "D", "d")} chance</span></div>
      <div class="gene-line"><span>High white (S/S)</span><span>${expectedRecessive(a, b, "S", "S")} chance</span></div>
      <p class="fine-print">${kin
                ? "Family note: these cats appear to be close relatives. Inbreeding tracking and genetic-health consequences are not implemented yet."
                : "Each kitten inherits one allele from each parent at each locus. Litter outcomes are random, so probabilities describe many births, not guarantees."
            }</p>`;
    }

    function breedLitter() {
        const a = getCat($("parentA").value);
        const b = getCat($("parentB").value);

        // Cats must be adult and alive
        if (!a || !b || !a.alive || !b.alive || a.id === b.id || a.age < 12 || b.age < 12) {
            showNotice("Choose two different adult cats who are at least 12 moons old.");
            return;
        }

        // Comphet
        if (a.sex === b.sex) {
            showNotice("A litter requires one male and one female parent.");
            return;
        }


        // Record the parents as mates.
        if (!a.relationships.mates.includes(b.id)) {
            a.relationships.mates.push(b.id);
        }

        if (!b.relationships.mates.includes(a.id)) {
            b.relationships.mates.push(a.id);
        }

        // Clear crushes between these two cats.
        a.relationships.crushes =
            a.relationships.crushes.filter(id => id !== b.id);

        b.relationships.crushes =
            b.relationships.crushes.filter(id => id !== a.id);

        const litterSize = rand(1, 3);
        const kits = [];

        for (let i = 0; i < litterSize; i++) {
            const genes = inheritGenes(a, b);

            const eyeColor = inheritEyeColor(a, b, "eyeColor");
            const rightEyeColor = inheritEyeColor(a, b, "rightEyeColor");


            const kitten = makeCat({
                age: 0,
                rank: "Kit",
                sex: pick(["female", "male"]),
                genes,
                eyeColor,
                rightEyeColor,
                parents: [a.id, b.id],
                bornDay: state.day,
                name: `${pick(NAMES.prefixes)}kit`,
                skills: {
                    hunting: 1,
                    fighting: 1,
                    stealth: 1,
                    healing: 0,
                    swimming: 0,
                    agility: 1,
                    stamina: 1,
                    curiosity: rand(1, 3),
                    intuition: rand(1, 3)
                },
                energy: 100,
                hunger: 5,
                health: 100
            });

            kitten.notes.push(`Born to ${a.name} and ${b.name} in ${seasonName()}.`);

            state.cats.push(kitten);
            kits.push(kitten);

            setRelationship(a, kitten, 35);
            setRelationship(b, kitten, 35);

            kits.slice(0, -1).forEach(sib =>
                setRelationship(sib, kitten, rand(15, 35))
            );
        }

        state.nextBirthNumber += kits.length;

        logEvent(
            "birth",
            `${a.name} and ${b.name}'s litter arrived: ${kits.map(k => k.name).join(", ")}. ${kits.length === 1 ? "A new story begins." : "The nursery is suddenly much busier."
            }`
        );

        showNotice(`${kits.length} ${kits.length === 1 ? "kit" : "kits"} joined the clan! Their hidden genes have been recorded.`);
        render();
    }

    function renderTerritory() {
        $("territoryGrid").innerHTML = LOCATIONS.map(loc =>
            `<button class="location-card" data-patrol="${loc.id}">
        <span class="location-emoji">${loc.emoji}</span>
        <h3>${loc.name}</h3>
        <p>${loc.desc}</p>
        <span class="location-difficulty">${loc.difficulty} patrol</span>
      </button>`
        ).join("");

        const c = playerCat();

        $("individualModeText").textContent = c
            ? `You are seeing the world through ${c.name}'s eyes (${c.rank}). Personal actions affect their skills, energy, wellbeing, and relationships.`
            : "Choose a living cat in the Clan tab.";
    }

    function runPatrol(locationId) {
        const loc = LOCATIONS.find(l => l.id === locationId);
        if (!loc) return;

        const candidates = livingCats().filter(c =>
            c.age >= 6 && c.health > 20 && c.energy > 15
        );

        if (candidates.length < 1) {
            showNotice("No healthy cats are ready to patrol. Let the clan rest first.");
            return;
        }

        const patrol = candidates
            .sort((a, b) => b.skills[loc.skill] - a.skills[loc.skill])
            .slice(0, 3);

        patrol.forEach(c => {
            c.energy = clamp(c.energy - rand(10, 22), 0, 100);
            c.hunger = clamp(c.hunger + rand(8, 15), 0, 100);
            c.experience += rand(1, 3);
        });

        const skillTotal = patrol.reduce(
            (n, c) => n + (c.skills[loc.skill] || 1), 0
        );

        const success = Math.random() <
            clamp(.45 + skillTotal / (patrol.length * 12) - loc.risk * .08, .18, .9);

        let result;

        if (loc.id === "moonpool") {
            result = `${patrol.map(c => c.name).join(", ")} visited Moonpool Hollow. A pale reflection rippled across the water, though no cloud crossed the stars.`;

            patrol.forEach(c => {
                c.skills.intuition = clamp((c.skills.intuition || 1) + 1, 0, 10);
            });

            logEvent("lore", result);
        } else if (success) {
            const prey = rand(loc.prey[0], loc.prey[1]);
            state.prey += prey;

            result = `${patrol.map(c => c.name).join(", ")} returned from ${loc.name} ${prey ? `with ${prey} prey` : "with a useful discovery"}.`;

            if (chance(.25)) {
                const cat = pick(patrol);
                cat.skills[loc.skill] = clamp((cat.skills[loc.skill] || 1) + 1, 0, 10);
                result += ` ${cat.name} learned something new about ${loc.skill}.`;
            }

            logEvent("patrol", result);
        } else {
            const cat = pick(patrol);
            const damage = rand(8, 20);

            cat.health = clamp(cat.health - damage, 0, 100);

            result = `${patrol.map(c => c.name).join(", ")} struggled on ${loc.name}. ${cat.name} returned scratched and shaken (-${damage} health).`;

            logEvent("patrol", result);
        }

        showNotice(result);
        render();
    }
    function trainPlayer() {
        const c = playerCat();
        if (!c) return;

        if (c.energy < 12) {
            showNotice(`${c.name} is too tired to train. Rest first.`);
            return;
        }

        const skills = ["hunting", "fighting", "stealth", "agility", "stamina", "swimming"];
        const skill = pick(skills);

        c.skills[skill] = clamp((c.skills[skill] || 1) + 1, 0, 10);
        c.experience += 2;
        c.energy = clamp(c.energy - 12, 0, 100);
        c.hunger = clamp(c.hunger + 8, 0, 100);

        const text = `${c.name} practiced ${skill} and improved to ${c.skills[skill]}/10.`;

        c.notes.push(text);
        logEvent("training", text);
        showNotice(text);
        render();
    }

    function socializePlayer() {
        const c = playerCat();
        if (!c) return;

        const others = livingCats().filter(x => x.id !== c.id);
        if (!others.length) return;

        const other = pick(others);
        const change = rand(7, 15);

        setRelationship(c, other, relationship(c, other) + change);
        c.energy = clamp(c.energy - 4, 0, 100);

        const text = `${c.name} spent a little time with ${other.name}. Their bond is now ${relationshipLabel(relationship(c, other))}.`;

        c.notes.push(text);
        logEvent("relationship", text);
        showNotice(text);
        render();
    }

    function restPlayer() {
        const c = playerCat();
        if (!c) return;

        c.energy = clamp(c.energy + 30, 0, 100);
        c.health = clamp(c.health + rand(3, 8), 0, 100);
        c.hunger = clamp(c.hunger - 10, 0, 100);

        const text = `${c.name} rested in a warm patch of sunlight and recovered.`;

        c.notes.push(text);
        logEvent("cat", text);
        showNotice(text);
        render();
    }


    function apprenticeTrainingEvent() {
        const apprentices = livingCats().filter(c =>
            c.rank === "Apprentice" &&
            c.age >= 6 &&
            c.age < 12 &&
            c.energy >= 15
        );

        // No apprentices ready to train, or no event today.
        if (!apprentices.length || !chance(0.28)) return;

        // Choose one apprentice for today's training session.
        const apprentice = pick(apprentices);

        const eligibleMentors = livingCats().filter(c =>
            c.id !== apprentice.id &&
            c.age >= 12 &&
            ["Warrior", "Elder", "Deputy", "Leader"].includes(c.rank)
        );

        if (!eligibleMentors.length) return;

        // Prefer the assigned mentor, if they are still eligible.
        const mentor = eligibleMentors.find(
            c => c.id === apprentice.mentorId
        ) || pick(eligibleMentors);

        // These skills can be taught in the clan's territory.
        const trainingSkills = [
            "hunting",
            "climbing",
            "fighting"
        ];

        // Swimming lessons are available when the territory has a river.
        if (LOCATIONS.some(loc => loc.id === "river")) {
            trainingSkills.push("swimming");
        }

        const skill = pick(trainingSkills);

        // A more experienced mentor is better at teaching this skill.
        const mentorSkill = mentor.skills[skill] || 0;
        const apprenticeSkill = apprentice.skills[skill] || 0;

        // Skilled mentors and apprentices with more room to improve
        // have a better chance of making progress.
        const learningChance = clamp(
            0.20 +
            mentorSkill * 0.055 +
            (10 - apprenticeSkill) * 0.025,
            0.15,
            0.90
        );

        let text;

        if (apprenticeSkill >= 10) {
            text =
                `${mentor.name} worked with ${apprentice.name} on ${skill}, ` +
                `but the apprentice has already mastered this skill.`;
        } else if (chance(learningChance)) {
            // Usually gain one point. A highly skilled mentor can
            // occasionally help the apprentice gain two.
            const gain =
                mentorSkill >= 8 && chance(0.25) ? 2 : 1;

            const oldSkill = apprenticeSkill;
            const newSkill = clamp(oldSkill + gain, 0, 10);
            const actualGain = newSkill - oldSkill;

            apprentice.skills[skill] = newSkill;
            apprentice.experience += actualGain;

            text =
                `${mentor.name} trained ${apprentice.name} in ${skill}. ` +
                `With guidance from a ${mentorSkill}/10 mentor, ` +
                `${apprentice.name} improved from ${oldSkill}/10 ` +
                `to ${newSkill}/10.`;
        } else {
            text =
                `${mentor.name} practiced ${skill} with ${apprentice.name}. ` +
                `The apprentice struggled with the lesson, but gained experience.`;

            apprentice.experience += 1;
        }

        // Training takes energy and makes the apprentice hungrier.
        apprentice.energy = clamp(apprentice.energy - 8, 0, 100);
        apprentice.hunger = clamp(apprentice.hunger + 5, 0, 100);
        mentor.energy = clamp(mentor.energy - 4, 0, 100);

        apprentice.notes.push(text);
        logEvent("training", text);
    }



    function advanceMoon() {
        livingCats().forEach(c => {
            // Dead cats don't age.
            if (!c.alive) return;

            // Age the cat by one moon.
            c.age += 1;

            // Update the name to match the new age.
            updateCatName(c);

            // Promote kits to apprentices at 6 moons.
            if (c.age >= 6 && c.rank === "Kit") {
                c.rank = "Apprentice";
                logEvent(
                    "rank",
                    `${c.name} is old enough to begin apprentice training.`
                );
            }

            // Promote apprentices to warriors at 12 moons.
            if (c.age >= 12 && c.rank === "Apprentice") {
                c.rank = "Warrior";
                logEvent(
                    "rank",
                    `${c.name} completed their training and became a warrior.`
                );
            }
        });

        logEvent(
            "moon",
            `A new moon has passed. The clan is now in moon ${state.moon}.`
        );
    }

    function updateCatName(cat) {
        // Don't rename established warriors, deputies, leaders, or elders.
        if (
            cat.rank === "Warrior" ||
            cat.rank === "Deputy" ||
            cat.rank === "Leader" ||
            cat.rank === "Medicine Cat" ||
            cat.rank === "Elder"
        ) {
            return;
        }

        // Remove only an age-based suffix.
        const prefix = cat.name.replace(/(kit|paw)$/i, "");

        if (cat.age < 6) {
            cat.name = `${prefix}kit`;
        } else if (cat.age < 12) {
            cat.name = `${prefix}paw`;
        } else {
            // Give the cat a warrior name when they reach 12 moons.
            cat.name = `${prefix}${pick(NAMES.suffixes)}`;
        }
    }

    function tryGenerateGossip(cat, other) {
        const thirdCats = livingCats().filter(candidate =>
            candidate.id !== cat.id &&
            candidate.id !== other.id
        );

        if (thirdCats.length === 0) return "";

        let gossipChance = 0.65;

        if (cat.personality === "curious") gossipChance += 0.20;
        if (cat.personality === "observant") gossipChance += 0.15;
        if (cat.personality === "playful") gossipChance += 0.10;
        if (cat.personality === "loyal") gossipChance -= 0.08;

        if (!chance(clamp(gossipChance, 0.05, 0.60))) {
            return "";
        }

        const subject = pick(thirdCats);

        // Checks to see if a cat has a mate and a suspected crush
        const hasMate = Array.isArray(subject.relationships?.mates)
            && subject.relationships.mates.some(id =>
                livingCats().some(candidate => candidate.id === id)
            );

        const outsideCrushes = (subject.relationships?.crushes || [])
            .filter(id =>
                id !== cat.id &&
                !(subject.relationships?.mates || []).includes(id) &&
                livingCats().some(candidate => candidate.id === id) &&
                hasMate
            );

        if (outsideCrushes.length > 0 && chance(0.60)) {
            const crush = livingCats().find(candidate =>
                candidate.id === pick(outsideCrushes)
            );

            if (crush) {
                const subjectMates = (subject.relationships?.mates || [])
                    .map(id => livingCats().find(candidate => candidate.id === id))
                    .filter(Boolean);

                const mate = subjectMates.find(candidate =>
                    candidate.id === cat.id || candidate.id === other.id
                );

                if (mate) {
                    const suspicion = addSuspicion(mate, 1);

                    if (suspicion >= 3) {
                        return `${mate.name} is becoming increasingly suspicious of ${subject.name}'s feelings for ${crush.name}.`;
                    }

                    return `${cat.name} suspects ${subject.name} has feelings for ${crush.name}, despite already having a mate.`;
                }
            }

            return `${cat.name} suspects ${subject.name} has feelings for ${crush.name}, despite already having a mate.`;
        }

        const hasCrushes = Array.isArray(subject.relationships?.crushes) && subject.relationships.crushes.some(id =>
            livingCats().some(candidate => candidate.id === id));


        if (hasCrushes && chance(0.50)) {
            const crushIds = subject.relationships.crushes.filter(id =>
                livingCats().some(candidate => candidate.id === id)
            );

            const crush = livingCats().find(candidate =>
                candidate.id === pick(crushIds)
            );

            if (crush) {
                const listeners = [cat, other];

                // Only cats who don't already know this rumor can discover it.
                const discoveringCats = listeners.filter(listener => {
                    // Checks if cat already knows about that particular crush 
                    const alreadyKnows = window.Gossip.knowsGossip(listener, {
                        type: "crush",
                        subjectId: subject.id,
                        targetId: crush.id
                    });

                    return (
                        listener.id !== subject.id &&
                        !alreadyKnows
                    );
                });

                if (discoveringCats.length > 0) {
                    discoveringCats.forEach(listener => {
                        const gossip = window.Gossip.createGossip(
                            "crush",
                            subject.id,
                            crush.id
                        );

                        if (gossip && window.Gossip.recordGossip(listener, gossip)) {
                            window.SocialReactions.reactToGossip(listener, gossip);
                        }

                        // Shared feelings only cause rivalry when discovered.
                        if (
                            (listener.relationships.crushes || []).includes(crush.id) &&
                            shareCrushOnSameCat(listener, subject)
                        ) {
                            createCrushRivalry(listener, subject, crush);
                        }
                    });

                    return `${cat.name} and ${other.name} discussed ${subject.name}'s feelings for ${crush.name}.`;
                }

                return `${cat.name} and ${other.name} discussed a rumor about ${subject.name}.`;
            }
        }

        const rumors = [
            `${cat.name} told ${other.name} a little gossip about ${subject.name}.`,
            `${cat.name} and ${other.name} exchanged rumors about ${subject.name}.`,
            `${cat.name} shared an observation about ${subject.name} with ${other.name}.`
        ];

        return pick(rumors);
    }

    function autonomousDay() {
        const cats = livingCats();
        // Advance daily clock
        state.day++;
        state.dayOfMoon++;

        // Update emotional intensity of memories
        updateMemoryFeelings();

        // Gradually fade jealousy and admiration toward neutral.
        cats.forEach(cat => {
            window.SocialReactions.fadeJealousyAdmiration(cat);
        });

        // Advance moon clock after 30 days
        if (state.dayOfMoon >= 30) {
            state.dayOfMoon = 0;
            state.moon += 1;
            advanceMoon();
        }

        // One season lasts ten game days in this prototype.
        if ((state.day - 1) % 10 === 0) {
            state.seasonIndex = (state.seasonIndex + 1) % SEASONS.length;
            logEvent("season", `${seasonName()} arrived. The forest has changed its colors and scents.`);
        }

        // Clan food consumption.
        const dailyNeed = Math.max(2, Math.ceil(cats.length * .45));
        state.prey = Math.max(0, state.prey - dailyNeed);

        if (state.prey < 3) {
            logEvent("clan", "The prey pile is running low. A successful patrol would help the clan.");
        }

        cats.forEach(c => {

            c.energy = clamp(c.energy + rand(8, 22), 0, 100);
            c.hunger = clamp(c.hunger + rand(10, 18), 0, 100);

            if (state.prey > 0 && c.hunger > 35) {
                c.hunger = clamp(c.hunger - rand(20, 40), 0, 100);
                state.prey = Math.max(0, state.prey - 1);
            }

            if (c.hunger > 75) {
                c.health = clamp(c.health - rand(2, 7), 0, 100);
            } else if (c.health < 100 && c.hunger < 45) {
                c.health = clamp(c.health + rand(1, 4), 0, 100);
            }

            // Age-based rank progression.
            if (c.age >= 6 && c.rank === "Kit") {
                c.rank = "Apprentice";
                logEvent("rank", `${c.name} is old enough to begin apprentice training.`);
            }

            if (c.age >= 12 && c.rank === "Apprentice") {
                c.rank = "Warrior";
                logEvent("rank", `${c.name} completed their training and became a warrior.`);
            }

            if (c.age >= 96 && c.rank === "Warrior" && chance(.08)) {
                c.rank = "Elder";
                logEvent("rank", `${c.name} retired from regular patrols and joined the elders.`);
            }

            // NPC cats choose + resolve one activity each day
            // PC cat is left to player's choice
            if (c.id !== state.playerCatId) {
                window.NPC.performNpcActivity(c);
            }

            if (c.health <= 0) {
                c.alive = false;
                logEvent("loss", `${c.name} died after their health failed. Their story remains in the clan chronicle.`);
            }
        });

        // Give an apprentice a chance to train each day
        apprenticeTrainingEvent();

        // Small spontaneous camp events.
        if (chance(.55)) {
            const living = livingCats();
            const c = living.length ? pick(living) : null;

            if (c) {
                const stories = [
                    `${c.name} found a feather and tucked it beside their nest.`,
                    `${c.name} watched the tree line for a long while, listening to the wind.`,
                    `${c.name} helped tidy the shared nests before the evening chill.`,
                    `${c.name} returned from a short wander with burrs caught in their fur.`,
                    `${c.name} shared a patch of sun with a cat they don't usually speak to.`
                ];

                logEvent("camp", pick(stories));
            }
        }

        if (state.prey < 5 && chance(.45)) {
            logEvent("clan", "Several cats have begun to worry about the shrinking prey stores.");
        }


        // Sometimes trigger a larger story event.
        if (
            window.StoryEvents &&
            StoryEvents.shouldTriggerEvent()
        ) {
            const storyEvent = StoryEvents.getRandomEvent();

            if (storyEvent) {
                const participants = StoryEvents.selectParticipants(
                    storyEvent,
                    livingCats(),
                    state.playerCatId
                );

                if (participants) {
                    const playerInvolved = StoryEvents.involvesPlayer(
                        participants,
                        state.playerCatId
                    );

                    logEvent(
                        "story",
                        `${storyEvent.title}: ${storyEvent.description}`
                    );
                    // Show event and choices to player
                    // Choice affects outcome
                    if (playerInvolved) {
                        StoryEvents.showStoryEvent(
                            storyEvent,
                            participants,
                            (choice, eventParticipants) => {
                                applyStoryChoice(choice, eventParticipants);

                                logEvent(
                                    "story",
                                    `${storyEvent.title} — ${choice.outcome}`
                                );

                                saveGame(false);
                                render();
                                showNotice(choice.outcome);
                            }
                        );
                    } else {
                        // NPC-only events currently receive a
                        // temporary automatic outcome.
                        const choice = storyEvent.choices[
                            Math.floor(
                                Math.random() * storyEvent.choices.length
                            )
                        ];

                        // NPC choice affects outcome
                        applyStoryChoice(choice, participants);

                        logEvent(
                            "story",
                            `${storyEvent.title} — ${choice.outcome}`
                        );
                    }
                }
            }
        }


        if (!getCat(state.playerCatId)) {
            state.playerCatId = livingCats()[0]?.id || null;
        }

        if (!getCat(selectedCatId)) {
            selectedCatId = state.playerCatId;
        }

        if (!livingCats().length) {
            logEvent("ending", "The camp has fallen silent. You can reset the prototype to begin a new clan.");
        }

        saveGame(false);
        render();

        showNotice(`Day advanced. ${seasonName()} · Day ${state.day}. Your cats lived through another day.`);
    }

    function assignMentor(apprenticeId) {
        const apprentice = getCat(apprenticeId);

        if (!apprentice || apprentice.rank !== "Apprentice") {
            showNotice("Only apprentices can be assigned a mentor.");
            return;
        }

        const mentors = livingCats().filter(c =>
            c.id !== apprentice.id &&
            ["Warrior", "Leader", "Deputy"].includes(c.rank)
        );

        if (!mentors.length) {
            showNotice("There are no eligible mentors in the clan.");
            return;
        }

        const options = mentors
            .map(c => `${c.name} (${c.id})`)
            .join("\n");

        const choice = prompt(
            `Choose a mentor for ${apprentice.name}.\nEnter a mentor's name:\n\n${options}`
        );

        if (!choice) return;

        const mentor = mentors.find(
            c => c.name.toLowerCase() === choice.trim().toLowerCase()
        );

        if (!mentor) {
            showNotice("No eligible mentor found with that name.");
            return;
        }

        apprentice.mentorId = mentor.id;

        logEvent(
            "training",
            `${mentor.name} became ${apprentice.name}'s mentor.`
        );

        saveGame(false);
        render();
        showNotice(`${mentor.name} is now mentoring ${apprentice.name}.`);
    }


    function changeRank(id) {
        const c = getCat(id);
        if (!c) return;

        const options = RANKS.filter(r =>
            !(c.age < 6 && r !== "Kit") &&
            !(c.age >= 6 && c.age < 12 && !["Apprentice", "Kit"].includes(r))
        );

        const next = prompt(
            `Change ${c.name}'s rank. Available ranks: ${options.join(", ")}\nEnter a rank exactly:`,
            c.rank
        );

        if (!next) return;

        const normalized = RANKS.find(
            r => r.toLowerCase() === next.trim().toLowerCase()
        );

        if (!normalized) {
            showNotice("That rank isn't recognized.");
            return;
        }

        c.rank = normalized;
        logEvent("rank", `${c.name} is now recognized as ${normalized.toLowerCase()}.`);
        render();
    }

    function saveGame(show = true) {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(state));

            if (show) {
                showNotice("Game saved in this browser.");
            }
        } catch (err) {
            if (show) {
                showNotice("Save failed. Your browser may have storage disabled.");
            }
        }
    }


    function loadGame() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return false;

            const loaded = JSON.parse(raw);

            if (!loaded || !Array.isArray(loaded.cats) || !loaded.version) {
                return false;
            }

            // Fill in defaults for stats added in newer versions.
            loaded.cats.forEach(cat => {
                // Let cats remember
                if (!Array.isArray(cat.memories)) {
                    cat.memories = [];
                }
                if (cat.attractionToMales === undefined) {
                    cat.attractionToMales = rand(0, 100);
                }
                if (cat.attractionToFemales === undefined) {
                    cat.attractionToFemales = rand(0, 100);
                }
                if (cat.respect === undefined) cat.respect = 50;
                if (cat.trust === undefined) cat.trust = 50;
                if (cat.faith === undefined) cat.faith = 50;
                if (!cat.eyeColor) {
                    cat.eyeColor = pick(["blue", "green", "amber", "gold", "copper"])
                }
                if (!cat.coatShade && cat.genes) {
                    const catTraits = phenotype(cat.genes);
                    cat.coatShade = CatRenderer.chooseCoatColor(catTraits.base);
                }
                if (!cat.relationships || typeof cat.relationships !== "object") {
                    cat.relationships = {};
                }

                // Cats remember relationships
                if (!Array.isArray(cat.relationships.crushes)) {
                    cat.relationships.crushes = [];
                }

                if (!Array.isArray(cat.relationships.rivals)) {
                    cat.relationships.rivals = [];
                }

                if (!Array.isArray(cat.relationships.crushRivals)) {
                    cat.relationships.crushRivals = [];
                }

                if (!Array.isArray(cat.relationships.knownCrushes)) {
                    cat.relationships.knownCrushes = [];
                }

                if (!Array.isArray(cat.relationships.knownGossip)) {
                    cat.relationships.knownGossip = [];
                }

                if (!Array.isArray(cat.relationships.bestFriends)) {
                    cat.relationships.bestFriends = [];
                }

                if (!Array.isArray(cat.relationships.mates)) {
                    cat.relationships.mates = [];
                }
            });

            state = loaded;
            return true;
        } catch (err) {
            return false;
        }
    }


    function exportSave() {
        const blob = new Blob(
            [JSON.stringify(state, null, 2)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = "winterclan-save.json";
        a.click();

        URL.revokeObjectURL(url);
        showNotice("Save exported as a JSON file.");
    }

    function resetGame() {
        if (!confirm("Start a brand-new clan? This replaces the save stored in this browser. Export your save first if you want to keep it.")) {
            return;
        }

        localStorage.removeItem(SAVE_KEY);
        selectedCatId = null;

        initialState();

        // Show the character creator again for the new game.
        $("creatorOverlay").classList.add("open");

        selectedCatId = state.playerCatId;
        saveGame(false);
        render();
        showNotice("Create your new cat to begin.");
    }

    function switchView(view) {
        selectedView = view;

        document.querySelectorAll(".tab").forEach(b => {
            b.classList.toggle("active", b.dataset.view === view);
        });

        document.querySelectorAll(".view").forEach(v => {
            v.classList.toggle("active", v.id === `view-${view}`);
        });

        if (view === "clan") renderRoster();
        if (view === "breeding") renderBreeding();
        if (view === "territory") renderTerritory();
    }

    function bindEvents() {
        $("creatorForm").addEventListener("submit", createPlayerCat);

        document.querySelectorAll(".tab").forEach(b => {
            b.addEventListener("click", () => switchView(b.dataset.view));
        });

        document.querySelectorAll("[data-jump]").forEach(b => {
            b.addEventListener("click", () => switchView(b.dataset.jump));
        });

        $("advanceDayBtn").addEventListener("click", autonomousDay);
        $("rankFilter").addEventListener("change", renderRoster);
        $("parentA").addEventListener("change", updateBreedingPreview);
        $("parentB").addEventListener("change", updateBreedingPreview);
        $("breedBtn").addEventListener("click", breedLitter);
        $("trainBtn").addEventListener("click", trainPlayer);
        $("socialBtn").addEventListener("click", socializePlayer);
        $("restBtn").addEventListener("click", restPlayer);
        $("saveBtn").addEventListener("click", () => saveGame(true));
        $("exportBtn").addEventListener("click", exportSave);
        $("resetBtn").addEventListener("click", resetGame);

        $("clearLogBtn").addEventListener("click", () => {
            if (confirm("Clear the visible chronicle? This does not affect the cats.")) {
                state.log = [];
                renderChronicle();
            }
        });

        document.body.addEventListener("click", e => {
            const select = e.target.closest("[data-select-cat]");

            if (select) {
                selectedCatId = select.dataset.selectCat;
                switchView("clan");
                renderRoster();
                renderCamp();
            }

            const open = e.target.closest("[data-open-cat]");
            if (open) {
                selectedCatId = open.dataset.openCat;
                switchView("clan");
                renderRoster();
            }

            const play = e.target.closest("[data-play-as]");

            if (play) {
                state.playerCatId = play.dataset.playAs;
                selectedCatId = state.playerCatId;

                const c = getCat(state.playerCatId);

                if (c) {
                    showNotice(`You are now following ${c.name}.`);
                }

                render();
            }

            const mentorBtn = e.target.closest("[data-assign-mentor]");
            if (mentorBtn) {
                assignMentor(mentorBtn.dataset.assignMentor);
            }

            const promote = e.target.closest("[data-promote]");

            if (promote) {
                changeRank(promote.dataset.promote);
            }

            const patrol = e.target.closest("[data-patrol]");

            if (patrol) {
                runPatrol(patrol.dataset.patrol);
            }
        });
    }

    initializeRelationships();

    const hasSavedGame = loadGame();

    if (!hasSavedGame) {
        initialState();
        $("creatorOverlay").classList.add("open");
    }

    initializeNpcAI();

    initializeSocialReactions();
    initializeGossip();
    CatRenderer.initialize(COLORS);
    selectedCatId = state.playerCatId || livingCats()[0]?.id || null;

    bindEvents();
    render();
})();