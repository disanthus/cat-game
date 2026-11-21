/* clan prototype
   One-file simulation engine: original lore, local-only save, simplified Mendelian genetics.
   This is a playable foundation, not a biologically complete feline genetics simulator. */
(async () => {
    "use strict";

    const SAVE_KEY = "winterclan-save-v1";
    const DAYS_PER_MOON = 30;
    const STARCLAN_LIMIT = 50;
    const GRIEF_DAYS = 5;
    let NAMES = {};

    function mateConcern(cat, mate) {
        const concerns = cat.relationships.mateConcerns ??= {};
        return concerns[mate.id] ??= { suspicion: 0, heard: {} };
    }

    // Load naming data from the JSON file.
    async function loadNameData() {
        try {
            const response = await fetch("data/names.json");

            if (!response.ok) {
                throw new Error("Could not load names.json");
            }

            NAMES = await response.json();

            console.log("Name data loaded!", NAMES);

        } catch (error) {
            console.error("Error loading name data:", error);
            throw error;
        }
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
            routineBondGain: window.Relationships.routineBondGain,
            tryDevelopCrush,
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
            recordCatEvent
        });

        return true;
    }

    // Initialize event module
    function initializeStoryEvents() {
        if (!window.StoryEvents) {
            console.error("story-events.js has not loaded correctly.");
            return false;
        }

        window.StoryEvents.initialize({
            getState: () => state,
            canStartCrush,
            canBecomeMates,
            relationship,
            mateConcern,
            renderPortrait: renderCatPortrait,
            eventSlot: $("questCard"),
            setEventActive(active) {
                if (active) switchView("territory");

                document.querySelectorAll(".top-status, .tabs, #territoryGrid, .patrol-panel, .footer-actions")
                    .forEach(section => { section.inert = active; });
            }
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

        if (event === "friendly_interaction" || event === "disagreement") {
            CatConditions.recordContact(cats, "conversation", state.day);
        } else if (event === "family_time") {
            CatConditions.recordContact(cats, "close", state.day);
        }

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
        if ((event === "friendly_interaction" || event === "disagreement") &&
            window.SocialReactions?.reactToInteraction) {
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

    // Apply relationship and memory consequences from story choices
    function applyStoryChoice(choice, participants) {
        if (!choice || !participants) return;

        const participantList = Array.isArray(participants)
            ? participants
            : Object.values(participants);

        const cats = participantList.filter(
            cat => cat && cat.alive !== false
        );

        if (cats.length === 0) return;

        const injuryMessages = [];
        for (const effect of choice.effects || []) {

            if (effect.type === "footprints_encounter") {
                const delay = effect.warned ? rand(0, 3) : 0;
                if (delay > 0) {
                    state.pendingFootprints.push({
                        day: state.day + delay,
                        catIds: cats.map(cat => cat.id)
                    });
                    const wait = delay === 1 ? "tomorrow" : `in ${delay} days`;
                    return `The patrol warns the clan and will investigate the tracks ${wait}.`;
                }

                return resolveStoryFootprints(cats, effect.warned);
            }

            if (effect.type === "injury") {
                const cat = cats.find(participant => participant.id === effect.catId);
                if (cat && chance(effect.chance)) {
                    CatConditions.add(cat, effect.condition, state.day, (type, message) => {
                        logEvent(type, message);
                        injuryMessages.push(message);
                    });
                }
            }

            if (effect.type === "health") {
                const cat = cats.find(participant => participant.id === effect.catId);
                if (cat) {
                    cat.health = clamp(cat.health + effect.value, 0, 100);
                    if (cat.health === 0) {
                        recordDeath(cat, `${cat.name} died from their injuries.`);
                    }
                }
            }

            if (effect.type === "predator_risk") {
                state.predatorRisk = {
                    bonus: effect.bonus,
                    expiresDay: state.day + effect.days
                };
            }

            // Relationship changes
            if (effect.type === "relationship") {
                const change =
                    effect.value === "positive" ? 5 :
                        effect.value === "negative" ? -5 :
                            typeof effect.value === "number" ? effect.value : 0;

                if (change === 0) continue;

                for (let i = 0; i < cats.length; i++) {
                    for (let j = i + 1; j < cats.length; j++) {
                        const a = cats[i];
                        const b = cats[j];

                        setRelationship(
                            a,
                            b,
                            relationship(a, b) + change
                        );
                    }
                }
            }

            // Memory recording
            if (effect.type === "memory") {
                recordCatEvent(
                    effect.value || choice.id,
                    cats,
                    {
                        importance: effect.importance ?? 2,
                        description: StoryEvents.formatText(
                            effect.description || choice.outcome || choice.text || "", participants
                        )
                    }
                );
            }

            // Add a rescued kitten to the clan
            if (
                effect.type === "special_event" &&
                effect.value === "rescue_kit"
            ) {
                const rescuedKit = makeCat({
                    age: rand(0, 5),
                    rank: "Kit",
                    notes: [
                        "Found alone in the bracken and taken in by the Clan."
                    ]
                });

                state.cats.push(rescuedKit);

                const rescuer = participants.patrol ?? cats[0];
                rememberEvent(rescuedKit, "taken_in_by_clan", {
                    description: `${rescuer.name} found them crying alone in the bracken and brought them into ${state.clanName}.`,
                    importance: 5,
                    participants: [rescuer.id]
                });

                console.log("Rescued kitten added to the Clan:", rescuedKit);
            }

            // Add a crush
            if (effect.type === "add_crush") {
                const confessor = participants[effect.from] || cats.find(
                    cat => cat.id === effect.from
                ) || cats[0];

                const target = participants[effect.to] || cats.find(
                    cat => cat.id === effect.to
                ) || cats[1];

                if (confessor && target) {
                    addCrush(confessor, target);
                }
            }

            if (effect.type === "clear_crush") {
                const admirer = participants[effect.from];
                const target = participants[effect.to];
                if (admirer && target) {
                    clearCrush(admirer, target);
                }
            }

            if (effect.type === "refresh_crush") {
                const admirer = participants[effect.from];
                const target = participants[effect.to];
                if (admirer && target && admirer.relationships.crushes.includes(target.id)) {
                    admirer.relationships.crushStartDays[target.id] = state.day;
                }
            }

            if (effect.type === "secret_relationship") {
                const { admirer, interest } = participants;
                if (admirer?.alive && interest?.alive &&
                    !areCloseRelatives(admirer, interest) &&
                    admirer.relationships.crushes.includes(interest.id) &&
                    interest.relationships.crushes.includes(admirer.id)) {
                    (admirer.relationships.secretPartners ??= {})[interest.id] = state.day;
                    (interest.relationships.secretPartners ??= {})[admirer.id] = state.day;
                }
            }

            if (effect.type === "resolve_mate_conflict") {
                const { challenger, partner } = participants;
                if (!challenger.relationships.mates.includes(partner.id) ||
                    !partner.relationships.mates.includes(challenger.id)) continue;

                const concern = mateConcern(challenger, partner);
                concern.pending = null;
                concern.trust = clamp((concern.trust ?? challenger.trust ?? 50) + effect.trust, 0, 100);
                concern.suspicion = effect.suspicion;
                setRelationship(challenger, partner, relationship(challenger, partner) + effect.bond);

                if (effect.separate) {
                    endMateTie(challenger, partner.id);
                    endMateTie(partner, challenger.id);
                } else if (effect.endOutsideTie) {
                    clearOutsideTie(partner, effect.interestId);
                }

                recordCatEvent(effect.separate ? "mates_separated" : "mates_reconciled", [challenger, partner], {
                    importance: effect.separate ? 5 : 4,
                    description: window.StoryEvents.formatText(choice.text, participants)
                });
            }

            // Become mates
            if (effect.type === "become_mates") {
                const first = participants[effect.from];
                const second = participants[effect.to];

                if (!first || !second) {
                    console.warn("Could not find cats for become_mates effect:", effect);
                    continue;
                }
                if (!canBecomeMates(first, second)) continue;

                // Add each cat to the other's mates list.
                if (!first.relationships.mates.includes(second.id)) {
                    first.relationships.mates.push(second.id);
                }

                if (!second.relationships.mates.includes(first.id)) {
                    second.relationships.mates.push(first.id);
                }

                // Clear their crushes on each other.
                clearOutsideTie(first, second.id);
                clearCrush(second, first);

                recordCatEvent("became_mates", [first, second], {
                    importance: 5,
                    description: `${first.name} and ${second.name} became mates after confessing their feelings.`
                });

                console.log(`${first.name} and ${second.name} are now mates!`);
            }
        }

        resolveLeadershipVacancy();
        if (injuryMessages.length) {
            return [choice.outcome || choice.text, ...injuryMessages].filter(Boolean).join(" ");
        }
    }


    const SEASONS = ["Newleaf", "Greenleaf", "Leaf-fall", "Leaf-bare"];
    const RANKS = ["Leader", "Deputy", "Medicine Cat", "Warrior", "Apprentice", "Kit", "Elder"];
    const MEDICINE_APPRENTICE_RANK = "Medicine Cat Apprentice";
    const MEDICINE_APPRENTICE_LIMIT = 2;

    function rankLabel(cat) {
        return cat.rank === "Apprentice" && cat.medicineTrack ? MEDICINE_APPRENTICE_RANK : cat.rank;
    }

    const LOCATIONS = [
        { id: "pinewood", name: "Pinewood Trail", emoji: "↟𖠰˚☀︎↟𖠰", desc: "A familiar path with plenty of cover and small prey.", difficulty: "Easy", risk: 1, prey: [2, 5], skill: "stealth" },
        { id: "river", name: "Glassriver Bend", emoji: "°‧ 𓆝 𓆟 𓆞 ·｡", desc: "A quick river runs between smooth stones. Fish are plentiful, but the current is tricky.", difficulty: "Moderate", risk: 2, prey: [3, 6], skill: "swimming" },
        { id: "ridge", name: "Windcut Ridge", emoji: "ᨒ↟𖠰", desc: "An exposed ridge where sharp eyes and steady paws matter.", difficulty: "Hard", risk: 3, prey: [1, 4], skill: "stamina" },
        { id: "ruins", name: "Old Twoleg Ruins", emoji: "🏘", desc: "Strange scents, hidden spaces, and the occasional useful discovery.", difficulty: "Moderate", risk: 2, prey: [0, 2], skill: "curiosity" },
        { id: "moonpool", name: "Moonpool Hollow", emoji: "꒷꒦︶꒷꒦︶ ๋ ࣭ ⭑꒷꒦", desc: "A quiet hollow where the clan leaves offerings and listens to old stories.", difficulty: "Story", risk: 1, prey: [0, 0], skill: "intuition" },
        { id: "bramble", name: "Bramble Maze", emoji: "⸙. ݁₊ ⸙͎. ݁˖ 𓃦. ݁𓍊. ݁ ݁𓃴", desc: "Dense thorn tunnels make this a good test of patience and agility.", difficulty: "Hard", risk: 3, prey: [1, 4], skill: "agility" }
    ];

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
    const FAMILY_RULES = {
        litterCooldown: 180,
        attemptCooldown: 7,
        minimumHealth: 60,
        dailyNpcChance: 0.02,
        dailyParentChance: 0.15
    };
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
    let profileView = {};
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

    // choose base based on cat's age/fur length
    function getCatArtwork(cat) {
        const age = cat.age ?? 0;

        const isLongHair =
            cat.genes?.L?.[0] === "l" &&
            cat.genes?.L?.[1] === "l";

        const hairLength = isLongHair ? "lh" : "sh";

        let ageGroup;

        if (age < 6) {
            ageGroup = "kitten";
        } else if (age < 12) {
            ageGroup = "apprentice";
        } else {
            ageGroup = "adult";
        }

        return `${hairLength}-${ageGroup}`;
    }

    // Get possible name prefixes based on the cat's appearance.
    function getCatPrefixChoices(genes) {
        const p = phenotype(genes);

        const prefixes = [
            ...(NAMES.prefixWhite[p.whiteAmount] || []),
            ...(NAMES.prefixPattern[p.pattern] || []),
            ...(NAMES.prefixesByColor[p.base] || []),
            ...(NAMES.defaultPrefixes || [])
        ];

        // Remove duplicate prefixes.
        return [...new Set(prefixes)];
    }

    // Warrior suffixes with personality and skill weights
    // Keep consistent with names at the top
    function chooseWarriorSuffix(cat) {
        const weights = { ...NAMES.warriorSuffixWeights };

        // Personality makes certain suffixes more likely
        for (const suffix of NAMES.personalitySuffixes[cat.personality] || []) {
            weights[suffix] = (weights[suffix] || 1) + 3;
        }

        // Strong skills make related suffixes more likely
        for (const [skill, suffixes] of Object.entries(NAMES.skillSuffixes)) {
            if (cat.skills[skill] >= 7) {
                for (const suffix of suffixes) {
                    weights[suffix] = (weights[suffix] || 1) + 2;
                }
            }
        }

        // Weighted random selection
        const entries = Object.entries(weights);
        const totalWeight = entries.reduce(
            (total, [, weight]) => total + weight,
            0
        );

        let roll = Math.random() * totalWeight;

        for (const [suffix, weight] of entries) {
            roll -= weight;

            if (roll <= 0) {
                return suffix;
            }
        }

        return pick(Object.keys(weights));
    }

    function getUniquePrefix(genes) {
        // Get prefixes that match the cat's appearance
        const preferredPrefixes = getCatPrefixChoices(genes);

        // Find prefixes that haven't already been used
        const usedPrefixes = state.cats.map(cat => cat.prefix);

        const availablePrefixes = preferredPrefixes.filter(prefix =>
            !usedPrefixes.includes(prefix)
        );

        // Use an unused matching prefix if possible
        if (availablePrefixes.length > 0) {
            return pick(availablePrefixes);
        }

        // If all matching prefixes are used, reuse one
        return pick(preferredPrefixes);
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
        const prefix = overrides.prefix || getUniquePrefix(genes);
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
            prefix: prefix,
            name: overrides.name || `${prefix}${age < 6 ? "kit" : age < 12 ? "paw" : pick(NAMES.suffixes)}`,
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
            fertility: overrides.fertility ?? rand(60, 90),
            lastLitterDay: overrides.lastLitterDay ?? null,
            lastBreedingAttemptDay: overrides.lastBreedingAttemptDay ?? null,
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
            predatorRisk: null,
            pendingFootprints: [],
            pendingVigils: [],
            herbs: 3,
            medicineDream: null,
            disaster: null,
            nextDreamDay: 3,
            prey: 9000,
            clanName: "WinterClan",
            cats: [],
            starClan: [],
            log: [],
            playerCatId: null,
            nextBirthNumber: 1,
            storyHistory: {
                lastEventDay: -1,
                eventCooldowns: {},
                pairEvents: {}
            },
            version: 1
        };

        // Each new clan begins with eight randomized founders.
        // Their general age groups and clan roles stay consistent.
        const founderRoles = [
            {
                rank: "Leader",
                minAge: 36,
                maxAge: 72
            },
            {
                rank: "Medicine Cat",
                minAge: 24,
                maxAge: 60
            },
            {
                rank: "Deputy",
                minAge: 24,
                maxAge: 60
            },
            {
                rank: "Warrior",
                minAge: 12,
                maxAge: 60
            },
            {
                rank: "Warrior",
                minAge: 12,
                maxAge: 60
            },
            {
                rank: "Apprentice",
                minAge: 6,
                maxAge: 11
            },
            {
                rank: "Kit",
                minAge: 1,
                maxAge: 5
            },
            {
                rank: "Elder",
                minAge: 72,
                maxAge: 120
            }
        ];

        // Generate founders one at a time so each gets a unique prefix.
        founderRoles.forEach(role => {
            const genes = randomGenes();
            const prefix = getUniquePrefix(genes);

            const cat = makeCat({
                genes,
                prefix,
                name: role.rank === "Leader"
                    ? `${prefix}star`
                    : undefined,
                age: rand(role.minAge, role.maxAge),
                rank: role.rank
            });

            state.cats.push(cat);
        });

        // Give a few founders initial relationships.
        const leader = state.cats[0];
        const deputy = state.cats[2];
        const warriors = state.cats.filter(c => c.rank === "Warrior");

        if (leader && deputy) {
            setRelationship(leader, deputy, 45);
            setRelationship(deputy, leader, 45);
        }

        if (warriors.length >= 2) {
            setRelationship(warriors[0], warriors[1], 18);
            setRelationship(warriors[1], warriors[0], 18);
        }

        // Choose a starting adult warrior as the default player cat.
        const startingCat = warriors[0] ||
            state.cats.find(c => c.age >= 12);

        state.playerCatId = startingCat?.id || null;

        // Generate introductory clan history using the new founders.
        logEvent(
            "lore",
            `${leader.name} gathered the clan beneath the cedar boughs. The season of Newleaf has begun.`
        );

        const medicineCat = state.cats.find(
            c => c.rank === "Medicine Cat"
        );

        if (medicineCat) {
            logEvent(
                "clan",
                `${medicineCat.name} speaks of old stories and signs from the stars.`
            );
        }

        logEvent(
            "cat",
            "Your new cat will soon begin their life in WinterClan."
        );
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

    function clanHistoryCats() {
        return [...state.cats, ...state.starClan];
    }

    function extendGrief(cat) {
        if (cat.griefUntilDay > state.day) {
            cat.griefStartsDay ??= cat.griefUntilDay - GRIEF_DAYS;
            cat.griefUntilDay += GRIEF_DAYS;
        } else {
            cat.griefStartsDay = state.day + 1;
            cat.griefUntilDay = cat.griefStartsDay + GRIEF_DAYS;
        }
    }

    function griefAffectsRecovery(cat) {
        const start = cat.griefStartsDay ?? cat.griefUntilDay - GRIEF_DAYS;
        return state.day >= start && state.day < cat.griefUntilDay;
    }

    function queueVigilLoss(mourner, departed) {
        const vigils = state.pendingVigils ??= [];
        let vigil = vigils.find(entry => entry.day === state.day && entry.mournerId === mourner.id);
        if (!vigil) {
            vigil = { day: state.day, mournerId: mourner.id, losses: [] };
            vigils.push(vigil);
        }

        const memory = (mourner.memories ?? []).filter(entry =>
            entry.participants?.includes(departed.id) && entry.description &&
            !entry.description.includes("{") && !["clan_loss", "developed_crush"].includes(entry.event) &&
            !entry.privateOwnerId
        ).sort((a, b) => b.importance - a.importance || b.day - a.day)[0];
        vigil.losses.push({
            catId: departed.id,
            name: departed.name,
            cause: departed.deathCause,
            memory: memory?.description
        });
    }

    function recordDeath(cat, cause) {
        if (!cat.alive) return;
        cat.alive = false;
        cat.health = 0;
        cat.deathDay = state.day;
        cat.deathCause = cause;
        state.cats = state.cats.filter(member => member !== cat);
        state.starClan.unshift(cat);
        if (state.starClan.length > STARCLAN_LIMIT) state.starClan.pop();
        state.pendingVigils = (state.pendingVigils ?? []).filter(vigil => vigil.mournerId !== cat.id);

        const reactions = livingCats().map(member => {
            const bond = relationship(member, cat);
            let priority = 0;
            let reaction = "sat with the clan in silence.";
            if (member.relationships.mates?.includes(cat.id) || cat.relationships.mates?.includes(member.id)) {
                endMateTie(member, cat.id, "death");
                priority = 5;
                reaction = "kept vigil beside their mate.";
            } else if (areCloseRelatives(member, cat)) {
                priority = 4;
                reaction = "shared a favorite memory of their kin.";
            } else if (member.mentorId === cat.id || cat.mentorId === member.id) {
                priority = 3;
                reaction = "remembered the seasons they had spent training together.";
            } else if (member.relationships.secretPartners?.[cat.id] != null) {
                priority = 3;
                reaction = "stayed by the vigil long after the others had left.";
            } else if (bond >= 65 || member.relationships.bestFriends?.includes(cat.id)) {
                priority = 3;
                reaction = "left a feather beside their friend's nest.";
            } else if (bond >= 25) {
                priority = 2;
                reaction = "remembered the time they spent together.";
            } else if (bond <= -20) {
                priority = 1;
                reaction = "quietly paid their respects despite their differences.";
            }
            const playerLoss = priority >= 3 && member.id === state.playerCatId;
            const text = `${member.name} ${playerLoss ? "mourned their loss." : reaction}`;
            if (priority >= 3) {
                extendGrief(member);
                if (playerLoss) queueVigilLoss(member, cat);
                rememberEvent(member, "clan_loss", {
                    description: `${cat.name} died. ${text}`,
                    importance: 4,
                    participants: [cat.id]
                });
            }
            return { priority, bond, text };
        }).sort((a, b) => b.priority - a.priority || Math.abs(b.bond) - Math.abs(a.bond));

        const vigil = reactions.slice(0, 3).map(reaction => reaction.text).join(" ");
        logEvent("loss", `${cause}${vigil ? ` The clan gathered to mourn. ${vigil}` : ""}`);
        updateCrushEligibility();
    }

    function pendingVigil() {
        return state.pendingVigils?.find(vigil => vigil.mournerId === state.playerCatId);
    }

    function showVigil() {
        const vigil = pendingVigil();
        const mourner = getCat(vigil?.mournerId);
        if (!mourner || !$("questCard").hidden) return false;

        const names = new Intl.ListFormat("en").format(vigil.losses.map(loss => loss.name));
        const companion = !mourner.quarantined && livingCats()
            .filter(cat => cat !== mourner && !cat.quarantined && relationship(mourner, cat) >= 25)
            .sort((a, b) => relationship(mourner, b) - relationship(mourner, a))[0];
        const participants = { mourner };
        const choices = [{ id: "speak", text: "Share a remembrance" }];
        if (companion) choices.push({ id: "sit", text: `Sit with ${companion.name}` });
        choices.push({ id: "quiet", text: "Keep a quiet vigil" });

        const dialogue = {
            start: {
                text: `At dusk, the clan gathers to remember ${names}. ${mourner.name} settles near the center of the clearing.`,
                decisionMaker: "mourner",
                choices: [{ text: "Remember what you shared", next: "loss0" }]
            }
        };
        vigil.losses.forEach((loss, index) => {
            const role = `departed${index}`;
            participants[role] = state.starClan.find(cat => cat.id === loss.catId);
            dialogue[`loss${index}`] = {
                speaker: role,
                decisionMaker: "mourner",
                text: loss.memory
                    ? `${loss.cause} One memory comes back to ${mourner.name}. “${loss.memory}”`
                    : `${loss.cause} ${mourner.name} takes a moment to remember ${loss.name}.`,
                choices: index === vigil.losses.length - 1 ? choices :
                    [{ text: "Remember the next cat", next: `loss${index + 1}` }]
            };
        });

        StoryEvents.showStoryEvent({ title: "The Clan Vigil", dialogue }, participants, choice => {
            state.pendingVigils = state.pendingVigils.filter(entry => entry !== vigil);
            const departedIds = vigil.losses.map(loss => loss.catId);
            let description = `${mourner.name} kept a quiet vigil for ${names}.`;
            if (choice.id === "speak") {
                description = `${mourner.name} shared a memory of ${names} with the clan.`;
                for (const loss of vigil.losses) {
                    const departed = state.starClan.find(cat => cat.id === loss.catId);
                    if (departed) {
                        departed.vigilTribute = {
                            mournerName: mourner.name,
                            text: loss.memory || `${mourner.name} spoke for ${loss.name} at the vigil.`
                        };
                    }
                }
            } else if (choice.id === "sit" && companion) {
                description = `${companion.name} sat with ${mourner.name} at the vigil for ${names}.`;
                setRelationship(mourner, companion, relationship(mourner, companion) + 3);
                rememberEvent(companion, "clan_vigil", {
                    description, importance: 3, participants: [mourner.id, ...departedIds]
                });
            }
            rememberEvent(mourner, "clan_vigil", {
                description, importance: 4, participants: companion && choice.id === "sit"
                    ? [...departedIds, companion.id] : departedIds
            });
            logEvent("vigil", description);
            saveGame(false);
            switchView("camp");
            render();
            showNotice(description);
        });
        return true;
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
        if (selectedView === "starclan") renderStarClan();
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
        $("vigilBtn").hidden = !pendingVigil();

        $("campGreeting").textContent = state.day === 1
            ? "The forest is waking."
            : `${seasonName()} brings another day.`;

        $("campSummary").textContent =
            `${state.clanName} has ${cats.length} living cats. The camp is quiet for now, but every cat carries a story.`;

        $("campEvents").innerHTML = state.log.slice(0, 5).map(eventHtml).join("") ||
            `<p class="empty-state">A quiet day in camp.</p>`;

        const c = playerCat();

        renderDeputyAppointment(c);
        renderLeaderAppointment(c);
        $("selectedCatCard").innerHTML = c
            ? miniProfileHtml(c)
            : `<p class="empty-state">No cats remain.</p>`;

        if (c) {
            const miniCanvas = $("miniProfileCatCanvas");

            if (miniCanvas) {
                const traits = {
                    ...phenotype(c.genes),
                    coatShade: c.coatShade,
                    whiteMarking: c.whiteMarking,
                    eyeColor: c.eyeColor,
                    rightEyeColor: c.rightEyeColor
                };

                CatRenderer.renderIcon(miniCanvas, traits, {
                    artwork: getCatArtwork(c)
                });
            }
        }
    }


    function renderChronicle() {
        $("chronicleList").innerHTML = state.log
            .map(event => `
            <div class="chronicle-entry">
                <span class="chronicle-date">
                    ${escapeHtml(event.season)} - Day ${event.day}
                </span>

                <div class="chronicle-text">
                    ${escapeHtml(event.text)}
                    <div class="chronicle-type">Event type: ${escapeHtml(event.type)}
                    </div>
                </div>
            </div>
        `)
            .join("") || `<p class="empty-state">No clan history yet!</p>`;
    }

    function renderStarClan() {
        $("starClanCount").textContent = `${state.starClan.length} / ${STARCLAN_LIMIT} remembered`;
        $("starClanRoster").innerHTML = state.starClan.map(cat => `
            <article class="chronicle-entry">
                <span class="chronicle-date">${cat.deathDay == null ? "Earlier loss" : `Day ${cat.deathDay}`}</span>
                <div class="chronicle-text">
                    <strong>${escapeHtml(cat.name)}</strong>
                    <div class="chronicle-type">${escapeHtml(rankLabel(cat))} · ${ageLabel(cat.age)}</div>
                    ${cat.deathCause ? `<div>${escapeHtml(cat.deathCause)}</div>` : ""}
                    ${cat.vigilTribute ? `
                        <p><strong>Remembered by ${escapeHtml(cat.vigilTribute.mournerName)}</strong><br>
                        ${escapeHtml(cat.vigilTribute.text)}</p>` : ""}
                </div>
            </article>
        `).join("") || '<p class="empty-state">No cats have joined StarClan yet.</p>';
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
        return `<div class="profile-heading">
      <div class="profile-name">${escapeHtml(c.name)}</div>
      <div class="profile-meta">
        ${escapeHtml(rankLabel(c))} · ${escapeHtml(c.sex)} · ${ageLabel(c.age)}
      </div>
      <div class="tag-row">
      <span class="tag">${escapeHtml(c.personality)}</span>
    </div>
    </div>

    <div class="profile-illustration">
      <canvas id="miniProfileCatCanvas"></canvas>
    </div>
    <p class="muted">${escapeHtml(catBio(c))}</p>
    <button class="button small" data-open-cat="${c.id}">view full profile</button>`;
    }

    function catBio(c) {
        const p = phenotype(c.genes);

        return `${c.name} is a ${c.personality} cat with ${p.base} ${p.pattern} markings and ${p.fur} fur. ${c.notes[c.notes.length - 1] || "Their story is still unfolding."
            }`;
    }

    function renderCatPortrait(canvas, cat) {
        CatRenderer.renderIcon(canvas, {
            ...phenotype(cat.genes),
            coatShade: cat.coatShade,
            whiteMarking: cat.whiteMarking,
            eyeColor: cat.eyeColor,
            rightEyeColor: cat.rightEyeColor
        }, { artwork: getCatArtwork(cat) });
    }

    function renderRoster() {
        const filter = $("rankFilter").value;

        const cats = livingCats()
            .filter(c => filter === "all" || rankLabel(c) === filter)
            .sort((a, b) =>
                RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) ||
                a.name.localeCompare(b.name)
            );

        $("catCount").textContent = cats.length;

        $("catRoster").innerHTML = cats.map(c =>
            `<button class="cat-row ${c.id === (selectedCatId || state.playerCatId) ? "selected" : ""}" data-select-cat="${c.id}">
        <span class="cat-row-info">
          <span class="cat-row-name">${escapeHtml(c.name)}</span>
          <span class="cat-row-sub">${escapeHtml(rankLabel(c))} · ${ageLabel(c.age)}</span>
        </span>
        <span class="cat-row-badge">${c.health < 40 ? "Unwell" : escapeHtml(c.personality)}</span>
      </button>`
        ).join("") || `<p class="empty-state">No cats match this filter.</p>`;

        const c = selectedCat();
        if (profileView.catId !== c?.id) {
            profileView = { catId: c?.id, tab: "overview", filter: "all", shared: "", showAll: false };
        }

        $("catDetails").innerHTML = c
            ? fullProfileHtml(c)
            : `<p class="empty-state">No cats remain.</p>`;

        if (c) {
            const traits = {
                ...phenotype(c.genes),
                coatShade: c.coatShade,
                whiteMarking: c.whiteMarking,
                eyeColor: c.eyeColor,
                rightEyeColor: c.rightEyeColor
            };

            const faceCanvas = $("profileCatCanvas");
            const fullCanvas = $("fullProfileCatCanvas");

            const artwork = getCatArtwork(c);

            if (faceCanvas) {
                renderCatPortrait(faceCanvas, c);
            }

            if (fullCanvas) {
                CatRenderer.renderCat(fullCanvas, traits, {
                    artwork
                });
            }
        }
    }

    function fullProfileHtml(c) {
        const skills = Object.entries(c.skills)
            .filter(([k]) =>
                ["hunting", "fighting", "stealth", "healing", "swimming", "climbing", "agility", "stamina"].includes(k)
            );
        const conditions = CatConditions.describe(c, state.day);
        if (c.griefUntilDay > state.day) conditions.push("grieving · slower daily energy recovery");

        const isPlayer = c.id === state.playerCatId;

        return `<div class="profile-heading">
      <div class="profile-name">${escapeHtml(c.name)}</div>
      <div class="profile-meta">
        ${escapeHtml(rankLabel(c))} · ${escapeHtml(c.sex)} · ${ageLabel(c.age)}
      </div>
      <div class="tag-row">
        <span class="tag">${escapeHtml(c.personality)}</span>
        ${isPlayer ? '<span class="tag">your viewpoint</span>' : ""}
      </div>
    </div>

    <div class="profile-illustration">
      <canvas id="fullProfileCatCanvas"></canvas>
    </div>

    ${conditions.length ? `
    <div class="profile-section">
      <h4>Conditions</h4>
      <ul>${conditions.map(condition => `<li>${escapeHtml(condition)}</li>`).join("")}</ul>
    </div>` : ""}
    <nav class="profile-tabs" aria-label="Cat profile">
      ${["Overview", "Relationships", "Memories"].map(label => {
          const tab = label.toLowerCase();
          return `<button type="button" class="profile-tab" data-profile-tab="${tab}"
              aria-controls="profilePanel" aria-current="${profileView.tab === tab ? "true" : "false"}">${label}</button>`;
      }).join("")}
    </nav>
    <div id="profilePanel" tabindex="-1">
    <br>
      ${profileView.tab === "relationships" ? profileRelationshipsHtml(c) :
          profileView.tab === "memories" ? profileMemoriesHtml(c) : profileOverviewHtml(c, skills, isPlayer)}
    </div>`;
    }

    function profileOverviewHtml(c, skills, isPlayer) {
        const p = phenotype(c.genes);
        const viewpoint = getCat(state.playerCatId);
        const revealed = c.hiddenQuirk === "secret_gift_giver" &&
            (c === viewpoint || c.giftStoryExposed || viewpoint?.memories?.some(memory =>
                ["uncovered_gift_giver", "betrayed_by_friend"].includes(memory.event) &&
                memory.participants?.includes(c.id)
            ));
        return `
    <p>${escapeHtml(catBio(c))}</p>

    ${revealed ? `<section class="profile-section">
      <h4>Discovered quirk</h4>
      <p><strong>Secret gift-giver</strong> · Leaves small gifts in a favorite cat’s nest.</p>
      <p><strong>Hidden motive</strong> · Wants a close friend all to themself.</p>
    </section>` : ""}

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
      <h4>Skills</h4>
      <div class="trait-grid">
        ${skills.map(([k, base]) => {
            const value = CatConditions.skill(c, k);
            return `<div class="trait">
            <div class="trait-label">${prettyTrait(k)}</div>
            <div class="trait-value">${value}/10${value < base ? ` (base ${base})` : ""}</div>
            <div class="meter"><span style="width:${value * 10}%"></span></div>
          </div>`;
        }).join("")}
      </div>
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

    <details class="profile-section profile-genetics">
      <summary>Genetic profile</summary>
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
    </details>`;
    }

    function profileControl(key, value, label, activeValue) {
        return `<button type="button" class="button small profile-control"
            data-profile-${key}="${escapeHtml(value)}"
            aria-pressed="${value === activeValue}">${escapeHtml(label)}</button>`;
    }

    function knowsAdmirer(cat, admirerId) {
        const knowsRumor = cat.relationships.knownGossip?.some(rumor =>
            rumor.type === "crush" && rumor.subjectId === admirerId && rumor.targetId === cat.id
        );
        return knowsRumor || cat.memories?.some(memory =>
            ["admirer_conversation", "mutual_confession", "rejected_confession"].includes(memory.event) &&
            memory.participants?.includes(admirerId)
        );
    }

    function visibleCrush(from, to) {
        return from.relationships.crushes?.includes(to.id) &&
            (to.id !== state.playerCatId || knowsAdmirer(to, from.id));
    }

    function describeRelationship(cat, other, bond, feeling, { mate, bestFriend, rival, crush, knownAdmirer }) {
        const past = !other.alive;
        const bondDescriptions = {
            "close bond": past ? "felt close to" : "feels close to",
            friendly: past ? "got along with" : "gets along with",
            neutral: past ? "had a neutral bond with" : "has a neutral bond with",
            strained: past ? "had a strained relationship with" : "has a strained relationship with",
            rivals: past ? "had a very strained relationship with" : "has a very strained relationship with"
        };
        const name = other.name;
        let description = `${cat.name} ${bondDescriptions[relationshipLabel(bond)]} ${name}.`;

        if (crush && bestFriend) {
            description = `${cat.name} ${past ? "had" : "has"} a crush on their best friend, ${name}.`;
        } else if (mate) {
            description = other.alive
                ? `${cat.name} and ${name} are mates.`
                : `${name} was ${cat.name}'s mate.`;
        } else if (crush) {
            description = `${cat.name} ${past ? "had" : "has"} a crush on ${name}.`;
        } else if (bestFriend) {
            description = `${cat.name} ${past ? "considered" : "considers"} ${name} a best friend.`;
        } else if (rival) {
            description = `${cat.name} ${past ? "saw" : "sees"} ${name} as a rival.`;
        }

        if (knownAdmirer) {
            description += past
                ? ` ${cat.name} knew ${name} had feelings for them.`
                : ` ${cat.name} knows ${name} has feelings for them.`;
        }

        const feelingDescriptions = {
            "strong admiration": past ? "looked up to them a great deal" : "looks up to them a great deal",
            "mild admiration": past ? "admired them" : "admires them",
            "strong jealousy": past ? "felt very jealous of them" : "feels very jealous of them",
            "mild jealousy": past ? "felt a little jealous of them" : "feels a little jealous of them"
        };
        if (feelingDescriptions[feeling]) {
            description += ` ${cat.name} also ${feelingDescriptions[feeling]}.`;
        }
        if (cat.memories?.some(memory =>
            memory.event === "betrayed_by_friend" &&
            (memory.rumorStarterId ?? memory.participants?.[0]) === other.id &&
            (!memory.privateOwnerId || memory.privateOwnerId === state.playerCatId)
        )) {
            description += ` ${cat.name} ${past ? "was" : "is"} wary of ${name} after learning who started the rumor.`;
        }
        return description;
    }

    function profileRelationshipsHtml(cat) {
        const filters = ["All", "Family", "Friends", "Romance", "Rivals"];
        const cards = [];

        for (const other of clanHistoryCats()) {
            if (other.id === cat.id) continue;
            const { mates, bestFriends, rivals, crushRivals } = cat.relationships;
            const bond = relationship(cat, other);
            const feeling = jealousyAdmirationLabel(jealousyAdmiration(cat, other));
            const formerMate = !other.alive && other.relationships.mates?.includes(cat.id);
            const mate = mates?.includes(other.id) || formerMate;
            const bestFriend = bestFriends?.includes(other.id);
            const rival = rivals?.includes(other.id);
            const crush = visibleCrush(cat, other);
            const knownAdmirer = visibleCrush(other, cat) && knowsAdmirer(cat, other.id);
            const ties = [];
            const categories = new Set();
            const addTie = (category, label) => {
                ties.push(label);
                categories.add(category);
            };

            if (mate) addTie("romance", other.alive ? "Mate" : "Late Mate");
            if (cat.parents?.includes(other.id)) addTie("family", "Parent");
            if (other.parents?.includes(cat.id)) addTie("family", "Offspring");
            if (cat.parents?.some(id => other.parents?.includes(id))) {
                const littermate = cat.bornDay != null && cat.bornDay === other.bornDay;
                addTie("family", littermate ? "Littermate" : "Sibling");
            }
            if (bestFriend) addTie("friends", "Best Friend");
            if (rival) addTie("rivals", "Rival");
            if (crushRivals?.includes(other.id)) addTie("rivals", "Romantic Rival");
            if (cat.mentorId === other.id) ties.push("Mentor");
            if (other.mentorId === cat.id) ties.push("Apprentice");
            const priority = ties.length ? 1 : 0;

            if (crush) addTie("romance", "Crush");
            if (knownAdmirer) addTie("romance", "Known admirer");
            if (bond >= 25) categories.add("friends");
            if (bond <= -20) categories.add("rivals");

            if (!other.alive && !categories.has("family") && !ties.length) continue;
            if (!ties.length && bond === 0 && feeling === "neutral") continue;
            if (profileView.filter !== "all" && !categories.has(profileView.filter)) continue;
            const description = describeRelationship(cat, other, bond, feeling, {
                mate, bestFriend, rival, crush, knownAdmirer
            });
            cards.push({ other, bond, description, ties, priority });
        }

        cards.sort((a, b) => b.priority - a.priority ||
            Math.abs(b.bond) - Math.abs(a.bond) || a.other.name.localeCompare(b.other.name));

        return `<div class="profile-controls" role="group" aria-label="Filter relationships">
            ${filters.map(label => profileControl("filter", label.toLowerCase(), label, profileView.filter)).join("")}
        </div>
        <div class="profile-card-list">
            ${cards.map(({ other, bond, description, ties }) => `
                <article class="profile-card">
                    <h4>${escapeHtml(other.name)}${other.alive ? "" : " <small>· Deceased</small>"}</h4>
                    ${ties.length ? `<div class="tag-row">${ties.map(tie => `<span class="tag">${escapeHtml(tie)}</span>`).join("")}</div>` : ""}
                    <p>${escapeHtml(description)}</p>
                    <p class="muted">${escapeHtml(cat.name)}’s bond · ${bond > 0 ? "+" : ""}${bond}</p>
                    <button type="button" class="button small" data-profile-shared="${escapeHtml(other.id)}"
                        aria-label="View shared memories with ${escapeHtml(other.name)}">View shared memories</button>
                </article>`).join("") || '<p class="muted">No relationships in this view yet.</p>'}
        </div>`;
    }

    function profileMemoriesHtml(cat) {
        const historyCats = clanHistoryCats();
        const shared = historyCats.find(other => other.id === profileView.shared);
        const catsById = new Map(historyCats.map(other => [other.id, other]));
        const memories = (cat.memories ?? []).filter(memory => {
            if (shared && !memory.participants?.includes(shared.id)) return false;
            if (memory.event !== "developed_crush" && memory.privateOwnerId &&
                memory.privateOwnerId !== state.playerCatId) return false;
            if (memory.event !== "developed_crush") return true;
            // Older saves gave both cats the same private crush memory.
            const ownerId = memory.privateOwnerId ??
                (memory.description?.startsWith(`${cat.name} has started developing feelings`) ? cat.id : null);
            const target = catsById.get(memory.participants?.[0]);
            return ownerId === cat.id && (!target || target.id !== state.playerCatId || knowsAdmirer(target, cat.id));
        }).reverse().sort((a, b) => (b.day ?? 0) - (a.day ?? 0));

        function timeline(entries) {
            return `<ol class="profile-card-list memory-timeline">${entries.map(memory => {
                const title = memory.event === "starclan_dream"
                    ? "StarClan dream"
                    : prettyTrait((memory.event || "Memory").replaceAll("_", " "));
                const participants = (memory.participants ?? [])
                    .map(id => catsById.get(id)?.name)
                    .filter(Boolean);
                const description = memory.description?.includes("{") ? "" : memory.description;
                return `<li class="profile-card">
                    ${memory.day == null ? "" : `<div class="muted">Day ${escapeHtml(memory.day)}</div>`}
                    <h4>${escapeHtml(title)}</h4>
                    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
                    ${participants.length ? `<p class="muted">With ${escapeHtml(participants.join(", "))}</p>` : ""}
                </li>`;
            }).join("")}</ol>`;
        }

        const defining = memories.filter(memory => (memory.importance ?? 1) >= 4);
        const otherMemories = memories.filter(memory => {
            const importance = memory.importance ?? 1;
            return importance < 4 && (importance >= 3 || profileView.showAll);
        });
        return `
            ${shared ? `<div class="profile-controls">
                <strong>With ${escapeHtml(shared.name)}</strong>
                <button type="button" class="button small" data-profile-shared="">Clear filter</button>
            </div>` : ""}
            ${defining.length ? `<section class="profile-section">
                <h4>Defining memories</h4>${timeline(defining)}
            </section>` : ""}
            <section class="profile-section">
                <div class="profile-controls memory-heading">
                    <h4>Timeline</h4>
                    ${memories.some(memory => (memory.importance ?? 1) < 3) ? `
                        <button type="button" class="button small" data-profile-show-all
                            aria-pressed="${profileView.showAll}">${profileView.showAll ? "Hide routine memories" : "Show all"}</button>` : ""}
                </div>
                ${otherMemories.length ? timeline(otherMemories) : `<p class="muted">${defining.length
                    ? "No other memories in this view." : "No important memories in this view yet."}</p>`}
            </section>`;
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
            !areCloseRelatives(a, b) &&
            (
                a.age >= 12 && b.age >= 12 ||
                a.age >= 6 && a.age < 12 && a.rank === "Apprentice" &&
                b.age >= 6 && b.age < 12 && b.rank === "Apprentice"
            )
        );
    }

    function canKeepCrush(a, b) {
        if (canHaveCrush(a, b)) return true;
        if (!a || !b || a.id === b.id || !a.alive || !b.alive || areCloseRelatives(a, b)) return false;

        const younger = a.age < b.age ? a : b;
        const older = younger === a ? b : a;
        return younger.rank === "Apprentice" && younger.age >= 6 && younger.age < 12 &&
            older.age >= 12 && older.age - younger.age <= 3;
    }

    const CRUSH_DURATION = 20;
    const MULTIPLE_CRUSH_PERSONALITIES = ["bold", "curious", "playful"];

    function romanceCooldownMoons(cat, reason) {
        const baseMoons = reason === "death" ? 10 : 6;
        const adjustment = MULTIPLE_CRUSH_PERSONALITIES.includes(cat.personality) ? -3 :
            ["loyal", "wary", "stubborn"].includes(cat.personality) ? 3 : 0;
        return baseMoons + adjustment;
    }

    function startRomanceCooldown(cat, reason, day = state.day) {
        const readyDay = day + romanceCooldownMoons(cat, reason) * DAYS_PER_MOON;
        cat.romanceReadyDay = Math.max(cat.romanceReadyDay ?? 0, readyDay);
    }

    function endMateTie(cat, mateId, reason, day) {
        const rels = cat.relationships;
        rels.mates = rels.mates.filter(id => id !== mateId);
        if (rels.mateConcerns?.[mateId]) rels.mateConcerns[mateId].pending = null;
        startRomanceCooldown(cat, reason, day);
    }

    function romanceWait(cat) {
        return Math.max(0, (cat.romanceReadyDay ?? 0) - state.day);
    }

    function crushLimit(cat) {
        return MULTIPLE_CRUSH_PERSONALITIES.includes(cat.personality) ? 2 : 1;
    }

    function canStartCrush(cat, target) {
        return canHaveCrush(cat, target) &&
            !romanceWait(cat) &&
            !cat.relationships.mates.includes(target.id) &&
            !cat.relationships.crushes.includes(target.id) &&
            cat.relationships.crushes.length < crushLimit(cat);
    }

    function updateCrushEligibility() {
        const cats = livingCats();
        for (const cat of cats) {
            const rels = cat.relationships;
            const startDays = rels.crushStartDays || {};
            const validCrushes = [...new Set(rels.crushes)]
                .map(getCat)
                .filter(target => canKeepCrush(cat, target) && !rels.mates.includes(target.id))
                .filter(target => state.day - (startDays[target.id] ?? state.day) < CRUSH_DURATION)
                .sort((a, b) => relationship(cat, b) - relationship(cat, a))
                .slice(0, crushLimit(cat));
            rels.crushes = validCrushes.map(target => target.id);
            rels.crushStartDays = Object.fromEntries(rels.crushes.map(id => [id, startDays[id] ?? state.day]));

            for (const id of Object.keys(rels.secretPartners || {})) {
                const target = getCat(id);
                if (target && areCloseRelatives(cat, target)) delete rels.secretPartners[id];
            }
            for (const [id, concern] of Object.entries(rels.mateConcerns || {})) {
                if (!concern.pending) continue;
                const mate = getCat(id);
                const target = state.cats.find(candidate => candidate.id === concern.pending.targetId);
                if (mate && target && areCloseRelatives(mate, target)) concern.pending = null;
            }
        }
        updateCrushRivalries(cats);
    }

    function updateCrushRivalries(cats) {
        for (const cat of cats) {
            const rels = cat.relationships;
            const activeTargets = {};
            for (const id of rels.crushRivals || []) {
                const rival = getCat(id);
                if (!rival) continue;
                const targets = (rels.crushRivalTargets?.[id] ?? rels.crushes)
                    .filter(targetId => rels.crushes.includes(targetId) &&
                        rival.relationships.crushes.includes(targetId));
                if (targets.length) activeTargets[id] = targets;
            }
            rels.crushRivalTargets = activeTargets;
            rels.crushRivals = Object.keys(activeTargets);
        }
    }

    function clearCrush(cat, target) {
        const rels = cat.relationships;
        if (!rels.crushes.includes(target.id)) return;
        rels.crushes = rels.crushes.filter(id => id !== target.id);
        if (rels.crushStartDays) delete rels.crushStartDays[target.id];

        updateCrushRivalries(livingCats());
    }

    function clearOutsideTie(cat, targetId) {
        const target = getCat(targetId);
        if (target) clearCrush(cat, target);
        if (cat.relationships.secretPartners) delete cat.relationships.secretPartners[targetId];
        if (target?.relationships.secretPartners) delete target.relationships.secretPartners[cat.id];
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
            !areCloseRelatives(a, b) &&
            (a.relationships.mates.includes(b.id) || !romanceWait(a)) &&
            (b.relationships.mates.includes(a.id) || !romanceWait(b)) &&
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

    function addCrush(a, b) {
        if (!canStartCrush(a, b)) return false;
        a.relationships.crushes.push(b.id);
        a.relationships.crushStartDays ??= {};
        a.relationships.crushStartDays[b.id] = state.day;
        return true;
    }

    function tryDevelopCrush(cat, other) {
        const attraction = other.sex === "male" ? cat.attractionToMales : cat.attractionToFemales;
        const crushChance = 0.02 + (attraction / 100) * 0.03;
        if (!canStartCrush(cat, other) || attraction <= 0 || relationship(cat, other) < 25 ||
            cat.relationships.mates.length ||
            !chance(crushChance) || !addCrush(cat, other)) {
            return "";
        }

        const text = `${cat.name} has started developing feelings for ${other.name}.`;
        logEvent("romance", text);
        recordCatEvent("developed_crush", [cat, other], {
            importance: 3,
            privateOwnerId: cat.id,
            description: text
        });
        return text;
    }

    function updateBestFriendship(a, b) {
        return window.Relationships.updateBestFriendship(a, b);
    }

    function updateRivalry(a, b) {
        return window.Relationships.updateRivalry(a, b);
    }

    function createCrushRivalry(a, b, sharedCrush) {
        return window.Relationships.createCrushRivalry(a, b, sharedCrush);
    }

    // find all cats who have an actual crush on another cat
    function getConfessionCandidates() {
        const cats = livingCats();

        return cats.flatMap(confessor => {
            if (
                confessor.age < 12 ||
                !Array.isArray(confessor.relationships?.crushes)
            ) {
                return [];
            }

            return confessor.relationships.crushes
                .map(targetId => cats.find(cat => cat.id === targetId))
                .filter(target =>
                    target &&
                    target.id !== confessor.id &&
                    target.age >= 12
                )
                .map(target => ({
                    confessor,
                    target
                }));
        });
    }

    // randomly select a potential confession pair
    function pickConfessionPair() {
        const candidates = getConfessionCandidates();

        if (candidates.length === 0) return null;

        return candidates[
            Math.floor(Math.random() * candidates.length)
        ];
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

        const historyCats = clanHistoryCats();
        const litters = historyCats.filter(c => c.parents.length);

        $("familyNotes").innerHTML = litters.length
            ? litters.slice(-8).reverse().map(c =>
                `<div class="event-item">
          <span class="event-dot"></span>
          <div>
            <strong>${escapeHtml(c.name)}</strong> joined the clan.
            <small>
              Parents: ${c.parents.map(id =>
                    historyCats.find(x => x.id === id)?.name || "unknown"
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

        const eligibility = canHaveLitter(a, b);
        const fertilityChance = Math.round(a.fertility * b.fertility / 100);

        $("breedingPreview").innerHTML = `
      <div class="preview-title">Inheritance preview</div>
      <p>${escapeHtml(a.name)} (${geneDescription(a)}) × ${escapeHtml(b.name)} (${geneDescription(b)})</p>
      <div class="gene-line"><span>Long fur (l/l)</span><span>${expectedRecessive(a, b, "L", "l")} chance</span></div>
      <div class="gene-line"><span>Chocolate base (b/b)</span><span>${expectedRecessive(a, b, "B", "b")} chance</span></div>
      <div class="gene-line"><span>Dilution (d/d)</span><span>${expectedRecessive(a, b, "D", "d")} chance</span></div>
      <div class="gene-line"><span>High white (S/S)</span><span>${expectedRecessive(a, b, "S", "S")} chance</span></div>
      <p class="fine-print">${escapeHtml(eligibility.reason || `Chance of a litter per attempt: ${fertilityChance}%.`)}</p>`;
    }

    function areCloseRelatives(a, b) {
        const parentsA = a.parents || [];
        const parentsB = b.parents || [];
        return parentsA.includes(b.id) || parentsB.includes(a.id) ||
            parentsA.some(id => parentsB.includes(id));
    }

    function canHaveLitter(a, b) {
        if (!a || !b || !a.alive || !b.alive || a.id === b.id || a.age < 12 || b.age < 12) {
            return { allowed: false, reason: "Choose two different living adults who are at least 12 moons old." };
        }
        if (a.sex === b.sex) {
            return { allowed: false, reason: "A litter requires one male and one female parent." };
        }
        if (areCloseRelatives(a, b)) {
            return { allowed: false, reason: "Parents and their kits, and cats sharing a parent, cannot breed together." };
        }
        if (!canBecomeMates(a, b)) {
            const waiting = [a, b].find(cat => !cat.relationships.mates.length && romanceWait(cat));
            if (waiting) {
                const days = romanceWait(waiting);
                const moons = Math.floor(days / DAYS_PER_MOON);
                const remainingDays = days % DAYS_PER_MOON;
                const wait = [
                    moons ? `${moons} ${moons === 1 ? "moon" : "moons"}` : "",
                    remainingDays ? `${remainingDays} ${remainingDays === 1 ? "day" : "days"}` : ""
                ].filter(Boolean).join(" and ");
                return { allowed: false, reason: `${waiting.name} needs ${wait} before taking a new mate.` };
            }
            return { allowed: false, reason: "One of these cats already has another mate." };
        }
        for (const cat of [a, b]) {
            if (cat.health < FAMILY_RULES.minimumHealth) {
                return { allowed: false, reason: `${cat.name} needs at least ${FAMILY_RULES.minimumHealth} health before breeding.` };
            }
            const litterWait = cat.lastLitterDay === null ? 0 :
                FAMILY_RULES.litterCooldown - (state.day - cat.lastLitterDay);
            const attemptWait = cat.lastBreedingAttemptDay === null ? 0 :
                FAMILY_RULES.attemptCooldown - (state.day - cat.lastBreedingAttemptDay);
            const wait = Math.max(litterWait, attemptWait);
            if (wait > 0) {
                return { allowed: false, reason: `${cat.name} can try for kits again in ${wait} days.` };
            }
        }
        return { allowed: true, reason: "" };
    }

    function breedLitter() {
        const result = attemptLitter(getCat($("parentA").value), getCat($("parentB").value));
        showNotice(result.message);
        render();
    }

    function attemptLitter(a, b) {
        const eligibility = canHaveLitter(a, b);
        if (!eligibility.allowed) return { kits: [], message: eligibility.reason };

        a.lastBreedingAttemptDay = state.day;
        b.lastBreedingAttemptDay = state.day;
        if (!chance(a.fertility * b.fertility / 10000)) {
            const message = `${a.name} and ${b.name} tried for kits, but no litter arrived. They can try again in ${FAMILY_RULES.attemptCooldown} days.`;
            logEvent("family", message);
            saveGame(false);
            return { kits: [], message };
        }
        const kits = createLitter(a, b);
        a.lastLitterDay = state.day;
        b.lastLitterDay = state.day;
        saveGame(false);
        return { kits, message: `${kits.length} ${kits.length === 1 ? "kit" : "kits"} joined the clan!` };
    }

    function createLitter(a, b) {
        // Record the parents as mates.
        if (!a.relationships.mates.includes(b.id)) {
            a.relationships.mates.push(b.id);
        }

        if (!b.relationships.mates.includes(a.id)) {
            b.relationships.mates.push(a.id);
        }

        // Clear crushes between these two cats.
        clearOutsideTie(a, b.id);
        clearCrush(b, a);

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

        for (const [parent, mate] of [[a, b], [b, a]]) {
            rememberEvent(parent, "litter_arrived", {
                importance: 4,
                participants: [mate.id, ...kits.map(kit => kit.id)],
                description: `${a.name} and ${b.name}'s litter arrived: ${kits.map(kit => kit.name).join(", ")}.`
            });
        }
        return kits;
    }

    function updateFamilies() {
        const processedPairs = new Set();
        for (const cat of livingCats()) {
            for (const mateId of cat.relationships.mates) {
                const mate = getCat(mateId);
                if (!mate || cat.id === state.playerCatId || mate.id === state.playerCatId) continue;
                const key = [cat.id, mate.id].sort().join(":");
                if (processedPairs.has(key)) continue;
                processedPairs.add(key);
                if (canHaveLitter(cat, mate).allowed && chance(FAMILY_RULES.dailyNpcChance)) {
                    attemptLitter(cat, mate);
                }
            }
        }

        const nursery = livingCats().filter(cat => cat.age < 6);
        CatConditions.recordContact(nursery, "close", state.day);
        for (const kit of nursery) {
            const parents = (kit.parents || []).map(getCat).filter(Boolean);
            if (!parents.length || !chance(FAMILY_RULES.dailyParentChance)) continue;
            const parent = pick(parents);
            let description = `${parent.name} spent time with ${kit.name} in the nursery.`;
            if (kit.age >= 3) {
                const skills = ["hunting", "stealth", "agility", "curiosity"];
                const teachable = skills.filter(skill =>
                    kit.skills[skill] < 3 && CatConditions.skill(parent, skill) > kit.skills[skill]
                );
                if (teachable.length) {
                    const skill = pick(teachable);
                    kit.skills[skill] += 1;
                    description = `${parent.name} taught ${kit.name} a little about ${skill} through play.`;
                }
            }
            setRelationship(parent, kit, relationship(parent, kit) + 3);
            recordCatEvent("family_time", [parent, kit], { importance: 2, description });
        }
    }

    function activePredatorRisk() {
        if (!state.predatorRisk || state.day >= state.predatorRisk.expiresDay) {
            state.predatorRisk = null;
            return 0;
        }
        return state.predatorRisk.bonus;
    }

    function applyEncounterResult(result, patrol) {
        return applyStoryChoice(result, patrol) || result.outcome;
    }

    function resolveStoryFootprints(patrol, warned) {
        CatConditions.recordContact(patrol, "patrol", state.day);
        const result = window.StoryEvents.resolveFootprintsEncounter(patrol, warned, activePredatorRisk());
        return applyEncounterResult(result, patrol);
    }

    function resolvePendingFootprints() {
        const due = state.pendingFootprints.filter(encounter => encounter.day <= state.day);
        state.pendingFootprints = state.pendingFootprints.filter(encounter => encounter.day > state.day);

        return due.map(encounter => {
            const patrol = encounter.catIds.map(getCat).filter(cat => cat && !cat.quarantined);
            const outcome = patrol.length
                ? resolveStoryFootprints(patrol, true)
                : "None of the original patrol cats are available to investigate.";
            logEvent("story", `Strange Footprints — ${outcome}`);
            return outcome;
        });
    }

    function renderTerritory() {
        renderMedicineDen();
        const hunter = shortHuntCandidate();
        $("territoryGrid").innerHTML = (hunter ? `
            <button type="button" class="location-card" id="shortHuntBtn">
                <h3>Short hunt near camp</h3>
                <p>${escapeHtml(hunter.name)} can bring back a small catch for the cats who need it most.</p>
                <span class="location-difficulty">Once per day</span>
            </button>` : "") + LOCATIONS.map(loc =>
            `<button class="location-card" data-patrol="${loc.id}">
        <span class="location-emoji">${loc.emoji}</span>
        <h3>${loc.name}</h3>
        <p>${loc.desc}</p>
        <span class="location-difficulty">${loc.difficulty} patrol</span>
      </button>`
        ).join("");

        const c = playerCat();

        $("individualModeText").textContent = c
            ? `You are seeing the world through ${c.name}'s eyes (${rankLabel(c)}). Personal actions affect their skills, energy, wellbeing, and relationships.`
            : "Choose a living cat in the Clan tab.";
    }

    function needsIsolation(cat) {
        return cat.health < 60 || cat.conditions?.some(condition => condition.stageDay <= state.day);
    }

    function hasGreencough(cat) {
        return cat.conditions?.some(condition => condition.id === "greencough" && condition.stageDay <= state.day);
    }

    function medicineApprentice(healer) {
        return livingCats().find(cat => cat.rank === "Apprentice" && cat.mentorId === healer.id);
    }

    function reservedMedicineKit(healer) {
        const kit = getCat(healer.reservedMedicineKitId);
        return kit?.rank === "Kit" ? kit : undefined;
    }

    function hasMedicineApprenticeSlot() {
        const cats = livingCats();
        const apprentices = cats.filter(cat => cat.rank === "Apprentice" && cat.medicineTrack);
        const reservedIds = new Set(cats.filter(cat => cat.rank === "Medicine Cat")
            .map(reservedMedicineKit).filter(Boolean).map(kit => kit.id));
        return apprentices.length + reservedIds.size < MEDICINE_APPRENTICE_LIMIT;
    }

    function medicineKitCandidates() {
        if (!hasMedicineApprenticeSlot()) return [];
        const cats = livingCats();
        const reservedIds = new Set(cats.filter(cat => cat.rank === "Medicine Cat")
            .map(cat => cat.reservedMedicineKitId));
        return cats.filter(cat => cat.rank === "Kit" && cat.age < 6 && !reservedIds.has(cat.id));
    }

    function medicineApprenticeCandidates(allowTransfers = false) {
        const hasSlot = hasMedicineApprenticeSlot();
        return livingCats().filter(cat => {
            if (cat.rank !== "Apprentice" || cat.quarantined) return false;
            const mentor = getCat(cat.mentorId);
            return cat.medicineTrack ? mentor?.rank !== "Medicine Cat" : hasSlot && (allowTransfers || !mentor);
        });
    }

    function canChooseMedicineApprentice(healer) {
        return healer?.rank === "Medicine Cat" && !healer.quarantined && healer.health >= 35 &&
            !medicineApprentice(healer) && !reservedMedicineKit(healer);
    }

    function assignMedicineApprentice(healer, apprentice) {
        apprentice.mentorId = healer.id;
        apprentice.medicineTrack = true;
        const message = `${healer.name} chose ${apprentice.name} as their medicine cat apprentice.`;
        logEvent("training", message);
        return message;
    }

    function gatherHerbs(healer, location) {
        if (healer.lastHerbDay === state.day) {
            return `${healer.name} has already gathered herbs today.`;
        }
        healer.lastHerbDay = state.day;
        const amount = rand(1, 3);
        state.herbs += amount;
        const message = `${healer.name} gathered ${amount} ${amount === 1 ? "herb" : "herbs"} at ${location.name}.`;
        logEvent("herbs", message);
        return message;
    }

    function diagnosePatient(healer, patient, logDiagnosis = true) {
        const visible = (patient.conditions ?? []).filter(condition => condition.stageDay <= state.day);
        const newFindings = visible.filter(condition =>
            condition.diagnosedSeverity !== condition.severity || condition.diagnosedStageDay !== condition.stageDay);
        for (const condition of newFindings) {
            condition.diagnosedSeverity = condition.severity;
            condition.diagnosedStageDay = condition.stageDay;
        }
        healer.diagnosisExperience ??= 0;
        healer.diagnosisExperience += newFindings.length;
        while (healer.diagnosisExperience >= 3 && (healer.skills.healing ?? 0) < 10) {
            healer.diagnosisExperience -= 3;
            healer.skills.healing = (healer.skills.healing ?? 0) + 1;
            logEvent("training", `${healer.name}'s healing skill improved through diagnosis.`);
        }
        if (healer.skills.healing >= 10) healer.diagnosisExperience = 0;
        const findings = CatConditions.describe(patient, state.day).join("; ");
        const message = `${healer.name} examined ${patient.name}. ${findings || "No active injury or illness found"}.`;
        if (logDiagnosis && newFindings.length) logEvent("diagnosis", message);
        return message;
    }

    function treatPatient(healer, patient) {
        state.herbs--;
        healer.lastTreatmentDay = state.day;
        const message = CatConditions.treat(healer, patient, state.day);
        logEvent("treatment", message);
        return message;
    }

    function setQuarantine(patient, isolated) {
        patient.quarantined = isolated;
        const message = isolated ? `${patient.name} is resting in the medicine den.` :
            `${patient.name} left the medicine den.`;
        logEvent("condition", message);
        return message;
    }

    function renderMedicineDen() {
        const den = $("medicineDen");
        const healer = playerCat();
        den.hidden = healer?.rank !== "Medicine Cat";
        if (den.hidden) {
            den.replaceChildren();
            return;
        }

        const cats = livingCats();
        const treatment = CatConditions.patientsNeedingTreatment(cats, state.day);
        const patients = cats.filter(cat => needsIsolation(cat) || cat.quarantined);
        const apprentice = medicineApprentice(healer);
        const reservedKit = reservedMedicineKit(healer);
        const unavailable = healer.quarantined || healer.health < 35;
        const button = (action, label, cat, disabled = false) =>
            `<button type="button" class="button primary" data-medicine-action="${action}" data-patient="${escapeHtml(cat.id)}"${disabled ? " disabled" : ""}>${label}</button>`;
        const choices = apprentice || reservedKit ? "" : [
            ...medicineKitCandidates().map(cat => button("reserve-kit", `Reserve ${escapeHtml(cat.name)}`, cat, unavailable)),
            ...medicineApprenticeCandidates(true).map(cat => button("apprentice", `Choose ${escapeHtml(cat.name)}`, cat, unavailable))
        ].join("");

        den.innerHTML = `
            <h2>Medicine Cat Den</h2>
            <p>Herbs in Storage: <strong>${state.herbs}</strong> · Healing: <strong>${healer.skills.healing ?? 0}/10</strong>
            ${(healer.skills.healing ?? 0) < 10 ? ` · Diagnostic Experience: ${healer.diagnosisExperience ?? 0}/3` : ""}</p>
            <p>Each medicine cat can gather herbs once per day. <br>Diagnose illnesses and injuries to level up healing skill.</p>
            ${unavailable ? "<p>Rest until you can care for other cats again.</p>" : ""}
            <h3>Patients</h3>
            ${patients.map(cat => {
                const available = !unavailable || cat === healer;
                const diagnosed = (cat.conditions ?? []).some(condition => condition.stageDay <= state.day &&
                    condition.diagnosedSeverity === condition.severity && condition.diagnosedStageDay === condition.stageDay);
                const status = !needsIsolation(cat) ? "Healthy" :
                    diagnosed ? CatConditions.describe(cat, state.day).join("; ") : "Unwell";
                return `<div class="profile-card">
                    <strong>${escapeHtml(cat.name)}</strong>
                    <p>${escapeHtml(status)}${cat.quarantined ? " · In quarantine" : ""}</p>
                    <div class="profile-controls">
                        ${button("diagnose", "Diagnose", cat, !available)}
                        ${button("treat", "Treat (1 herb)", cat, !available || !state.herbs ||
                            healer.lastTreatmentDay === state.day || !treatment.some(patient => patient.cat === cat))}
                        ${button(cat.quarantined ? "release" : "quarantine", cat.quarantined ? "Release" : "Quarantine", cat, !available)}
                    </div>
                </div>`;
            }).join("") || "<p>No cats need care today.</p>"}
            <h3>Apprentice</h3>
            ${apprentice ? `<p>${escapeHtml(apprentice.name)} is training with you.</p>` : reservedKit ? `
                <p>You privately chose ${escapeHtml(reservedKit.name)}. The clan will learn of your choice when the kit turns 6 moons old.</p>
                ${button("cancel-reservation", "Cancel reservation", reservedKit, unavailable)}
            ` : choices ? `
                <p>Reserve a kit privately or choose an apprentice to start medicine cat training now.</p>
                <div class="profile-controls">${choices}</div>
            ` : hasMedicineApprenticeSlot()
                ? "<p>No kits or apprentices are available.</p>"
                : `<p>All ${MEDICINE_APPRENTICE_LIMIT} medicine cat apprentice slots are filled.</p>`}
        `;
    }

    function handleMedicineAction(action, id) {
        const healer = playerCat();
        const cat = getCat(id);
        if (healer?.rank !== "Medicine Cat" || !cat ||
            (healer !== cat && (healer.quarantined || healer.health < 35))) return;

        let message;
        if (action === "diagnose" && needsIsolation(cat)) {
            message = diagnosePatient(healer, cat);
        } else if (action === "treat" && state.herbs && healer.lastTreatmentDay !== state.day) {
            const patient = CatConditions.patientsNeedingTreatment([cat], state.day)[0];
            if (patient) message = treatPatient(healer, patient);
        } else if (action === "quarantine" && !cat.quarantined && needsIsolation(cat)) {
            message = setQuarantine(cat, true);
        } else if (action === "release" && cat.quarantined) {
            message = setQuarantine(cat, false);
        } else if (action === "reserve-kit" && canChooseMedicineApprentice(healer) &&
            medicineKitCandidates().includes(cat)) {
            healer.reservedMedicineKitId = cat.id;
            message = "Kit reserved privately.";
        } else if (action === "cancel-reservation" && reservedMedicineKit(healer) === cat) {
            delete healer.reservedMedicineKitId;
            message = "Apprentice reservation canceled.";
        } else if (action === "apprentice" && canChooseMedicineApprentice(healer) &&
            medicineApprenticeCandidates(true).includes(cat)) {
            message = assignMedicineApprentice(healer, cat);
        }

        if (!message) return;
        saveGame(false);
        render();
        showNotice(message);
    }

    function runMedicineCatDay() {
        const cats = livingCats();
        const healers = cats.filter(cat => cat.rank === "Medicine Cat");
        const selectionChance = 0.2 ** Math.max(0, healers.length - 1);
        const busy = new Set();
        for (const cat of cats) {
            if (cat.quarantined && !needsIsolation(cat)) setQuarantine(cat, false);
        }

        for (const healer of healers) {
            if (healer.id === state.playerCatId || healer.health < 35 || healer.energy < 20) continue;
            const accessible = healer.quarantined ? [healer] : cats;
            for (const cat of accessible) {
                if (!cat.quarantined && hasGreencough(cat)) {
                    setQuarantine(cat, true);
                    busy.add(healer.id);
                }
            }
            const patients = healer.quarantined ? [healer] : cats;
            const patient = CatConditions.patientsNeedingTreatment(patients, state.day)[0];
            if (patient) {
                diagnosePatient(healer, patient.cat, false);
                busy.add(healer.id);
            }
            if (!healer.quarantined && state.herbs < 3) {
                const location = LOCATIONS.find(loc => loc.id !== "moonpool");
                gatherHerbs(healer, location);
                healer.energy = clamp(healer.energy - 10, 0, 100);
                busy.add(healer.id);
            }
            if (patient && state.herbs && healer.lastTreatmentDay !== state.day) treatPatient(healer, patient);

            if (canChooseMedicineApprentice(healer)) {
                const kits = medicineKitCandidates();
                const candidates = (kits.length ? kits : medicineApprenticeCandidates()).sort((a, b) =>
                    (b.skills.healing ?? 0) - (a.skills.healing ?? 0) ||
                    (b.faith ?? 50) - (a.faith ?? 50));
                const candidate = candidates[0];
                if (candidate && (candidate.medicineTrack || selectionChance === 1 || chance(selectionChance))) {
                    if (candidate.rank === "Kit") healer.reservedMedicineKitId = candidate.id;
                    else assignMedicineApprentice(healer, candidate);
                    busy.add(healer.id);
                }
            }
        }
        return busy;
    }

    function resolveMedicineDream(warnClan) {
        const dream = state.medicineDream;
        if (!dream) return;
        state.medicineDream = null;
        state.disaster = { ...dream, warnClan };
        const healer = getCat(dream.healerId);
        const response = warnClan
            ? `${healer.name} warned the clan about a coming flood. The clan began preparing.`
            : `${healer.name} kept the warning private and prepared for the flood alone.`;
        const message = dream.omen ? `${dream.omen} ${response}` : response;
        rememberEvent(healer, "flood_omen", {
            description: dream.omen ? message : `${healer.name} dreamed of floodwater rising through the camp. ${response}`,
            importance: 4,
            participants: dream.visitorId ? [dream.visitorId] : []
        });
        logEvent("dream", message);
        saveGame(false);
        return message;
    }

    function showMedicineDream() {
        const dream = state.medicineDream;
        if (!dream) return false;
        const healer = getCat(dream.healerId);
        if (!healer) {
            state.medicineDream = null;
            return false;
        }

        if (healer.id !== state.playerCatId) {
            const open = ["gentle", "loyal", "bold"].includes(healer.personality);
            const guarded = ["wary", "proud", "stubborn"].includes(healer.personality);
            const shareChance = .55 + ((healer.faith ?? 50) - 50) / 250 +
                (open ? .25 : 0) - (guarded ? .25 : 0);
            resolveMedicineDream(chance(shareChance));
            return false;
        }

        StoryEvents.showStoryEvent({
            title: "A Warning in Water",
            description: `${dream.omen ?? `${healer.name} dreamed of floodwater rising through the camp.`} Will ${healer.name} warn the clan or prepare alone?`,
            decisionMaker: "healer",
            choices: [
                { id: "warn_clan", text: "Warn the clan" },
                { id: "keep_private", text: "Keep the warning private" }
            ]
        }, { healer }, choice => {
            const message = resolveMedicineDream(choice.id === "warn_clan");
            render();
            if (message) showNotice(message);
        });
        return true;
    }

    function rollMedicineDream() {
        if (state.disaster || state.day < state.nextDreamDay) return false;
        for (const healer of livingCats().filter(cat => cat.rank === "Medicine Cat")) {
            if (!chance(clamp(healer.faith ?? 50, 0, 100) * .002)) continue;
            state.nextDreamDay = state.day + 10;
            const visitor = state.starClan.length ? pick(state.starClan) : null;
            if (!chance(.65)) {
                const description = visitor
                    ? `${visitor.name} visited ${healer.name} in a dream. They sat together under the stars until dawn.`
                    : `${healer.name} dreamed of stars reflected in still water and woke without a clear omen.`;
                rememberEvent(healer, visitor ? "starclan_dream" : "dream", {
                    description,
                    importance: 3,
                    participants: visitor ? [visitor.id] : []
                });
                logEvent("dream", description);
                return false;
            }
            const omen = visitor
                ? `${visitor.name} appeared in ${healer.name}'s dream and showed them floodwater rising through the camp.`
                : `${healer.name} dreamed of floodwater rising through the camp.`;
            state.medicineDream = { healerId: healer.id, day: state.day + rand(2, 4), omen, visitorId: visitor?.id };
            return showMedicineDream();
        }
        return false;
    }

    function resolveDisaster() {
        const disaster = state.disaster;
        if (!disaster || disaster.day > state.day) return "";
        state.disaster = null;

        const report = ["Floodwater swept through camp before dawn."];
        const deaths = [];
        for (const cat of livingCats()) {
            const prepared = disaster.warnClan || cat.id === disaster.healerId;
            const roll = Math.random();
            if (roll < (prepared ? .005 : .025)) {
                deaths.push(cat.name);
                recordDeath(cat, `${cat.name} died in the flood.`);
            } else if (roll < (prepared ? .09 : .30)) {
                cat.health = Math.max(1, cat.health - rand(8, 20));
                const recorded = CatConditions.add(cat, chance(.25) ? "brokenLeg" : "scrape", state.day,
                    (type, message) => report.push(message));
                if (!recorded) report.push(`${cat.name} was hurt escaping the flood.`);
            }
        }
        if (report.length === 1 && deaths.length === 0) report.push("Every cat escaped safely.");
        const summary = report.join(" ");
        logEvent("disaster", summary);
        return deaths.length ? `${summary} ${new Intl.ListFormat("en").format(deaths)} died in the flood.` : summary;
    }

    function runPatrol(locationId) {
        const loc = LOCATIONS.find(l => l.id === locationId);
        if (!loc) return;

        const player = playerCat();
        const candidates = livingCats().filter(canPatrol);

        if (candidates.length < 1) {
            showNotice(shortHuntCandidate()
                ? "No cats are ready for a regular patrol. Try a short hunt near camp."
                : "No cats are ready for another patrol today. Let the clan rest.");
            return;
        }

        const patrol = candidates
            .sort((a, b) =>
                Number(b === player && b.rank === "Medicine Cat") -
                Number(a === player && a.rank === "Medicine Cat") ||
                CatConditions.skill(b, loc.skill) - CatConditions.skill(a, loc.skill))
            .slice(0, 3);
        const healer = player?.rank === "Medicine Cat" && player.lastHerbDay === state.day
            ? player
            : patrol.find(cat => cat.rank === "Medicine Cat");
        if (healer?.lastHerbDay === state.day && healer.lastHerbNoticeDay !== state.day) {
            healer.lastHerbNoticeDay = state.day;
            saveGame(false);
            showNotice(`${healer.name} has already gathered herbs today. Choose a patrol to continue.`);
            return;
        }

        const result = resolvePatrol(loc, patrol, healer?.lastHerbDay !== state.day ? healer : undefined);
        saveGame(false);
        showNotice(result);
        render();
    }

    function canPatrol(cat) {
        return cat.age >= 6 && cat.health > 20 && cat.energy > 15 && !cat.quarantined;
    }

    function shortHuntCandidate() {
        const cats = livingCats();
        if (state.lastShortHuntDay === state.day || cats.some(canPatrol)) return null;
        return cats.filter(cat => cat.age >= 6 && cat.health > 0 && !cat.quarantined)
            .sort((a, b) => b.health - a.health || b.energy - a.energy)[0];
    }

    function runShortHunt() {
        const hunter = shortHuntCandidate();
        if (!hunter) return;

        state.lastShortHuntDay = state.day;
        hunter.energy = Math.max(0, hunter.energy - 5);
        const portions = rand(2, 4);
        const fed = livingCats().filter(cat => cat.hunger > 35)
            .sort((a, b) => a.health - b.health || b.hunger - a.hunger)
            .slice(0, portions);
        for (const cat of fed) {
            cat.hunger = Math.max(0, cat.hunger - rand(45, 55));
        }
        state.prey += portions - fed.length;

        const meals = fed.length
            ? ` ${new Intl.ListFormat("en").format(fed.map(cat => cat.name))} ate first.`
            : " The catch went to the prey pile.";
        const message = `${hunter.name} brought back ${portions} prey from a short hunt near camp.${meals}`;
        logEvent("patrol", message);
        saveGame(false);
        render();
        showNotice(message);
    }

    function resolvePatrol(loc, patrol, healer) {
        CatConditions.recordContact(patrol, "patrol", state.day);

        patrol.forEach(c => {
            c.energy = clamp(c.energy - rand(10, 22), 0, 100);
            c.hunger = clamp(c.hunger + rand(8, 15), 0, 100);
            c.experience += rand(1, 3);
        });

        if (chance(activePredatorRisk())) {
            const result = window.StoryEvents.resolveFootprintsEncounter(patrol, false, activePredatorRisk(), true);
            const outcome = applyEncounterResult(result, patrol);
            logEvent("patrol", outcome);
            return outcome;
        }

        const skillTotal = patrol.reduce(
            (n, c) => n + CatConditions.skill(c, loc.skill, 1), 0
        );

        const success = Math.random() <
            clamp(.45 + skillTotal / (patrol.length * 12) - loc.risk * .08, .18, .9);

        let result;

        if (healer) {
            result = gatherHerbs(healer, loc);
        } else if (loc.id === "moonpool") {
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

            result = `${patrol.map(c => c.name).join(", ")} struggled on ${loc.name}. ${cat.name} ${cat.health === 0
                ? "died from their injuries."
                : `returned scratched and shaken (-${damage} health).`}`;

            logEvent("patrol", result);
            if (cat.health === 0) recordDeath(cat, `${cat.name} died from their patrol injuries.`);
        }

        return result;
    }

    function overallSkill(cat) {
        const skills = Object.keys(cat.skills ?? {});
        return skills.reduce((sum, skill) => sum + CatConditions.skill(cat, skill), 0) /
            Math.max(1, skills.length);
    }

    function deputyCandidates(leader) {
        if (leader?.rank !== "Leader" || !leader.alive) return [];
        const cats = livingCats();
        if (cats.some(cat => cat.rank === "Deputy")) return [];
        return eligibleWarriors(cats);
    }

    function eligibleWarriors(cats) {
        return cats.filter(cat => cat.rank === "Warrior" && cat.age >= 12 && cat.health > 0);
    }

    function preferredWarrior(chooser, warriors) {
        // Give all four factors equal weight on a 0–100 scale.
        const score = warrior => overallSkill(warrior) * 10 + (warrior.respect ?? 50) +
            (warrior.trust ?? 50) + (relationship(chooser, warrior) + 100) / 2;
        return warriors.reduce((best, warrior) =>
            !best || score(warrior) > score(best) ? warrior : best, null);
    }

    function renderDeputyAppointment(leader) {
        const panel = $("deputyAppointment");
        panel.hidden = leader?.rank !== "Leader" || livingCats().some(cat => cat.rank === "Deputy");
        if (panel.hidden) return;

        const candidates = deputyCandidates(leader);
        $("deputyControls").hidden = !candidates.length;
        $("noDeputyCandidates").hidden = Boolean(candidates.length);
        $("deputyCandidate").innerHTML = candidates.map(cat =>
            `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</option>`).join("");
    }

    function appointDeputy(leader, warrior) {
        if (!deputyCandidates(leader).includes(warrior)) return;
        warrior.rank = "Deputy";
        const message = `${leader.name} appointed ${warrior.name} as the clan's new deputy.`;
        logEvent("rank", message);
        return message;
    }

    function medicineRank(cat) {
        return cat?.rank === "Medicine Cat" || (cat?.rank === "Apprentice" && cat.medicineTrack);
    }

    function renderLeaderAppointment(chooser) {
        const panel = $("leaderAppointment");
        const cats = livingCats();
        panel.hidden = !medicineRank(chooser) || cats.some(cat => ["Leader", "Deputy"].includes(cat.rank));
        if (panel.hidden) return;

        const candidates = eligibleWarriors(cats);
        $("leaderControls").hidden = !candidates.length;
        $("noLeaderCandidates").hidden = Boolean(candidates.length);
        $("leaderCandidate").innerHTML = candidates.map(cat =>
            `<option value="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</option>`).join("");
    }

    function installLeader(cat) {
        const formerName = cat.name;
        cat.rank = "Leader";
        if (cat.prefix) cat.name = `${cat.prefix}star`;
        return cat.name === formerName ? "" : ` and took the name ${cat.name}`;
    }

    function appointLeader(chooser, warrior) {
        const cats = livingCats();
        if (!chooser?.alive || !medicineRank(chooser) ||
            cats.some(cat => ["Leader", "Deputy"].includes(cat.rank)) ||
            !eligibleWarriors(cats).includes(warrior)) return;

        const formerName = warrior.name;
        const newName = installLeader(warrior);
        const message = `${chooser.name} chose ${formerName} as the clan's leader. ${formerName} accepted${newName}.`;
        logEvent("rank", message);
        return message;
    }

    function resolveLeadershipVacancy() {
        const cats = livingCats();
        if (cats.some(cat => cat.rank === "Leader")) return;
        const deputy = cats.find(cat => cat.rank === "Deputy");
        if (deputy) {
            const formerName = deputy.name;
            const newName = installLeader(deputy);
            logEvent("rank", `${formerName} succeeded the former leader${newName}.`);
            return deputy;
        }

        if (medicineRank(playerCat())) return;
        const chooser = cats.find(cat => cat.rank === "Medicine Cat") || cats.find(medicineRank);
        if (!chooser) return;
        const warrior = preferredWarrior(chooser, eligibleWarriors(cats));
        if (warrior && appointLeader(chooser, warrior)) return warrior;
    }

    function runNpcLeaderDay() {
        const leader = livingCats().find(cat => cat.rank === "Leader");
        if (!leader || leader.id === state.playerCatId) return [];

        const deputy = preferredWarrior(leader, deputyCandidates(leader));
        if (deputy) appointDeputy(leader, deputy);
        if (leader.quarantined || leader.health <= 20) return [];

        const cats = livingCats();
        const mentors = cats.filter(cat =>
            ["Warrior", "Deputy", "Leader"].includes(cat.rank) &&
            cat.age >= 12 && cat.health > 20 && !cat.quarantined);
        const apprentices = cats.filter(cat => cat.rank === "Apprentice");
        const workload = new Map(mentors.map(mentor => [
            mentor.id, apprentices.filter(apprentice => apprentice.mentorId === mentor.id).length
        ]));
        const mentorScore = mentor => {
            // Prefer a free mentor, then weigh skills against the leader's relationship.
            return overallSkill(mentor) * 4 + relationship(leader, mentor) / 5 - workload.get(mentor.id) * 100;
        };
        for (const apprentice of apprentices) {
            if (apprentice.quarantined || apprentice.medicineTrack || getCat(apprentice.mentorId)) continue;
            const mentor = mentors.reduce((best, candidate) =>
                !best || mentorScore(candidate) > mentorScore(best) ? candidate : best, null);
            if (!mentor) break;
            apprentice.mentorId = mentor.id;
            workload.set(mentor.id, workload.get(mentor.id) + 1);
            logEvent("training", `${leader.name} assigned ${mentor.name} to mentor ${apprentice.name}.`);
        }

        const location = LOCATIONS.find(loc => loc.id === "pinewood");
        const huntingScore = cat => CatConditions.skill(cat, "hunting") * 2 +
            CatConditions.skill(cat, location.skill);
        const patrol = cats.filter(cat => cat.id !== state.playerCatId &&
            ["Leader", "Deputy", "Warrior", "Apprentice"].includes(cat.rank) && canPatrol(cat))
            .sort((a, b) => huntingScore(b) - huntingScore(a) || b.energy - a.energy)
            .slice(0, 3);
        if (patrol.length) {
            logEvent("patrol", `${leader.name} sent ${patrol.map(cat => cat.name).join(", ")} to hunt at ${location.name}.`);
            resolvePatrol(location, patrol);
        }
        return patrol;
    }
    function trainPlayer() {
        const c = playerCat();
        if (!c) return;
        if (c.quarantined) {
            showNotice("Rest in the medicine den until your quarantine ends.");
            return;
        }

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
        if (c.quarantined) {
            showNotice("Rest in the medicine den until your quarantine ends.");
            return;
        }

        const others = livingCats().filter(x => x.id !== c.id && !x.quarantined);
        if (!others.length) return;

        const other = pick(others);
        StoryEvents.showClanmateConversation(c, other, choice => {
            CatConditions.recordContact([c, other], "conversation", state.day);
            let text = choice.outcome;
            if (choice.spendTime) {
                const bond = relationship(c, other);
                const gain = window.Relationships.routineBondGain(bond, rand(3, 6));
                setRelationship(c, other, bond + gain);
                c.energy = clamp(c.energy - 4, 0, 100);
                text += ` Their bond is now ${relationshipLabel(relationship(c, other))}.`;
                const newCrushes = [tryDevelopCrush(c, other), tryDevelopCrush(other, c)].filter(Boolean);
                if (newCrushes.length) text += ` ${newCrushes.join(" ")}`;
            }

            c.notes.push(text);
            logEvent("relationship", text);
            saveGame(false);
            render();
            showNotice(text);
        });
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
            !c.quarantined &&
            c.energy >= 15
        );

        // No apprentices ready to train, or no event today.
        if (!apprentices.length || !chance(0.28)) return;

        // Choose one apprentice for today's training session.
        const apprentice = pick(apprentices);
        const assigned = getCat(apprentice.mentorId);

        const eligibleMentors = livingCats().filter(c =>
            c.id !== apprentice.id &&
            c.age >= 12 &&
            !c.quarantined &&
            (apprentice.medicineTrack ? c === assigned && c.rank === "Medicine Cat" :
                ["Warrior", "Elder", "Deputy", "Leader"].includes(c.rank))
        );

        if (!eligibleMentors.length) return;

        // Prefer the assigned mentor, if they are still eligible.
        const mentor = eligibleMentors.find(
            c => c.id === apprentice.mentorId
        ) || pick(eligibleMentors);

        // These skills can be taught in the clan's territory.
        const trainingSkills = apprentice.medicineTrack ? ["healing"] : [
            "hunting",
            "climbing",
            "fighting"
        ];

        // Swimming lessons are available when the territory has a river.
        if (!apprentice.medicineTrack && LOCATIONS.some(loc => loc.id === "river")) {
            trainingSkills.push("swimming");
        }

        const eligibleSkills = trainingSkills.filter(skill =>
            (apprentice.skills[skill] || 0) < 10 &&
            CatConditions.skill(mentor, skill) > (apprentice.skills[skill] || 0)
        );

        if (!eligibleSkills.length) return;

        const skill = pick(eligibleSkills);

        // A more experienced mentor is better at teaching this skill.
        const mentorSkill = CatConditions.skill(mentor, skill);
        const apprenticeSkill = apprentice.skills[skill] || 0;
        CatConditions.recordContact([mentor, apprentice], "conversation", state.day);

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
        } else if (mentorSkill < apprenticeSkill) {
            text =
                `${mentor.name} worked with ${apprentice.name} on ${skill}, ` +
                `but it is clear that ${apprentice.name} has already surpassed their teacher on this task.`
        } else if (chance(learningChance)) {
            // Usually gain one point. A highly skilled mentor can
            // occasionally help the apprentice gain two.
            const gain =
                mentorSkill >= 8 && chance(0.25) ? 2 : 1;

            const oldSkill = apprenticeSkill;
            const newSkill = clamp(oldSkill + gain, 0, Math.min(10, mentorSkill));
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



    function promoteKit(cat) {
        if (cat.rank !== "Kit" || cat.age < 6) return false;
        updateCatName(cat);
        cat.rank = "Apprentice";
        const healer = livingCats().find(member => member.rank === "Medicine Cat" &&
            member.reservedMedicineKitId === cat.id);
        if (healer) {
            delete healer.reservedMedicineKitId;
        }
        if (healer && hasMedicineApprenticeSlot()) {
            assignMedicineApprentice(healer, cat);
        } else {
            logEvent("rank", `${cat.name} is old enough to begin apprentice training.`);
        }
        return true;
    }

    function advanceMoon() {
        livingCats().forEach(c => {
            // Dead cats don't age.
            if (!c.alive) return;

            // Age the cat by one moon.
            c.age += 1;

            if (!promoteKit(c)) updateCatName(c);

            if (c.age >= 12 && c.rank === "Apprentice") {
                graduateApprentice(c);
            }
        });

        // Check after every cat has aged so results do not depend on roster order.
        updateCrushEligibility();

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

    function learnAboutOutsideTie(mate, partner, lead) {
        if (!mate.relationships.mates.includes(partner.id) ||
            !partner.relationships.mates.includes(mate.id) ||
            partner.relationships.mates.includes(lead.id)) return false;

        const concern = mateConcern(mate, partner);
        const key = `${lead.type}:${lead.id}`;
        if (concern.heard[key] === lead.day) return false;
        if (concern.pending && (concern.pending.type === "relationship" || lead.type === "crush")) return false;

        concern.heard[key] = lead.day;
        concern.suspicion = clamp(concern.suspicion + (lead.type === "relationship" ? 3 : 2), 0, 5);
        concern.pending = { type: lead.type, targetId: lead.id };
        return true;
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

        if (!chance(clamp(gossipChance, 0.05, 0.95))) {
            return "";
        }

        const subject = pick(thirdCats);

        const listeningMates = [cat, other].filter(listener =>
            subject.relationships.mates.includes(listener.id) &&
            listener.relationships.mates.includes(subject.id)
        );
        for (const mate of listeningMates) {
            const concern = mateConcern(mate, subject);
            const secretPartners = subject.relationships.secretPartners || {};
            const leads = [
                ...Object.entries(secretPartners).map(([id, day]) => ({ id, day, type: "relationship" })),
                ...subject.relationships.crushes.filter(id => !(id in secretPartners)).map(id => ({
                    id, day: subject.relationships.crushStartDays?.[id] ?? 0, type: "crush"
                }))
            ].filter(lead => {
                return getCat(lead.id) && !subject.relationships.mates.includes(lead.id) &&
                    concern.heard[`${lead.type}:${lead.id}`] !== lead.day;
            });

            const lead = leads[0];
            if (lead && chance(0.60) && learnAboutOutsideTie(mate, subject, lead)) {
                const target = getCat(lead.id);
                const news = lead.type === "relationship"
                    ? `has been seeing ${target.name} in secret`
                    : `may have feelings for ${target.name}`;
                return `${mate.name} hears that ${subject.name} ${news}.`;
            }
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
                            const secretDay = subject.relationships.secretPartners?.[crush.id];
                            learnAboutOutsideTie(listener, subject, {
                                id: crush.id,
                                day: secretDay ?? subject.relationships.crushStartDays?.[crush.id] ?? 0,
                                type: secretDay === undefined ? "crush" : "relationship"
                            });
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

    function startGiftStory() {
        if (state.day < (state.nextGiftStoryDay ?? 5) || !chance(.2)) return;
        const adults = livingCats().filter(cat => cat.age >= 12);
        const candidates = [];
        for (const giver of adults) {
            if (giver.id === state.playerCatId || giver.hiddenQuirk) continue;
            for (const friend of adults) {
                if (friend === giver || relationship(giver, friend) < 35) continue;
                const others = adults.filter(cat =>
                    cat !== giver && cat !== friend && relationship(friend, cat) >= 12
                );
                if (others.length) candidates.push({ giver, friend, others });
            }
        }
        if (!candidates.length) return;
        const { giver, friend, others } = pick(candidates);
        const rival = pick(others);
        giver.hiddenQuirk = "secret_gift_giver";
        giver.hiddenMotive = "possessive_friend";
        state.giftStory = {
            giverId: giver.id, friendId: friend.id, rivalId: rival.id,
            stage: "rumor", nextDay: state.day + 3
        };
        const description = `${friend.name} found a blue feather tucked into their nest. There was no sign of who left it.`;
        rememberEvent(friend, "anonymous_gift", { description, importance: 3 });
        logEvent("story", description);
    }

    function finishGiftStory() {
        state.giftStory = null;
        state.nextGiftStoryDay = state.day + 15;
    }

    function advanceGiftStory() {
        const story = state.giftStory;
        if (!story) {
            startGiftStory();
            return Boolean(state.giftStory);
        }
        if (story.nextDay > state.day) return false;

        const giver = getCat(story.giverId);
        const friend = getCat(story.friendId);
        const rival = getCat(story.rivalId);
        if (!giver || !friend || !rival) {
            finishGiftStory();
            return false;
        }

        if (story.stage === "rumor") {
            const description = `${friend.name} heard that ${rival.name} had been mocking them after patrol. They started keeping their distance.`;
            setRelationship(friend, rival, relationship(friend, rival) - 12);
            recordCatEvent("hurtful_rumor", [friend, rival], {
                description, importance: 3, logToChronicle: true
            });
            story.stage = "reveal";
            story.nextDay = state.day + 3;
            return true;
        }

        const viewpoint = getCat(state.playerCatId);
        const witness = viewpoint && viewpoint !== giver ? viewpoint : rival;
        const disclosure = `${witness.name} heard ${giver.name} admit to leaving the blue feather and making up the story about ${rival.name}. ${giver.name} wanted ${friend.name} all to themself.`;
        const choices = [
            { id: "confront", text: "Confront the gift-giver in front of the clan" },
            { id: "warn", text: `Tell ${friend.name} in private` },
            { id: "keep", text: "Keep the discovery to yourself" }
        ];
        if (witness === friend) choices[1].text = `Reassure ${rival.name} in private`;

        function resolve(choice) {
            if (state.giftStory !== story) return;
            rememberEvent(witness, "uncovered_gift_giver", {
                description: disclosure, importance: 4, participants: [giver.id],
                privateOwnerId: witness.id
            });

            const exposed = choice.id === "confront";
            let outcome = `${witness.name} kept what they heard to themself.`;
            if (choice.id !== "keep" || witness === friend) {
                const description = `${friend.name} learned that ${giver.name} spread a false rumor to come between them and ${rival.name}.`;
                rememberEvent(friend, "betrayed_by_friend", {
                    description, importance: 5, participants: [giver.id, rival.id],
                    rumorStarterId: giver.id,
                    privateOwnerId: exposed ? null : friend.id
                });
                if (!exposed || friend !== witness) {
                    setRelationship(friend, giver, relationship(friend, giver) - (exposed ? 24 : 16));
                }
                setRelationship(friend, rival, relationship(friend, rival) + 12);
                if (exposed) {
                    giver.giftStoryExposed = true;
                    giver.respect = clamp((giver.respect ?? 50) - 10, 0, 100);
                }
                if (choice.id !== "keep") {
                    outcome = exposed ? `${witness.name} called out ${giver.name} for lying in front of the clan. ${giver.name} lost standing.` :
                        witness === friend ? `${friend.name} reassured ${rival.name} in private.` :
                            `${witness.name} told ${friend.name} the truth in private.`;
                }
            }
            if (exposed) {
                setRelationship(witness, giver, relationship(witness, giver) - 45);
                setRelationship(giver, witness, relationship(giver, witness) - 45);
                recordCatEvent("public_callout", [witness, giver], {
                    description: outcome,
                    importance: 5
                });
            } else if (choice.id === "warn") {
                const recipient = witness === friend ? rival : friend;
                witness.trust = clamp((witness.trust ?? 50) + 5, 0, 100);
                setRelationship(recipient, witness, relationship(recipient, witness) + 5);
            }
            logEvent("story", outcome);
            finishGiftStory();
            saveGame(false);
            render();
            showNotice(outcome);
        }

        if (witness === viewpoint) {
            StoryEvents.showStoryEvent({
                title: "The blue feather",
                description: disclosure,
                decisionMaker: "witness",
                choices
            }, { witness }, resolve);
        } else {
            resolve(choices[1]);
        }
        return true;
    }

    function autonomousDay() {
        if (showVigil()) return;
        if (state.medicineDream && showMedicineDream()) return;
        // Advance daily clock
        state.day++;
        const disasterOutcome = resolveDisaster();
        const medicineDuty = runMedicineCatDay();
        CatConditions.advanceDay(livingCats(), state.day, logEvent, (cat, description) => {
            rememberEvent(cat, "healed_with_a_limp", { importance: 4, description });
        }, recordDeath);
        const footprintsOutcomes = resolvePendingFootprints();
        const cats = livingCats();
        updateCrushEligibility();
        activePredatorRisk();
        state.dayOfMoon++;

        // Update emotional intensity of memories
        updateMemoryFeelings();

        // Gradually fade jealousy and admiration toward neutral.
        cats.forEach(cat => {
            window.SocialReactions.fadeJealousyAdmiration(cat);
        });

        if (state.dayOfMoon >= DAYS_PER_MOON) {
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

            const recovery = rand(8, 22);
            c.energy = clamp(c.energy + (griefAffectsRecovery(c) ? Math.floor(recovery / 2) : recovery), 0, 100);
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
            promoteKit(c);

            if (c.age >= 12 && c.rank === "Apprentice") {
                graduateApprentice(c);
            }

            if (c.age >= 96 && c.rank === "Warrior" && chance(.08)) {
                c.rank = "Elder";
                logEvent("rank", `${c.name} retired from regular patrols and joined the elders.`);
            }

            if (c.health <= 0) {
                recordDeath(c, `${c.name} died after their health failed.`);
            }
        });

        resolveLeadershipVacancy();
        const huntingPatrol = new Set(runNpcLeaderDay());
        for (const cat of livingCats()) {
            if (cat.id !== state.playerCatId && !huntingPatrol.has(cat) &&
                (!medicineDuty.has(cat.id) || cat.quarantined)) {
                window.NPC.performNpcActivity(cat);
                if (cat.health <= 0) {
                    recordDeath(cat, `${cat.name} died after their health failed.`);
                }
            }
        }

        resolveLeadershipVacancy();
        // Give an apprentice a chance to train each day
        apprenticeTrainingEvent();
        updateFamilies();
        const giftStoryActive = advanceGiftStory();
        const dreamActive = !giftStoryActive && rollMedicineDream();

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

        const admirerEvent = window.StoryEvents?.events.find(event => event.id === "known_admirer");
        const admirerParticipants = admirerEvent
            ? StoryEvents.selectParticipants(admirerEvent, livingCats().filter(cat => !cat.quarantined), state.playerCatId)
            : null;
        const mateConflict = window.StoryEvents?.canTriggerEvent()
            ? StoryEvents.findMateConflict(livingCats().filter(cat => !cat.quarantined))
            : null;
        const priorityStory = mateConflict || (admirerParticipants
            ? { event: admirerEvent, participants: admirerParticipants }
            : null);

        // Mate conflicts and known admirers take priority over random stories.
        if (
            !giftStoryActive && !dreamActive && window.StoryEvents &&
            StoryEvents.canTriggerEvent() &&
            (priorityStory || StoryEvents.shouldTriggerEvent())
        ) {
            // Only select events whose global cooldown has expired.
            const availableEvents = StoryEvents.events.filter(
                event => !StoryEvents.isEventOnCooldown(event)
            );

            const storyEvent = priorityStory?.event || StoryEvents.getRandomEvent(
                availableEvents.filter(event => event.id !== "known_admirer")
            );

            if (storyEvent) {
                const participants = priorityStory?.participants || StoryEvents.selectParticipants(
                    storyEvent,
                    livingCats().filter(cat => !cat.quarantined),
                    state.playerCatId
                );

                if (participants) {
                    CatConditions.recordContact(Object.values(participants).filter(Boolean), "conversation", state.day);
                    // Record the event and start its global cooldown.
                    StoryEvents.recordEvent(storyEvent);

                    const playerInvolved = StoryEvents.involvesPlayer(
                        participants,
                        state.playerCatId
                    );

                    logEvent(
                        "story",
                        `${storyEvent.title}: ${storyEvent.description}`
                    );

                    // Player participates in the event.
                    if (playerInvolved) {

                        StoryEvents.showStoryEvent(
                            storyEvent,
                            participants,
                            (choice, eventParticipants) => {
                                console.log("1. Player event callback reached:", choice);
                                console.log("2. Participants:", eventParticipants);

                                let resolvedOutcome;
                                try {
                                    resolvedOutcome = applyStoryChoice(choice, eventParticipants);
                                    console.log("3. applyStoryChoice completed");
                                } catch (error) {
                                    console.error("ERROR in applyStoryChoice:", error);
                                    return;
                                }

                                const rawOutcome =
                                    resolvedOutcome || choice.outcome ||
                                    choice.text ||
                                    "The event came to an end.";

                                const outcome = StoryEvents.formatText(
                                    rawOutcome,
                                    eventParticipants
                                );

                                console.log("4. Outcome:", outcome);

                                logEvent(
                                    "story",
                                    `${storyEvent.title} — ${outcome}`
                                );

                                console.log("5. Chronicle log after logging:", state.log[0]);

                                saveGame(false);
                                render();
                                showNotice(outcome);
                            }
                        );

                        // NPCs participate in a branching dialogue event.
                    } else if (storyEvent.dialogue) {
                        StoryEvents.runNpcDialogue(
                            storyEvent,
                            participants,
                            (result) => {
                                const resolvedOutcome = applyStoryChoice(result, participants);

                                const outcome =
                                    resolvedOutcome || result.outcome ||
                                    result.text ||
                                    "The event came to an end.";

                                logEvent(
                                    "story",
                                    `${storyEvent.title} — ${outcome}`
                                );
                            }
                        );

                        // NPCs participate in a regular event.
                    } else {
                        const selectedChoice = pick(storyEvent.choices);
                        const { choice, participants: choiceParticipants } =
                            StoryEvents.resolveChoiceParticipants(storyEvent, selectedChoice, participants);

                        StoryEvents.recordEventParticipants(storyEvent, choiceParticipants);

                        const resolvedOutcome = applyStoryChoice(choice, choiceParticipants);

                        const outcome = StoryEvents.formatText(
                            resolvedOutcome || choice.outcome || choice.text,
                            choiceParticipants
                        );

                        logEvent(
                            "story",
                            `${storyEvent.title} — ${outcome}`
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

        showNotice([disasterOutcome, ...footprintsOutcomes].filter(Boolean).join(" ") ||
            `Day advanced. ${seasonName()} · Day ${state.day}. Your cats lived through another day.`);
    }

    function assignMentor(apprenticeId) {
        const apprentice = getCat(apprenticeId);

        if (!apprentice || apprentice.rank !== "Apprentice") {
            showNotice("Only apprentices can be assigned a mentor.");
            return;
        }
        if (apprentice.medicineTrack) {
            showNotice("This apprentice is training as a medicine cat.");
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

    function graduateApprentice(cat) {
        cat.rank = cat.medicineTrack ? "Medicine Cat" : "Warrior";
        logEvent("rank", `${cat.name} completed their training and became a ${cat.rank.toLowerCase()}.`);
    }


    function changeRank(id) {
        const c = getCat(id);
        if (!c) return;

        const options = RANKS.filter(r =>
            (r !== "Deputy" || c.rank === "Deputy") &&
            !(c.age < 6 && r !== "Kit") &&
            !(c.age >= 6 && c.age < 12 && !["Apprentice", "Kit"].includes(r))
        );
        if (canChooseMedicineApprentice(playerCat()) && medicineApprenticeCandidates(true).includes(c)) {
            options.push(MEDICINE_APPRENTICE_RANK);
        }

        const next = prompt(
            `Change ${c.name}'s rank. Available ranks: ${options.join(", ")}\nEnter a rank exactly:`,
            rankLabel(c)
        );

        if (!next) return;

        const normalized = options.find(
            r => r.toLowerCase() === next.trim().toLowerCase()
        );

        if (!normalized) {
            showNotice("That rank isn't available for this cat.");
            return;
        }

        if (normalized === MEDICINE_APPRENTICE_RANK) {
            handleMedicineAction("apprentice", c.id);
            return;
        }
        if (c.rank === "Medicine Cat" && normalized !== c.rank) delete c.reservedMedicineKitId;
        if (c.medicineTrack && (c.rank === "Apprentice" || normalized === "Apprentice")) {
            delete c.medicineTrack;
            delete c.mentorId;
        }
        c.rank = normalized;
        logEvent("rank", `${c.name} is now recognized as ${normalized.toLowerCase()}.`);
        resolveLeadershipVacancy();
        saveGame(false);
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

    function applyMedicineApprenticeLimit(cats) {
        const apprentices = cats.filter(cat => cat.rank === "Apprentice" && cat.medicineTrack)
            .sort((a, b) => b.age - a.age);
        for (const cat of apprentices.slice(MEDICINE_APPRENTICE_LIMIT)) {
            delete cat.medicineTrack;
            delete cat.mentorId;
            logEvent("training", `${cat.name} returned to warrior training because the medicine cat apprentice slots were filled.`);
        }

        let openSlots = Math.max(0, MEDICINE_APPRENTICE_LIMIT - apprentices.length);
        const reservedIds = new Set();
        for (const healer of cats.filter(cat => cat.rank === "Medicine Cat" && cat.reservedMedicineKitId)) {
            const kit = reservedMedicineKit(healer);
            if (!kit || medicineApprentice(healer) || reservedIds.has(kit.id) || openSlots === 0) {
                delete healer.reservedMedicineKitId;
            } else {
                reservedIds.add(kit.id);
                openSlots--;
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
            loaded.predatorRisk ??= null;
            loaded.pendingFootprints ??= [];
            loaded.pendingVigils ??= [];
            loaded.herbs ??= 3;
            loaded.medicineDream ??= null;
            loaded.disaster ??= null;
            loaded.nextDreamDay ??= loaded.day + 1;

            const legacyDeaths = loaded.cats.filter(cat => cat.alive === false).reverse();
            const archivedCats = [...(loaded.starClan ?? []), ...legacyDeaths];
            loaded.starClan = archivedCats.slice(0, STARCLAN_LIMIT);
            loaded.cats = loaded.cats.filter(cat => cat.alive !== false);
            const historyCats = [...loaded.cats, ...loaded.starClan];

            // Fill in defaults for stats added in newer versions.
            historyCats.forEach(cat => {
                cat.fertility ??= rand(60, 90);
                cat.lastBreedingAttemptDay ??= null;
                if (cat.lastLitterDay == null) {
                    const birthDays = historyCats
                        .filter(child => child.parents?.includes(cat.id) && Number.isFinite(child.bornDay))
                        .map(child => child.bornDay);
                    cat.lastLitterDay = birthDays.length ? Math.max(...birthDays) : null;
                }
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
            const cats = livingCats();
            applyMedicineApprenticeLimit(cats);
            const livingIds = new Set(cats.map(cat => cat.id));
            const deathsById = new Map(archivedCats.map(cat => [cat.id, cat]));
            for (const cat of cats) {
                // Extend active cooldowns saved when the same durations were measured in days.
                if (romanceWait(cat) && !cat.relationships.mates.length) {
                    for (const memory of cat.memories) {
                        const death = memory.event === "clan_loss" &&
                            memory.description?.endsWith("kept vigil beside their mate.");
                        if (!death && memory.event !== "mates_separated") continue;
                        const reason = death ? "death" : "breakup";
                        if (memory.day + romanceCooldownMoons(cat, reason) === cat.romanceReadyDay) {
                            startRomanceCooldown(cat, reason, memory.day);
                            break;
                        }
                    }
                }
                for (const mateId of cat.relationships.mates) {
                    if (livingIds.has(mateId)) continue;
                    const death = deathsById.get(mateId);
                    const deathDay = death?.deathDay ?? (death && loaded.log?.find(event =>
                        event.type === "loss" && event.text.startsWith(`${death.name} died`))?.day);
                    if (Number.isFinite(deathDay)) endMateTie(cat, mateId, "death", deathDay);
                    else cat.relationships.mates = cat.relationships.mates.filter(id => id !== mateId);
                }
                if (!cat.relationships.mates.length && cat.romanceReadyDay == null) {
                    const separation = cat.memories.findLast(memory => memory.event === "mates_separated");
                    if (Number.isFinite(separation?.day)) startRomanceCooldown(cat, "breakup", separation.day);
                }
            }
            updateCrushEligibility();
            cats.forEach((cat, index) => {
                cat.relationships.rivals = [];
                for (const other of cats.slice(0, index)) updateRivalry(cat, other);
            });
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
        if (view === "starclan") renderStarClan();
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
        $("vigilBtn").addEventListener("click", showVigil);
        $("appointDeputyBtn").addEventListener("click", () => {
            const message = appointDeputy(playerCat(), getCat($("deputyCandidate").value));
            if (!message) return;
            saveGame(false);
            render();
            showNotice(message);
        });
        $("appointLeaderBtn").addEventListener("click", () => {
            const message = appointLeader(playerCat(), getCat($("leaderCandidate").value));
            if (!message) return;
            saveGame(false);
            render();
            showNotice(message);
        });
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
            if (e.target.closest("#shortHuntBtn")) {
                runShortHunt();
                return;
            }
            const medicineAction = e.target.closest("[data-medicine-action]");
            if (medicineAction) {
                handleMedicineAction(medicineAction.dataset.medicineAction, medicineAction.dataset.patient);
                return;
            }
            const profileButton = e.target.closest(
                "[data-profile-tab], [data-profile-filter], [data-profile-shared], [data-profile-show-all]"
            );
            if (profileButton) {
                const { profileTab, profileFilter, profileShared } = profileButton.dataset;
                if (profileTab) {
                    profileView.tab = profileTab;
                    if (profileTab === "memories") profileView.shared = "";
                } else if (profileFilter) {
                    profileView.filter = profileFilter;
                } else if (profileShared !== undefined) {
                    profileView.tab = "memories";
                    profileView.shared = profileShared;
                } else {
                    profileView.showAll = !profileView.showAll;
                }
                renderRoster();
                const focusTarget = profileTab ? `[data-profile-tab="${profileTab}"]` :
                    profileFilter ? `[data-profile-filter="${profileFilter}"]` :
                    profileShared !== undefined ? "#profilePanel" : "[data-profile-show-all]";
                $("catDetails").querySelector(focusTarget)?.focus();
                return;
            }

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

    // Load JSON data before creating any cats
    await loadNameData();

    initializeRelationships();

    const hasSavedGame = loadGame();

    if (!hasSavedGame) {
        initialState();
        $("creatorOverlay").classList.add("open");
    } else if (resolveLeadershipVacancy()) {
        saveGame(false);
    }

    initializeNpcAI();
    initializeStoryEvents();
    initializeSocialReactions();
    initializeGossip();
    CatRenderer.initialize(COLORS);
    selectedCatId = state.playerCatId || livingCats()[0]?.id || null;

    bindEvents();
    render();
    if (state.medicineDream) showMedicineDream();
    if (state.giftStory?.stage === "reveal" && state.giftStory.nextDay <= state.day) {
        advanceGiftStory();
    }
})();
