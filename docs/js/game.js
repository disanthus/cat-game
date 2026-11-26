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
            refreshMutualCrush,
            updateBestFriendship,
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
            clamp
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
            areCloseRelatives,
            relationship,
            mateConcern,
            getCat,
            chance,
            clamp,
            rand,
            logEvent,
            rememberEvent,
            recordCatEvent,
            tryDevelopCrush,
            resolveRescueDeaths,
            runPatrol,
            renderPortrait: renderCatPortrait,
            eventSlot: $("questCard"),
            setEventActive(active) {
                if (active) switchView("territory");

                document.querySelectorAll(".top-status, .tabs, #territoryGrid, #campRestBtn, .patrol-panel, .footer-actions")
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
            shareCrushOnSameCat
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

            if (effect.type === "weather_choice") {
                return resolveWeatherChoice(effect, participants);
            }
            if (effect.type === "wildfire_warning") {
                return resolveWildfireWarning(effect, participants.actor);
            }

            if (effect.type === "clan_fight") {
                return resolveClanFight(participants.instigator, participants.other, effect);
            }
            if (effect.type === "broken_ground_rescue") {
                return StoryEvents.resolveBrokenGround(effect, participants);
            }
            if (effect.type === "broken_ground_thanks") {
                return StoryEvents.resolveRescueThanks(effect, participants);
            }
            if (effect.type === "hidden_quirk") {
                return ClanQuirks.resolve(effect, participants);
            }

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
            if (effect.type === "argument_grievance") {
                Relationships.recordGrievance(participants[effect.from], participants[effect.to],
                    "public_insult", effect.incidentId, state.day);
            }
            if (effect.type === "argument_truce") {
                const { peacemaker, clanmate } = participants;
                Relationships.resolveGrievance(peacemaker, clanmate, effect.incidentId);
                Relationships.resolveGrievance(clanmate, peacemaker, effect.incidentId);
            }

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
                if (admirer && target) refreshCrush(admirer, target);
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
                Relationships.adjustTrust(challenger, partner, effect.trust);
                concern.suspicion = effect.suspicion;
                setRelationship(challenger, partner, relationship(challenger, partner) + effect.bond);

                if (effect.separate) {
                    endMateTie(challenger, partner.id, "breakup");
                    endMateTie(partner, challenger.id, "breakup");
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


    function resolveClanFight(instigator, other, { publicOpening, privateReason }) {
        if (!instigator?.alive || !other?.alive || instigator === other) return;
        const fighters = [instigator, other];
        const leader = livingCats().find(cat => cat.rank === "Leader" && !cat.quarantined && !fighters.includes(cat));
        const leaderStepsIn = chance(.5) && leader;
        const someoneIsInjured = chance(.30);
        const fatal = chance(.01);
        const deceased = fatal ? pick(fighters) : null;
        const lines = publicOpening ? [publicOpening] : [];

        CatConditions.recordContact(fighters, "close", state.day);
        if (leaderStepsIn) {
            for (const cat of fighters) cat.respect = clamp((cat.respect ?? 50) - 8, 0, 100);
            lines.push(`${leader.name} pulled ${instigator.name} and ${other.name} apart and reprimanded them both. Both lost respect in the clan.`);
        } else {
            lines.push(`${instigator.name} and ${other.name} broke apart on their own.`);
        }
        if (someoneIsInjured) {
            const injured = pick(fighters.filter(cat => cat !== deceased));
            injured.health = Math.max(1, injured.health - 8);
            CatConditions.add(injured, "scrape", state.day, logEvent);
            lines.push(`${injured.name} came away with a scrape.`);
        }
        if (deceased) lines.push(`${deceased.name} died from an accidental injury during the fight.`);
        const outcome = lines.join(" ");
        recordCatEvent("clan_fight", fighters, {
            description: outcome, importance: deceased ? 5 : 3, fightOpeningRecorded: !!publicOpening, privateFightReason: privateReason
        });
        if (deceased) {
            recordDeath(deceased, lines.at(-1));
            resolveLeadershipVacancy();
            if (state.playerCatId === deceased.id) state.playerCatId = livingCats()[0]?.id ?? null;
            if (selectedCatId === deceased.id) selectedCatId = state.playerCatId;
        }
        return outcome;
    }

    const SEASONS = ["Newleaf", "Greenleaf", "Leaf-fall", "Leaf-bare"];
    const RANKS = ["Leader", "Deputy", "Medicine Cat", "Warrior", "Apprentice", "Kit", "Elder"];
    const MEDICINE_APPRENTICE_RANK = "Medicine Cat Apprentice";
    const MEDICINE_APPRENTICE_LIMIT = 2;

    function rankLabel(cat) {
        return cat.rank === "Apprentice" && cat.medicineTrack ? MEDICINE_APPRENTICE_RANK : cat.rank;
    }

    const LOCATIONS = [
        { id: "pinewood", name: "Pinewood Trail", emoji: "↟𖠰˚☀︎↟𖠰", desc: "A familiar path with plenty of cover and small prey.", difficulty: "Easy", risk: 1, prey: [2, 5] },
        { id: "river", name: "Glassriver Bend", emoji: "°‧ 𓆝 𓆟 𓆞 ·｡", desc: "A quick river runs between smooth stones. Fish are plentiful, but the current is tricky.", difficulty: "Moderate", risk: 2, prey: [3, 6] },
        { id: "ridge", name: "Windcut Ridge", emoji: "ᨒ↟𖠰", desc: "An exposed ridge where sharp eyes and steady paws matter.", difficulty: "Hard", risk: 3, prey: [1, 4] },
        { id: "ruins", name: "Old Twoleg Ruins", emoji: "🏘", desc: "Strange scents, hidden spaces, and the occasional useful discovery.", difficulty: "Moderate", risk: 2, prey: [0, 2] },
        { id: "moonpool", name: "Moonpool Hollow", emoji: "꒷꒦︶꒷꒦︶ ๋ ࣭ ⭑꒷꒦", desc: "A quiet hollow where the clan leaves offerings and listens to old stories.", difficulty: "Story", risk: 1, prey: [0, 0] },
        { id: "bramble", name: "Bramble Maze", emoji: "⸙. ݁₊ ⸙͎. ݁˖ 𓃦. ݁𓍊. ݁ ݁𓃴", desc: "Dense thorn tunnels make this a good test of patience and agility.", difficulty: "Hard", risk: 3, prey: [1, 4] }
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
            weather: null,
            predatorRisk: null,
            pendingFootprints: [],
            pendingVigils: [],
            herbInventory: ClanHerbs.normalize(3),
            medicineDream: null,
            disaster: null,
            nextDreamDay: 3,
            prey: 12,
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
        $("foodForecast").textContent = mealForecastText();

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
            `${state.clanName} currently has ${cats.length} living cats.`;

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
        const quirk = ClanQuirks.profile(c, viewpoint);
        return `
    <p>${escapeHtml(catBio(c))}</p>

    ${quirk ? `<section class="profile-section">
      <h4>Discovered quirk</h4>
      <p><strong>${escapeHtml(quirk.title)}</strong>${quirk.description ? ` · ${escapeHtml(quirk.description)}` : ""}</p>
      ${quirk.motive ? `<p><strong>Hidden motive</strong> · ${escapeHtml(quirk.motive)}</p>` : ""}
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
        const knowsRumor = cat?.relationships.knownGossip?.some(rumor =>
            rumor.type === "crush" && rumor.subjectId === admirerId && rumor.targetId === cat.id
        );
        return knowsRumor || cat?.memories?.some(memory =>
            ["admirer_conversation", "mutual_confession", "rejected_confession"].includes(memory.event) &&
            memory.participants?.includes(admirerId)
        );
    }

    function visibleCrush(from, to) {
        return from.relationships.crushes?.includes(to.id) &&
            (to.id !== state.playerCatId || knowsAdmirer(to, from.id));
    }

    function describeRelationship(cat, other, bond, feeling, { mate, bestFriend, rivalries, grievance, crush, knownAdmirer }) {
        const past = !cat.alive || !other.alive;
        const bondDescriptions = {
            "close bond": past ? "felt close to" : "feels close to",
            friendly: past ? "got along with" : "gets along with",
            neutral: past ? "had a neutral bond with" : "has a neutral bond with",
            strained: past ? "had a strained relationship with" : "has a strained relationship with",
            "very strained": past ? "had a very strained relationship with" : "has a very strained relationship with"
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
        }

        if (rivalries.some(rivalry => rivalry.kind === "mentor_praise")) {
            description += ` ${cat.name} ${past ? "competed" : "competes"} with ${name} for their mentor's praise.`;
        }
        if (rivalries.some(rivalry => rivalry.kind === "shared_crush")) {
            description += ` ${cat.name} ${past ? "saw" : "sees"} ${name} as a romantic rival over a shared crush.`;
        }
        if (grievance) {
            const reasons = {
                hurtful_rumor: "because they believed the cat had mocked them",
                false_rumor: "for spreading a false rumor",
                unfair_accusation: "for accusing them of spoiling a hunt",
                fresh_kill_dispute: "for calling them out over how fresh-kill was shared",
                unfair_medicine_den_accusation: "for making an unsupported accusation about a death in the medicine den",
                betrayal_of_care: "for betraying the trust placed in them as a healer",
                public_insult: "for insulting them in front of their clanmates"
            };
            description += ` ${cat.name} ${past ? "distrusted" : "distrusts"} ${name} ${reasons[grievance.cause]}.`;
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
        return description;
    }

    function profileRelationshipsHtml(cat) {
        const filters = ["All", "Family", "Friends", "Romance", "Rivals", "Enemies"];
        const cards = [];

        for (const other of clanHistoryCats()) {
            if (other.id === cat.id) continue;
            const { mates, bestFriends } = cat.relationships;
            const bond = relationship(cat, other);
            const trust = cat.id === state.playerCatId ? Relationships.trustToward(cat, other) : null;
            const feeling = jealousyAdmirationLabel(jealousyAdmiration(cat, other));
            const formerMate = !other.alive && other.relationships.mates?.includes(cat.id);
            const mate = mates?.includes(other.id) || formerMate;
            const bestFriend = bestFriends?.includes(other.id);
            const rivalries = Relationships.rivalriesWith(cat, other).filter(rivalry =>
                rivalry.kind !== "shared_crush" || rivalry.goalId !== state.playerCatId ||
                (knowsAdmirer(getCat(state.playerCatId), cat.id) && knowsAdmirer(getCat(state.playerCatId), other.id)));
            const grievance = Relationships.enmityWith(cat, other)?.grievances.findLast(entry =>
                !entry.privateOwnerId || entry.privateOwnerId === state.playerCatId);
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
            if (rivalries.some(rivalry => rivalry.kind === "mentor_praise")) addTie("rivals", "Rival");
            if (rivalries.some(rivalry => rivalry.kind === "shared_crush")) addTie("rivals", "Romantic Rival");
            if (grievance) addTie("enemies", "Enemy");
            if (cat.mentorId === other.id) ties.push("Mentor");
            if (other.mentorId === cat.id) ties.push("Apprentice");
            const denSuspicion = state.playerCatId === cat.id ? DeathberryIncidents.suspicion(cat, other) : 0;
            if (denSuspicion) ties.push(`Medicine den suspicion ${denSuspicion}/5`);
            const priority = ties.length ? 1 : 0;

            if (crush) addTie("romance", "Crush");
            if (knownAdmirer) addTie("romance", "Known admirer");
            if (bond >= 25) categories.add("friends");

            if (!other.alive && !categories.has("family") && !ties.length) continue;
            if (!ties.length && bond === 0 && feeling === "neutral" && (trust === null || trust === 50)) continue;
            if (profileView.filter !== "all" && !categories.has(profileView.filter)) continue;
            const description = describeRelationship(cat, other, bond, feeling, {
                mate, bestFriend, rivalries, grievance, crush, knownAdmirer
            });
            cards.push({ other, bond, trust, description, ties, priority });
        }

        cards.sort((a, b) => b.priority - a.priority ||
            Math.abs(b.bond) - Math.abs(a.bond) || a.other.name.localeCompare(b.other.name));

        return `<div class="profile-controls" role="group" aria-label="Filter relationships">
            ${filters.map(label => profileControl("filter", label.toLowerCase(), label, profileView.filter)).join("")}
        </div>
        <div class="profile-card-list">
            ${cards.map(({ other, bond, trust, description, ties }) => `
                <article class="profile-card">
                    <h4>${escapeHtml(other.name)}${other.alive ? "" : " <small>· Deceased</small>"}</h4>
                    ${ties.length ? `<div class="tag-row">${ties.map(tie => `<span class="tag">${escapeHtml(tie)}</span>`).join("")}</div>` : ""}
                    <p>${escapeHtml(description)}</p>
                    <p class="muted">${escapeHtml(cat.name)}’s bond · ${bond > 0 ? "+" : ""}${bond}</p>
                    ${trust === null ? "" : `<p class="muted">Trust in ${escapeHtml(other.name)} · ${trust}/100</p>`}
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
                const title = memory.event === "starclan_dream" ? "StarClan dream"
                    : memory.event === "deathberry_nightmare" ? "Nightmare"
                    : prettyTrait((memory.event || "Memory").replaceAll("_", " "));
                const participants = (memory.participants ?? [])
                    .map(id => catsById.get(id)?.name)
                    .filter(Boolean);
                const description = memory.description?.includes("{") ? "" : memory.description;
                const fightContext = memory.privateFightReason?.ownerId === state.playerCatId
                    ? memory.privateFightReason?.text
                    : memory.event === "clan_fight" && !memory.fightOpeningRecorded ? "Cause unknown." : "";
                return `<li class="profile-card">
                    ${memory.day == null ? "" : `<div class="muted">Day ${escapeHtml(memory.day)}</div>`}
                    <h4>${escapeHtml(title)}</h4>
                    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
                    ${fightContext ? `<p>${escapeHtml(fightContext)}</p>` : ""}
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

    const CRUSH_DURATION = 30;
    const MUTUAL_CRUSH_DURATION = 60;
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
        const updates = cats.map(cat => {
            const rels = cat.relationships;
            const startDays = rels.crushStartDays || {};
            const activityDays = rels.crushActivityDays || {};
            const validCrushes = [...new Set(rels.crushes)]
                .map(getCat)
                .filter(target => canKeepCrush(cat, target) && !rels.mates.includes(target.id))
                .filter(target => {
                    const reciprocalActive = target.relationships.crushActivityDays?.[cat.id] ??
                        target.relationships.crushStartDays?.[cat.id] ?? state.day;
                    const mutual = target.relationships.crushes.includes(cat.id) &&
                        !target.relationships.mates.includes(cat.id) && canKeepCrush(target, cat) &&
                        state.day - reciprocalActive < MUTUAL_CRUSH_DURATION;
                    const lastActive = activityDays[target.id] ?? startDays[target.id] ?? state.day;
                    return state.day - lastActive < (mutual ? MUTUAL_CRUSH_DURATION : CRUSH_DURATION);
                })
                .sort((a, b) => relationship(cat, b) - relationship(cat, a))
                .slice(0, crushLimit(cat)).map(target => target.id);
            return { cat, validCrushes, startDays, activityDays };
        });
        for (const { cat, validCrushes, startDays, activityDays } of updates) {
            const rels = cat.relationships;
            rels.crushes = validCrushes;
            rels.crushStartDays = Object.fromEntries(validCrushes.map(id => [id, startDays[id] ?? state.day]));
            rels.crushActivityDays = Object.fromEntries(validCrushes.map(id => [id, activityDays[id] ?? rels.crushStartDays[id]]));

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
        Relationships.refreshRivalries(cats, clanHistoryCats());
    }

    function clearCrush(cat, target) {
        const rels = cat.relationships;
        if (!rels.crushes.includes(target.id)) return;
        rels.crushes = rels.crushes.filter(id => id !== target.id);
        if (rels.crushStartDays) delete rels.crushStartDays[target.id];
        if (rels.crushActivityDays) delete rels.crushActivityDays[target.id];

        Relationships.refreshRivalries(livingCats(), clanHistoryCats());
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

    function refreshCrush(cat, target) {
        if (cat.relationships.crushes.includes(target.id)) {
            (cat.relationships.crushActivityDays ??= {})[target.id] = state.day;
        }
    }

    function refreshMutualCrush(a, b) {
        if (!a.relationships.crushes.includes(b.id) || !b.relationships.crushes.includes(a.id)) return;
        refreshCrush(a, b);
        refreshCrush(b, a);
    }

    function addCrush(a, b) {
        if (!canStartCrush(a, b)) return false;
        a.relationships.crushes.push(b.id);
        a.relationships.crushStartDays ??= {};
        a.relationships.crushStartDays[b.id] = state.day;
        refreshCrush(a, b);
        return true;
    }

    function tryDevelopCrush(cat, other, chanceMultiplier = 1) {
        const attraction = other.sex === "male" ? cat.attractionToMales : cat.attractionToFemales;
        const crushChance = (0.02 + (attraction / 100) * 0.03) * chanceMultiplier;
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
        const outcome = applyEncounterResult(result, patrol);
        if (result.successful) strengthenPatrolRelationships(patrol);
        return outcome;
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
        $("weatherSummary").textContent = ClanWeather.status(state);
        const spell = state.weather?.spell;
        const forecast = spell?.startsDay > state.day;
        const weather = forecast ? spell.id : ClanWeather.active(state);
        $("weatherHeading").textContent = forecast ? "Weather forecast" : "Current weather";
        $("weatherBriefing").dataset.tone = ["thunderstorm", "rain", "snow"].includes(weather) ? "alert" : "calm";

        const patients = [...new Set(CatConditions.patientsNeedingTreatment(livingCats(), state.day).map(item => item.cat))];
        const urgent = patients.filter(cat => cat.hunger > 75 &&
            (cat.rank === "Medicine Cat" || (cat.age >= 6 && CatConditions.skill(cat, "hunting") >= 4)));
        const meals = expectedMeals();
        const shortage = Math.max(0, meals - state.prey);
        $("clanReadiness").dataset.tone = shortage || urgent.length ? "alert" : "calm";
        $("readinessStock").textContent = state.prey;
        $("readinessMeals").textContent = `${meals} ${meals === 1 ? "cat needs" : "cats need"} food tonight` +
            (shortage ? ` · ${shortage} ${shortage === 1 ? "portion" : "portions"} short` : "");
        $("readinessTreatment").hidden = !patients.length;
        $("readinessTreatment").textContent = `${patients.length} need treatment · ${ClanHerbs.total(state.herbInventory)} supplies in storage`;
        $("readinessUrgent").hidden = !urgent.length;
        $("readinessUrgent").textContent = urgent.length
            ? `Feed and treat ${new Intl.ListFormat("en").format(urgent.map(cat => cat.name))} first.` : "";
        const restQueued = state.campRestDay === state.day + 1;
        $("campRestBtn").textContent = restQueued ? "Resume patrols tomorrow" : "Keep patrols in camp tomorrow";
        $("campRestBtn").disabled = !restQueued && !canPlanCampRest();
        const hunter = shortHuntCandidate();
        const candidates = livingCats().filter(canPatrol);
        const player = playerCat();
        $("territoryGrid").innerHTML = (hunter ? `
            <div class="location-card">
                <h3>Short hunt near camp</h3>
                <p>${escapeHtml(hunter.name)} can bring back a small catch for the cats who need it most.</p>
                <span class="location-difficulty">Once per day</span>
                <div class="tag-row">
                    <button type="button" class="button primary" data-short-hunt="weakest">Feed the weakest first</button>
                    <button type="button" class="button primary" data-short-hunt="working">Feed hunters and healers first</button>
                </div>
            </div>` : "") + LOCATIONS.map(loc => {
            const effects = ClanWeather.patrolEffects(state, seasonName(), loc);
            const { patrol, patrolHealer } = planManualPatrol(loc, candidates, player);
            const plan = ClanPatrols.plan(loc, patrol, effects, patrolHealer);
            const roles = plan
                ? `${escapeHtml(plan.goal.lead.name)} (${plan.goal.name}) · ${escapeHtml(plan.safety.lead.name)} (${plan.guide.toLowerCase()}, ${plan.safety.name})`
                : "No patrols available";
            const forecast = plan ? [
                ...(!patrolHealer ? [`${Math.round(plan.goalChance * 100)}% goal chance`] : []),
                `${Math.round(plan.injuryChance * 100)}% route injury risk`,
                ...(hasShelteredHuntFallback(loc, effects, plan.goal) ? ["Fallback catch on a missed hunt"] : []),
                ...(plan.energySaved ? [`${plan.energySaved} energy saved each`] : [])
            ].join(" · ") : "";
            const herbs = patrolHealer ? ClanHerbs.at(loc).map(herb => herb.name).join(", ") : "";
            const routeEffects = [
                effects.energy ? `+${effects.energy} energy cost` : "",
                effects.heatExhaustionRisk ? `${Math.round(effects.heatExhaustionRisk * 100)}% heat exhaustion risk per cat` : "",
                effects.weatherRisk === 2 ? "Dangerous river crossing in the thunderstorm" :
                    effects.weatherRisk ? "Higher risk in heavy rain" : "",
                effects.prey ? `${effects.prey > 0 ? "+" : ""}${effects.prey} prey on success` : ""
            ].filter(Boolean);
            const wildfire = effects.burnedUntil ? `
                <span class="location-hazard">
                    <strong>Wildfire damage through Day ${effects.burnedUntil}</strong>
                    <span>Higher patrol risk and fewer herbs</span>
                </span>` : "";
            return `<button type="button" class="location-card" data-patrol="${loc.id}">
        <span class="location-emoji">${loc.emoji}</span>
        <h3>${loc.name}</h3>
        <p>${loc.desc}</p>
        <span class="location-difficulty">${loc.difficulty} patrol</span>
        <p>${roles}</p>
        ${forecast ? `<p class="muted">${forecast}</p>` : ""}
        ${herbs || wildfire || routeEffects.length ? `
            <span class="location-details">
                ${herbs ? `<span><strong>Herbs</strong> ${escapeHtml(herbs)}</span>` : ""}
                ${wildfire}
                ${routeEffects.length ? `
                    <span class="location-modifiers">
                        <strong>Route modifiers</strong>
                        ${routeEffects.map(effect => `<span>${escapeHtml(effect)}</span>`).join("")}
                    </span>` : ""}
            </span>` : ""}
      </button>`;
        }).join("");

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
        Relationships.refreshRivalries(livingCats(), clanHistoryCats());
        apprentice.medicineTrack = true;
        const message = `${healer.name} chose ${apprentice.name} as their medicine cat apprentice.`;
        logEvent("training", message);
        return message;
    }

    function gatherHerbs(healer, location, preferred) {
        if (healer.lastHerbDay === state.day) {
            return `${healer.name} has already gathered herbs today.`;
        }
        healer.lastHerbDay = state.day;
        const healing = CatConditions.skill(healer, "healing");
        const amount = Math.max(1, rand(1, 3) + Math.min(2, Math.floor(healing / 4)) +
            ClanWeather.herbModifier(state, seasonName(), location));
        const herb = ClanHerbs.gatherable(location, preferred, rand);
        if (!herb) return `${healer.name} found no medicine supplies at ${location.name}.`;
        state.herbInventory[herb.id] = ClanHerbs.count(state.herbInventory, herb) + amount;
        const message = `${healer.name} gathered ${amount} × ${herb.name} at ${location.name}.`;
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

    function treatPatient(healer, patient, herb) {
        if (!patient || healer.lastTreatmentDay === state.day) return;
        if (!herb || herb.lethal) return "Choose a remedy from the medicine den first.";
        const stock = ClanHerbs.count(state.herbInventory, herb);
        const cost = patient.herbCost;
        if (stock < cost) {
            return `Treatment needs ${cost} × ${herb.name}. Only ${stock} in storage.`;
        }
        state.herbInventory[herb.id] -= cost;
        healer.lastTreatmentDay = state.day;
        let outcome;
        if (!herb.treats.includes(patient.condition.id)) {
            const condition = patient.condition;
            condition.lastTreatmentAttemptDay = state.day;
            const delay = Math.min(2, 4 - (condition.treatmentDelay ?? 0));
            condition.treatmentDelay = (condition.treatmentDelay ?? 0) + delay;
            if (Number.isFinite(condition.naturalRecoveryDay)) condition.naturalRecoveryDay += delay;
            outcome = delay
                ? `${herb.name} did not help ${patient.cat.name}. Recovery was delayed.`
                : `${herb.name} did not help ${patient.cat.name}.`;
        } else {
            outcome = CatConditions.treat(healer, patient, state.day);
        }
        const message = `${outcome} Used ${cost} × ${herb.name}.`;
        const review = herb.treats.includes(patient.condition.id) ? DeathberryIncidents.noteCare(healer, patient.cat) : "";
        const report = review ? `${message} ${review}` : message;
        logEvent("treatment", report);
        return report;
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
        const review = DeathberryIncidents.oversight(healer);
        const berries = healer.deathberryCache ?? 0;
        const button = (action, label, cat, disabled = false) =>
            `<button type="button" class="button primary" data-medicine-action="${action}" data-patient="${escapeHtml(cat.id)}"${disabled ? " disabled" : ""}>${label}</button>`;
        const choices = apprentice || reservedKit ? "" : [
            ...medicineKitCandidates().map(cat => button("reserve-kit", `Reserve ${escapeHtml(cat.name)}`, cat, unavailable)),
            ...medicineApprenticeCandidates(true).map(cat => button("apprentice", `Choose ${escapeHtml(cat.name)}`, cat, unavailable))
        ].join("");

        den.innerHTML = `
            <h2>Medicine Cat Den</h2>
            <p>Healing: <strong>${healer.skills.healing ?? 0}/10</strong>
            ${(healer.skills.healing ?? 0) < 10 ? ` · Diagnostic Experience: ${healer.diagnosisExperience ?? 0}/3` : ""}</p>
            <p>Each medicine cat can gather herbs once per day. <br>Diagnose illnesses and injuries to level up healing skill.</p>
            <h3>Medicine stores</h3>
            <ul>
            ${ClanHerbs.medicinal.map(herb => `<li>${herb.name} · <strong>${ClanHerbs.count(state.herbInventory, herb)}</strong></li>`).join("")}
            </ul>
            ${berries ? `<p>Hidden cache: ${berries} deathberr${berries === 1 ? "y" : "ies"}.</p>` : ""}
            ${review ? `<p>Care is under review until day ${review.supervisionUntil}. Ordinary treatment is available.</p>` : ""}
            ${DeathberryIncidents.pendingConfession(healer) ? button("deathberry-confession", "Speak to Clan leader", healer) : ""}
            ${unavailable ? "<p>Rest until you can care for other cats again.</p>" : ""}
            <p></p>
            <h3>Patients</h3>
            ${patients.map(cat => {
                const available = !unavailable || cat === healer;
                const diagnosed = (cat.conditions ?? []).some(condition => condition.stageDay <= state.day &&
                    condition.diagnosedSeverity === condition.severity && condition.diagnosedStageDay === condition.stageDay);
                const status = !needsIsolation(cat) ? "Healthy" :
                    diagnosed ? CatConditions.describe(cat, state.day).join("; ") : "Unwell";
                const requestsAnother = DeathberryIncidents.prefersOtherHealer(cat, healer);
                return `<div class="profile-card">
                    <strong>${escapeHtml(cat.name)}</strong>
                    <p>${escapeHtml(status)}${cat.quarantined ? " · In quarantine" : ""}</p>
                    ${requestsAnother ? "<p>Would prefer another healer if one is available.</p>" : ""}
                    <div class="profile-controls">
                        ${button("diagnose", "Diagnose", cat, !available)}
                        ${button(cat.quarantined ? "release" : "quarantine", cat.quarantined ? "Release" : "Quarantine", cat, !available)}
                        ${DeathberryIncidents.canAskWishes(healer, cat) ? button("care-wishes", "Ask what they need", cat) : ""}
                        ${DeathberryIncidents.eligible(healer, cat) ? button("deathberry", "Feed deathberry", cat) : ""}
                    </div>
                    ${treatment.filter(patient => patient.cat === cat).map(patient => {
                        const known = patient.condition.diagnosedSeverity === patient.condition.severity &&
                            patient.condition.diagnosedStageDay === patient.condition.stageDay;
                        const disabled = !available || healer.lastTreatmentDay === state.day;
                        const id = escapeHtml(`herb-${cat.id}-${patient.condition.id}`);
                        const options = ClanHerbs.medicinal.filter(herb => ClanHerbs.count(state.herbInventory, herb) > 0);
                        return `<div class="profile-controls">
                            <label for="${id}">${known ? patient.name : "Undiagnosed condition"} · ${patient.herbCost} needed</label>
                            <select id="${id}"${disabled ? " disabled" : ""}>
                                <option value="">Choose a supply</option>
                                ${options.map(herb => {
                                    const stock = ClanHerbs.count(state.herbInventory, herb);
                                    return `<option value="${herb.id}"${stock < patient.herbCost ? " disabled" : ""}>${herb.name} (${stock})</option>`;
                                }).join("")}
                            </select>
                            <button type="button" class="button primary" data-medicine-action="treat"
                                data-patient="${escapeHtml(cat.id)}" data-condition="${patient.condition.id}"
                                ${disabled || !options.some(herb => ClanHerbs.count(state.herbInventory, herb) >= patient.herbCost) ? "disabled" : ""}>Treat</button>
                        </div>`;
                    }).join("")}
                </div>`;
            }).join("") || "<p>No cats need care today.</p>"}
            <h3>Apprentice</h3>
            ${apprentice ? `<p>${escapeHtml(apprentice.name)} is training with you.</p>` : reservedKit ? `
                <p>You privately chose ${escapeHtml(reservedKit.name)}. The Clan will learn of your choice when the kit turns 6 moons old.</p>
                ${button("cancel-reservation", "Cancel reservation", reservedKit, unavailable)}
            ` : choices ? `
                <p>Reserve a kit privately or choose an apprentice to start medicine cat training now.</p>
                <div class="profile-controls">${choices}</div>
            ` : hasMedicineApprenticeSlot()
                ? "<p>No kits or apprentices are available.</p>"
                : `<p>All ${MEDICINE_APPRENTICE_LIMIT} medicine cat apprentice slots are filled.</p>`}
        `;
    }

    function handleMedicineAction(action, id, conditionId) {
        const healer = playerCat();
        const cat = getCat(id);
        if (healer?.rank !== "Medicine Cat" || !cat ||
            (healer !== cat && (healer.quarantined || healer.health < 35))) return;

        if (["deathberry", "deathberry-confession", "care-wishes"].includes(action)) {
            if ($("questCard").hidden) {
                if (action === "deathberry") DeathberryIncidents.openChoice(healer, cat);
                else if (action === "care-wishes") DeathberryIncidents.askWishes(healer, cat);
                else if (healer === cat) DeathberryIncidents.confession(healer);
            }
            return;
        }

        let message;
        if (action === "diagnose" && needsIsolation(cat)) {
            message = diagnosePatient(healer, cat);
        } else if (action === "treat" && healer.lastTreatmentDay !== state.day) {
            const patient = CatConditions.patientsNeedingTreatment([cat], state.day)
                .find(candidate => candidate.condition.id === conditionId);
            const herb = ClanHerbs.get($(`herb-${id}-${conditionId}`)?.value);
            if (patient) message = treatPatient(healer, patient, herb);
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
        DeathberryIncidents.recordPatientRequests();

        const patientsAvoiding = healer => cats.filter(cat => DeathberryIncidents.prefersOtherHealer(cat, healer)).length;
        for (const healer of healers.sort((a, b) => patientsAvoiding(a) - patientsAvoiding(b))) {
            if (healer.id === state.playerCatId || healer.health < 35 || healer.energy < 20) continue;
            const accessible = healer.quarantined ? [healer] : cats;
            for (const cat of accessible) {
                if (!cat.quarantined && hasGreencough(cat)) {
                    setQuarantine(cat, true);
                    busy.add(healer.id);
                }
            }
            const patients = healer.quarantined ? [healer] : cats;
            const treatment = CatConditions.patientsNeedingTreatment(patients, state.day);
            const patient = treatment[0];
            if (patient) {
                diagnosePatient(healer, patient.cat, false);
                busy.add(healer.id);
            }
            const stock = state.herbInventory;
            const needed = patient && !ClanHerbs.affordable(stock, patient)
                ? ClanHerbs.remedies(patient).sort((a, b) => ClanHerbs.count(stock, b) - ClanHerbs.count(stock, a))[0]
                : ClanHerbs.medicinal.find(herb => ClanHerbs.count(stock, herb) < 3);
            if (!healer.quarantined && needed && healer.lastHerbDay !== state.day) {
                const location = LOCATIONS.find(loc => needed.routes.includes(loc.id));
                gatherHerbs(healer, location, needed);
                healer.energy = clamp(healer.energy - 10, 0, 100);
                busy.add(healer.id);
            }
            const affordable = treatment.find(candidate => !DeathberryIncidents.prefersOtherHealer(candidate.cat, healer) &&
                ClanHerbs.affordable(stock, candidate)) ?? treatment.find(candidate => ClanHerbs.affordable(stock, candidate));
            if (affordable && healer.lastTreatmentDay !== state.day) {
                if (affordable.cat !== patient.cat) diagnosePatient(healer, affordable.cat, false);
                treatPatient(healer, affordable, ClanHerbs.affordable(stock, affordable));
                busy.add(healer.id);
            }

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

    function scheduleWeatherFlood() {
        const spell = state.weather?.spell;
        const risk = ClanWeather.floodChance(spell);
        if (!risk || spell.floodChecked) return;
        spell.floodChecked = true;
        const day = Math.max(state.day + 1, spell.startsDay + 1);
        if (state.disaster || day > spell.endsDay || !chance(risk)) return;

        state.disaster = { day, weatherStart: spell.startsDay, weatherId: spell.id, warnClan: false };
        logEvent("weather", "The river is rising fast. The low ground around camp may flood.");
    }

    const WILDFIRE_COOLDOWN = 40;

    function canScheduleWildfire() {
        return !state.disaster && state.day - (state.lastWildfireDay ?? -WILDFIRE_COOLDOWN) >= WILDFIRE_COOLDOWN;
    }

    function queueWildfire(day, source) {
        const territory = pick(LOCATIONS.filter(loc => loc.prey[1] > 0));
        state.disaster = { kind: "wildfire", day, source, locationId: territory.id, warnClan: false };
        return state.disaster;
    }

    function scheduleHeatWildfire() {
        const spell = state.weather?.spell;
        if (ClanWeather.active(state) !== "heat" || spell.fireChecked) return;
        spell.fireChecked = true;
        if (!canScheduleWildfire() || !chance(.08)) return;
        queueWildfire(state.day + 1, "heat");
        logEvent("weather", "Smoke is rising beyond the territory. The fire could reach camp by dawn.");
    }

    function resolveMedicineDream(warnClan) {
        const dream = state.medicineDream;
        if (!dream) return;
        state.medicineDream = null;
        // An omen from a save made before weather-driven floods may already promise a flood.
        if (!state.disaster && dream.kind == null && dream.weatherStart == null) {
            state.disaster = { ...dream, warnClan: false };
        }
        const disaster = state.disaster;
        const kind = dream.kind ?? "flood";
        if (disaster && (disaster.kind ?? "flood") === kind && disaster.day === dream.day &&
            disaster.weatherStart === dream.weatherStart) {
            disaster.healerId = dream.healerId;
            disaster.warnClan ||= warnClan;
        }
        const healer = getCat(dream.healerId);
        const response = warnClan
            ? `${healer.name} warned the clan about a coming ${kind}. The clan began preparing.`
            : `${healer.name} kept the warning private and prepared for the ${kind} alone.`;
        const message = dream.omen ? `${dream.omen} ${response}` : response;
        rememberEvent(healer, `${kind}_omen`, {
            description: message,
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
        if (dream.visitorId && DeathberryIncidents.isVictimOf(healer.id, dream.visitorId)) {
            delete dream.visitorId;
            dream.omen = medicineOmen(healer, dream.kind);
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
            title: dream.kind === "wildfire" ? "A Warning in Ash" : "A Warning in Water",
            description: `${dream.omen ?? `${healer.name} woke with a warning for the clan.`} Will ${healer.name} warn the clan or prepare alone?`,
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

    function medicineOmen(healer, kind, visitor) {
        const vision = kind === "wildfire"
            ? "flaming trees and dark ash falling like snow into the camp clearing"
            : "floodwater bursting through the camp entrance and washing away everything dear";
        return visitor
            ? `${visitor.name} appeared in ${healer.name}'s dream and showed them ${vision}.`
            : `${healer.name} dreamed of ${vision}.`;
    }

    function rollMedicineDream() {
        if (state.day < state.nextDreamDay) return false;
        const pending = state.disaster;
        const canForeseeDisaster = pending && (pending.weatherStart != null || pending.kind === "wildfire") &&
            pending.day > state.day && !pending.omenSeen;
        for (const healer of livingCats().filter(cat => cat.rank === "Medicine Cat")) {
            if (!chance(clamp(healer.faith ?? 50, 0, 100) * (canForeseeDisaster ? .003 : .002))) continue;
            state.nextDreamDay = state.day + 10;
            const visitors = state.starClan.filter(cat => !DeathberryIncidents.isVictimOf(healer.id, cat.id));
            const visitor = visitors.length ? pick(visitors) : null;
            let threat = canForeseeDisaster && chance(.65) ? pending : null;
            if (!threat && canScheduleWildfire() && chance(.04)) {
                threat = queueWildfire(state.day + rand(2, 3), "dream");
            }
            if (!threat) {
                const signReader = [healer, ...livingCats()].find(cat =>
                    Number.isFinite(cat.moonpoolSignDay) && state.day - cat.moonpoolSignDay <= DAYS_PER_MOON);
                const remembrance = ClanQuirks.remembranceDream(healer, visitor);
                const description = remembrance || (signReader
                    ? `${healer.name} dreamed of three ripples crossing Moonpool Hollow against the wind, just as ${signReader.name} had seen on patrol.`
                    : visitor
                    ? `${visitor.name} visited ${healer.name} in a dream. They sat together and talked beneath the stars until ${healer.name} woke up.`
                    : `${healer.name} dreamed of stars reflected in still water and woke without a clear omen.`);
                if (signReader && !remembrance) delete signReader.moonpoolSignDay;
                rememberEvent(healer, visitor && (!signReader || remembrance) ? "starclan_dream" : "dream", {
                    description,
                    importance: 3,
                    participants: remembrance ? [visitor.id] : signReader && signReader !== healer ? [signReader.id] :
                        visitor && !signReader ? [visitor.id] : []
                });
                logEvent("dream", description);
                return false;
            }
            const omen = medicineOmen(healer, threat.kind, visitor);
            threat.omenSeen = true;
            state.medicineDream = {
                healerId: healer.id, day: threat.day, kind: threat.kind ?? "flood", weatherStart: threat.weatherStart, omen,
                visitorId: visitor?.id
            };
            return showMedicineDream();
        }
        return false;
    }

    function resolveDisaster() {
        const disaster = state.disaster;
        if (!disaster || disaster.day > state.day) return "";
        state.disaster = null;
        if (disaster.kind === "wildfire") return resolveWildfire(disaster);

        const report = [disaster.weatherId === "thunderstorm"
            ? "The thunderstorm raged through the night, causing the river to swell. A flood swept through camp before dawn."
            : "Floodwater swept through camp before dawn."];
        const suppliesMoved = (state.floodSuppliesSafeUntil ?? 0) >= state.day;
        const preyLost = suppliesMoved ? 0 : Math.min(state.prey, dailyPreyNeed());
        state.prey -= preyLost;
        if (suppliesMoved) report.push("The prey and bedding were safe on higher ground.");
        else if (preyLost) report.push(`The flood washed away ${preyLost} prey.`);
        const deaths = [];
        let injuries = 0;
        for (const cat of livingCats()) {
            const prepared = disaster.warnClan || cat.id === disaster.healerId;
            const roll = Math.random();
            if (roll < (prepared ? .005 : .025)) {
                deaths.push(cat.name);
                recordDeath(cat, `${cat.name} died in the flood.`);
            } else if (roll < (prepared ? .09 : .30)) {
                injuries++;
                cat.health = Math.max(1, cat.health - rand(8, 20));
                const recorded = CatConditions.add(cat, chance(.25) ? "brokenLeg" : "scrape", state.day,
                    (type, message) => report.push(message));
                if (!recorded) report.push(`${cat.name} was injured while escaping the flood.`);
            }
        }
        if (deaths.length === 0 && injuries === 0) {
            report.push("Every cat escaped safely.");
        }
        const summary = report.join(" ");
        logEvent("disaster", summary);
        return deaths.length ? `${summary} ${new Intl.ListFormat("en").format(deaths)} died in the flood.` : summary;
    }

    function resolveWildfire(disaster) {
        state.lastWildfireDay = state.day;
        const territory = LOCATIONS.find(loc => loc.id === disaster.locationId);
        const burnedUntil = state.day + 6;
        (state.burnedTerritories ??= {})[territory.id] = burnedUntil;

        const preyLost = Math.ceil(state.prey * (disaster.suppliesMoved ? .12 : .40));
        const herbsLost = ClanHerbs.lose(state.herbInventory, disaster.suppliesMoved ? .10 : .30);
        state.prey -= preyLost;
        const report = [
            `A wildfire swept through camp and scorched ${territory.name}.`,
            `The clan lost ${preyLost} prey and ${herbsLost} herbs. ${territory.name} will be harder to patrol through Day ${burnedUntil}.`
        ];

        const cats = livingCats();
        const exposed = cats.filter(cat => cat.id !== disaster.healerId);
        const deceased = cats.length > 1 && exposed.length && chance(disaster.warnClan ? .10 : .35)
            ? pick(exposed) : null;
        if (deceased) {
            recordDeath(deceased, `${deceased.name} died in the wildfire.`);
            report.push(`${deceased.name} died in the wildfire.`);
        }
        const survivors = cats.filter(cat => cat !== deceased && cat.id !== disaster.healerId);
        const injuryCount = Math.min(survivors.length, disaster.warnClan ? 1 : rand(1, 3));
        for (let i = 0; i < injuryCount; i++) {
            const [cat] = survivors.splice(rand(0, survivors.length - 1), 1);
            cat.health = Math.max(1, cat.health - rand(8, 18));
            CatConditions.add(cat, "burn", state.day, logEvent);
            const description = `${cat.name} suffered a burn while escaping the wildfire.`;
            report.push(description);
            rememberEvent(cat, "wildfire_injury", { description, importance: 4 });
        }
        const summary = report.join(" ");
        logEvent("disaster", summary);
        return summary;
    }

    function findWildfireWarning(cats) {
        const fire = state.disaster;
        if (fire?.kind !== "wildfire" || fire.source !== "heat" || fire.warningResolved || fire.day <= state.day) return null;
        const actor = cats.find(cat => cat.id === state.playerCatId && cat.age >= 6) ??
            cats.find(cat => cat.rank === "Leader") ?? cats.find(cat => cat.age >= 6);
        if (!actor) return null;
        return {
            participants: { actor },
            event: {
                id: "wildfire_warning",
                title: "Smoke on the Wind",
                description: "A smoky scent pervades the camp, setting cats on edge. A patrol returns, announcing the worst: a wildfire is spreading. Fast. The Clan looks on ${actor.name} to decide whether they should evacuate or bury their stores first.",
                decisionMaker: "actor",
                npcChoice: "evacuate",
                choices: [
                    { id: "evacuate", text: "Lead the Clan out of camp" },
                    { id: "save_stores", text: "Bury the prey and herbs" }
                ].map(choice => ({
                    ...choice,
                    effects: [{ type: "wildfire_warning", action: choice.id, day: fire.day }]
                }))
            }
        };
    }

    function resolveWildfireWarning(effect, actor) {
        const fire = state.disaster;
        if (fire?.kind !== "wildfire" || fire.day !== effect.day || fire.warningResolved) return;
        fire.warningResolved = true;
        const evacuate = effect.action === "evacuate";
        if (evacuate) fire.warnClan = true;
        else fire.suppliesMoved = true;
        const description = evacuate
            ? `${actor.name} led the Clan away before the fire reached camp.`
            : `${actor.name} helped bury a cache of prey and herbs to protect it from the fire.`;
        rememberEvent(actor, "wildfire_warning", { description, importance: 4 });
        return description;
    }

    function planManualPatrol(loc, candidates, player) {
        const playerGathers = player?.rank === "Medicine Cat" && player.lastHerbDay !== state.day &&
            candidates.includes(player);
        const patrol = ClanPatrols.selectTeam(loc, candidates, player, playerGathers ? "healing" : undefined);
        const healer = player?.rank === "Medicine Cat" && patrol.includes(player)
            ? player : patrol.find(cat => cat.rank === "Medicine Cat");
        return { patrol, healer, patrolHealer: healer?.lastHerbDay !== state.day ? healer : undefined };
    }

    function resolveRescueDeaths(fallen, describeCause, preferredSurvivor) {
        if (fallen.length === 1) recordDeath(fallen[0], describeCause(fallen[0]));
        if (fallen.some(cat => cat.id === state.playerCatId)) {
            state.playerCatId = preferredSurvivor?.id ?? livingCats().find(cat => !fallen.includes(cat))?.id ?? null;
        }
        if (fallen.some(cat => cat.id === selectedCatId)) selectedCatId = state.playerCatId;
        if (fallen.length > 1) {
            for (const cat of fallen) recordDeath(cat, describeCause(cat));
        }
        resolveLeadershipVacancy();
    }

    function runPatrol(locationId, returning = false) {
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

        const { patrol, healer, patrolHealer } = planManualPatrol(loc, candidates, player);
        if (healer?.lastHerbDay === state.day && healer.lastHerbNoticeDay !== state.day) {
            healer.lastHerbNoticeDay = state.day;
            saveGame(false);
            showNotice(`${healer.name} has already gathered herbs today. Choose a patrol to continue.`);
            return;
        }

        if (!returning && patrol.includes(player) && StoryEvents.readyAfterFall(player) && StoryEvents.showRecoveredPatrolChoice(player)) return;
        const result = resolvePatrol(loc, patrol, patrolHealer);
        showNotice(result);
        render();
        if (!patrolHealer && loc.prey[1] > 0) handlePatrolConflict(patrol, true);
        saveGame(false);
    }

    function canPatrol(cat) {
        return cat.age >= 6 && cat.health > 20 && cat.energy > 15 && !cat.quarantined;
    }

    function dailyPreyNeed(catCount = livingCats().length) {
        return Math.max(2, Math.ceil(catCount * .45));
    }

    function expectedMeals(cats = livingCats()) {
        return cats.filter(cat => cat.hunger + 14 > 35).length;
    }

    function mealForecastText() {
        const need = expectedMeals();
        return `${need} ${need === 1 ? "cat needs" : "cats need"} food tonight · ${state.prey} portions available` +
            (need > state.prey ? ` · ${need - state.prey} short` : "");
    }

    function canPlanCampRest() {
        const cats = livingCats();
        return cats.length > 0 && state.prey >= Math.max(1, expectedMeals(cats));
    }

    function toggleCampRest() {
        if (state.campRestDay === state.day + 1) delete state.campRestDay;
        else if (canPlanCampRest()) state.campRestDay = state.day + 1;
        saveGame(false);
        render();
    }

    function shortHuntCandidate(excludedId) {
        const cats = livingCats();
        if (state.lastShortHuntDay === state.day ||
            (state.prey >= Math.max(1, expectedMeals(cats)) && cats.some(canPatrol))) return null;
        return cats.filter(cat => cat.id !== excludedId && cat.age >= 6 && cat.health > 0 && !cat.quarantined)
            .sort((a, b) => b.health - a.health || b.energy - a.energy)[0];
    }

    function runShortHunt(priority) {
        const hunter = shortHuntCandidate();
        if (!hunter) return;
        const message = resolveShortHunt(hunter, priority);
        saveGame(false);
        render();
        showNotice(message);
    }

    function resolveShortHunt(hunter, priority = "weakest") {
        state.lastShortHuntDay = state.day;
        hunter.energy = Math.max(0, hunter.energy - 5);
        const portions = rand(2, 4);
        const dutyRank = cat => cat.rank === "Medicine Cat" ? 0 :
            cat.age >= 6 && !cat.quarantined && CatConditions.skill(cat, "hunting") >= 4 ? 1 : 2;
        const fed = livingCats().filter(cat => cat.hunger > 35)
            .sort((a, b) => (priority === "working" ? dutyRank(a) - dutyRank(b) : 0) ||
                a.health - b.health || b.hunger - a.hunger)
            .slice(0, portions);
        for (const cat of fed) {
            cat.hunger = Math.max(0, cat.hunger - rand(45, 55));
            if (cat.hunger <= 45 && cat.health <= 24) cat.health = Math.min(100, cat.health + 4);
        }
        state.prey += portions - fed.length;

        const meals = fed.length
            ? ` ${new Intl.ListFormat("en").format(fed.map(cat => cat.name))} ate first.`
            : " The catch went to the prey pile.";
        const message = `${hunter.name} brought back ${portions} prey from a short hunt near camp.${meals}`;
        logEvent("patrol", message);
        return message;
    }

    function hasShelteredHuntFallback(loc, weather, goal) {
        return loc.id === "pinewood" && weather.risk === 0 && goal.name === "hunting" && goal.score >= 5;
    }

    function applyPatrolHeat(patrol, risk) {
        if (!risk) return [];
        const affected = [];
        for (const cat of patrol) {
            if (!cat.alive || cat.conditions?.some(condition => condition.id === "heatExhaustion") || !chance(risk)) continue;
            const severity = cat.energy <= 25 ? "serious" : "mild";
            CatConditions.add(cat, "heatExhaustion", state.day, logEvent, 0, severity);
            affected.push(`${cat.name} developed ${severity} heat exhaustion.`);
        }
        return affected;
    }

    function resolvePatrol(loc, patrol, healer) {
        CatConditions.recordContact(patrol, "patrol", state.day);
        for (const cat of patrol.filter(StoryEvents.readyAfterFall)) StoryEvents.rememberReturnPatrol(cat, loc);
        const weather = ClanWeather.patrolEffects(state, seasonName(), loc);
        const plan = ClanPatrols.plan(loc, patrol, weather, healer);
        const { goal, safety, yieldRole } = plan;

        for (const cat of patrol) {
            cat.energy = clamp(cat.energy - rand(10, 22) - weather.energy + plan.energySaved, 0, 100);
            cat.hunger = clamp(cat.hunger + rand(8, 15), 0, 100);
            cat.experience += rand(1, 3);
        }

        const predatorRisk = activePredatorRisk();
        if (chance(predatorRisk)) {
            const result = window.StoryEvents.resolveFootprintsEncounter(patrol, false, predatorRisk, true);
            const outcome = [applyEncounterResult(result, patrol), ...applyPatrolHeat(patrol, weather.heatExhaustionRisk)].join(" ");
            if (result.successful) strengthenPatrolRelationships(patrol);
            logEvent("patrol", outcome);
            return outcome;
        }

        const success = !healer && chance(plan.goalChance);
        const injury = chance(plan.injuryChance);
        const names = new Intl.ListFormat("en").format(patrol.map(cat => cat.name));
        const report = [];
        let completedGoal = false;
        if (healer) {
            const stock = ClanHerbs.total(state.herbInventory);
            report.push(gatherHerbs(healer, loc));
            completedGoal = ClanHerbs.total(state.herbInventory) > stock;
        } else if (loc.id === "moonpool") {
            if (success) {
                completedGoal = true;
                const sign = `${goal.lead.name} saw three ripples cross Moonpool Hollow against the wind.`;
                goal.lead.moonpoolSignDay = state.day;
                rememberEvent(goal.lead, "moonpool_sign", { description: sign, importance: 3 });
                logEvent("lore", sign);
                report.push(sign);
            } else {
                report.push(`${names} visited Moonpool Hollow. The water held only their reflections.`);
            }
        } else if (success) {
            const prey = ClanQuirks.patrolPrey(patrol, Math.max(0, rand(loc.prey[0], loc.prey[1]) + weather.prey + plan.bonusPrey));
            state.prey += prey;
            completedGoal = prey > 0 || goal.name === "curiosity";
            if (goal.name === "curiosity") {
                report.push(`${goal.lead.name} discovered a passage beneath the stone walls of ${loc.name}.`);
                if (prey) report.push(`The patrol also returned with ${prey} prey.`);
            } else {
                report.push(prey
                    ? `${goal.lead.name} led the hunt at ${loc.name}. The patrol brought back ${prey} prey.`
                    : `${goal.lead.name} led the hunt at ${loc.name}, but the patrol returned empty-pawed.`);
            }
            if (plan.bonusPrey && yieldRole && prey) {
                report.push(yieldRole.name === "swimming"
                    ? `${yieldRole.lead.name} reached a deeper fishing spot.`
                    : `${yieldRole.lead.name} crept close to prey without being seen.`);
            }
        } else if (hasShelteredHuntFallback(loc, weather, goal)) {
            state.prey++;
            completedGoal = true;
            report.push(`The main hunt went poorly, but ${goal.lead.name} found one prey near the sheltered trail.`);
        } else {
            report.push(goal.name === "curiosity"
                ? `${goal.lead.name} searched ${loc.name} but found nothing of interest.`
                : `${goal.lead.name} led the hunt at ${loc.name}, but the patrol returned empty-pawed.`);
        }

        if (injury) {
            const hurt = pick(patrol);
            const medic = ClanPatrols.role(patrol, "healing");
            const aid = medic.score >= 4 ? Math.floor(medic.score / 2) : 0;
            const damage = Math.min(hurt.health - 1, rand(6, 14) - aid);
            hurt.health -= damage;
            CatConditions.add(hurt, "scrape", state.day, logEvent);
            report.push(`${hurt.name} was hurt along the route (-${damage} health).`);
            if (aid) report.push(`${medic.lead.name} tended the injury on the way home.`);
        } else {
            report.push(`${safety.lead.name} guided the patrol home safely.`);
        }
        if (plan.energySaved) {
            report.push(`${plan.stamina.lead.name} set a steady pace, saving each cat ${plan.energySaved} energy.`);
        }

        if (chance(.25)) {
            const practiced = pick([goal, safety]);
            const learner = patrol.find(cat => cat.rank === "Apprentice" && cat !== practiced.lead &&
                (cat.skills[practiced.name] ?? 0) < (practiced.lead.skills[practiced.name] ?? 0)) ?? practiced.lead;
            const current = learner.skills[practiced.name] ?? 0;
            if (current < 10) {
                learner.skills[practiced.name] = current + 1;
                report.push(`${learner.name} gained practice in ${practiced.name}.`);
            }
        }
        const outcome = [...report, ...applyPatrolHeat(patrol, weather.heatExhaustionRisk)].join(" ");
        if (completedGoal) strengthenPatrolRelationships(patrol);
        logEvent("patrol", outcome);
        return outcome;
    }


    function strengthenPatrolRelationships(patrol) {
        Relationships.strengthenPatrolBonds(patrol);
        ClanSocial.successfulPatrol(patrol);
        const survivors = patrol.filter(cat => cat.alive);
        for (const [index, first] of survivors.entries()) {
            for (const second of survivors.slice(index + 1)) {
                if (!Relationships.enmityWith(first, second) && !Relationships.enmityWith(second, first)) {
                    refreshMutualCrush(first, second);
                }
            }
        }
    }

    function handlePatrolConflict(patrol, playerPatrol = false) {
        if (!$("questCard").hidden) return;
        const survivors = patrol.filter(cat => cat.alive);
        const scenes = [];
        for (const actor of survivors) {
            for (const other of survivors) {
                if (actor === other) continue;
                const rivalry = Relationships.rivalriesWith(actor, other)
                    .reduce((strongest, entry) => !strongest || entry.intensity > strongest.intensity ? entry : strongest, null);
                const enmity = Relationships.enmityWith(actor, other);
                for (const conflict of [enmity, rivalry].filter(Boolean)) {
                    const event = StoryEvents.buildPatrolConflict(actor, other, conflict === enmity);
                    if (StoryEvents.canPairExperienceEvent(event, actor, other)) {
                        scenes.push({
                            actor, other, event,
                            rivalry: conflict === rivalry ? rivalry : null,
                            enmity: conflict === enmity ? enmity : null
                        });
                    }
                }
            }
        }
        const playerScenes = scenes.filter(scene => scene.actor.id === state.playerCatId);
        if (!scenes.length) return;
        const scene = pick(playerScenes.length ? playerScenes : scenes);
        const understanding = ClanSocial.patrolUnderstanding(scene.actor, scene.other);
        if (!chance((.20 + .12 * (scene.enmity?.distrust ?? scene.rivalry.intensity)) *
            (understanding && !scene.enmity ? .45 : 1))) return;
        const { actor, other, rivalry, enmity, event } = scene;
        const participants = { actor, other };

        function resolve(choice) {
            let outcome = choice.outcome;
            if (choice.id === "accept") {
                if (Relationships.easeDistrust(actor, other)) {
                    outcome += ` ${actor.name} let go of their grudge.`;
                }
                setRelationship(actor, other, relationship(actor, other) + 4);
            } else if (choice.id === "rematch") {
                Relationships.adjustRivalry(actor, other, rivalry, 1, state.day);
            } else if (choice.id === "concede") {
                Relationships.adjustRivalry(actor, other, rivalry, -1, state.day);
                setRelationship(actor, other, relationship(actor, other) + 3);
            } else if (choice.id === "accuse") {
                Relationships.recordGrievance(other, actor, "unfair_accusation",
                    `hunt:${state.day}:${actor.id}:${other.id}`, state.day);
                setRelationship(actor, other, relationship(actor, other) - 8);
            }
            recordCatEvent(enmity ? "patrol_trust" : "patrol_rivalry", [actor, other], {
                description: outcome, importance: 3, logToChronicle: true
            });
            if (playerPatrol) {
                saveGame(false);
                render();
                showNotice(outcome);
            }
        }

        if (actor.id === state.playerCatId) {
            StoryEvents.showStoryEvent(event, participants, resolve);
            return;
        }
        const confrontational = ["proud", "stubborn", "wary"].includes(actor.personality);
        let choiceId;
        if (enmity) {
            choiceId = chance(confrontational ? .30 : .65) ? "accept" : "doubt";
        } else if (confrontational && chance(.25)) {
            choiceId = "accuse";
        } else {
            choiceId = chance(confrontational ? .75 : .45) ? "rematch" : "concede";
        }
        StoryEvents.recordEventParticipants(event, participants);
        resolve(event.choices.find(choice => choice.id === choiceId));
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
        if (state.campRestDay === state.day) return [];
        const leader = livingCats().find(cat => cat.rank === "Leader");
        if (!leader || leader.id === state.playerCatId) return [];

        const deputy = preferredWarrior(leader, deputyCandidates(leader));
        if (deputy) appointDeputy(leader, deputy);
        const shortHunter = shortHuntCandidate(state.playerCatId);
        if (shortHunter) resolveShortHunt(shortHunter);
        if (leader.quarantined || leader.health <= 20) return shortHunter ? [shortHunter] : [];

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
        const candidates = cats.filter(cat => cat.id !== state.playerCatId && cat !== shortHunter &&
            ["Leader", "Deputy", "Warrior", "Apprentice"].includes(cat.rank) && canPatrol(cat));
        const team = ClanPatrols.selectTeam(location, candidates, null, undefined, ClanSocial.patrolPreference);
        const patrol = ClanSocial.givePatrolRelief(leader, team, candidates);
        if (patrol.length) {
            logEvent("patrol", `${leader.name} sent ${patrol.map(cat => cat.name).join(", ")} to hunt at ${location.name}.`);
            resolvePatrol(location, patrol);
            handlePatrolConflict(patrol);
        }
        // An excused cat rests for the day in place of taking an individual activity.
        return [...new Set([...team, ...patrol, ...(shortHunter ? [shortHunter] : [])])];
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

        const loveInterests = others.filter(other => StoryEvents.playerConfession(c, other));
        const other = pick(loveInterests.length && chance(.65) ? loveInterests : others);
        StoryEvents.showClanmateConversation(c, other, choice => {
            CatConditions.recordContact([c, other], "conversation", state.day);
            if (choice.talkAboutFeelings) {
                const event = StoryEvents.playerConfession(c, other);
                if (event) {
                    StoryEvents.recordEvent(event);
                    StoryEvents.showStoryEvent(event, { confessor: c, target: other }, (response, participants) => {
                        const outcome = applyStoryChoice(response, participants) || response.outcome;
                        logEvent("story", `${event.title} - ${outcome}`);
                        saveGame(false);
                        render();
                        showNotice(outcome);
                    });
                    return;
                }
            }
            let text = choice.outcome;
            if (choice.spendTime) {
                const bond = relationship(c, other);
                const gain = window.Relationships.routineBondGain(bond, rand(3, 6));
                setRelationship(c, other, bond + gain);
                refreshMutualCrush(c, other);
                c.energy = clamp(c.energy - 4, 0, 100);
                text += ` Their bond is now ${relationshipLabel(relationship(c, other))}.`;
                const newCrushes = [tryDevelopCrush(c, other), tryDevelopCrush(other, c)].filter(Boolean);
                if (newCrushes.length) text += ` ${newCrushes.join(" ")}`;
            }

            const privateReport = choice.spendTime && DeathberryIncidents.share(other, c);
            if (choice.spendTime) DeathberryIncidents.share(c, other);
            c.notes.push(text);
            logEvent("relationship", text);
            saveGame(false);
            render();
            showNotice(privateReport ? `${text} ${privateReport}` : text);
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
        if (apprentice.mentorId !== mentor.id || !chance(.35)) return;
        const event = { id: "mentor_rivalry", pairCooldown: 12 };
        const students = apprentices.filter(cat => cat !== apprentice && cat.mentorId === mentor.id &&
            StoryEvents.canPairExperienceEvent(event, cat, apprentice));
        if (!students.length) return;
        const overlooked = pick(students);
        if (Relationships.startRivalry(overlooked, apprentice, "mentor_praise", mentor.id, state.day)) {
            StoryEvents.recordPairEvent(event.id, overlooked, apprentice);
            rememberEvent(overlooked, "became_rivals", {
                description: `${overlooked.name} heard ${mentor.name} praise ${apprentice.name}'s training and decided to outdo them next time.`,
                importance: 3, participants: [apprentice.id, mentor.id]
            });
            logEvent("training", `${mentor.name} praised ${apprentice.name}'s effort. ${overlooked.name} vowed to do better next time.`);
        }
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
        if (DeathberryIncidents.share(cat, other) || DeathberryIncidents.share(other, cat)) return "";
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

            const crush = getCat(pick(crushIds));

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
                            crush.id,
                            { heardDay: state.day, heardWithId: listener === cat ? other.id : cat.id }
                        );

                        if (!window.Gossip.recordGossip(listener, gossip)) return;

                        // Only the cat who heard the gossip knows about the competition.
                        if (listener.relationships.crushes.includes(crush.id) &&
                            subject.relationships.crushes.includes(crush.id) &&
                            Relationships.startRivalry(listener, subject, "shared_crush", crush.id, state.day)) {
                            rememberEvent(listener, "became_rivals", {
                                description: `${listener.name} learned that ${subject.name} had feelings for the same cat.`,
                                importance: 3, participants: [subject.id], privateOwnerId: listener.id
                            });
                        }
                        window.SocialReactions.reactToGossip(listener, gossip);
                        const secretDay = subject.relationships.secretPartners?.[crush.id];
                        learnAboutOutsideTie(listener, subject, {
                            id: crush.id,
                            day: secretDay ?? subject.relationships.crushStartDays?.[crush.id] ?? 0,
                            type: secretDay === undefined ? "crush" : "relationship"
                        });
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

    function startGiftStory(giver, friend, rival) {
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
        if (!story || story.nextDay > state.day) return false;

        const giver = getCat(story.giverId);
        const friend = getCat(story.friendId);
        const rival = getCat(story.rivalId);
        if (!giver || !friend || !rival) {
            finishGiftStory();
            return false;
        }
        const rumorId = story.rumorId ??= `blue-feather:${story.nextDay}:${giver.id}:${friend.id}`;

        if (story.stage === "rumor") {
            const description = `${friend.name} heard that ${rival.name} had been mocking them after patrol. They started keeping their distance.`;
            Relationships.recordGrievance(friend, rival, "hurtful_rumor", rumorId, state.day);
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
        const motive = ClanQuirks.motives[giver.hiddenMotive] ?? ClanQuirks.motives.possessive_friend;
        const disclosure = `${witness.name} heard ${giver.name} admit to leaving the blue feather and making up the story about ${rival.name}. ${giver.name} explained why. ${motive.line}`;
        const choices = [
            { id: "confront", text: "Confront the gift-giver in front of the clan" },
            { id: "warn", text: `Tell ${friend.name} in private` },
            { id: "keep", text: "Keep the discovery to yourself" }
        ];
        if (witness === friend) choices[1].text = `Reassure ${rival.name} in private`;

        function resolve(choice) {
            if (state.giftStory !== story) return;
            ClanQuirks.rememberDiscovery(witness, giver, true);
            rememberEvent(witness, "uncovered_gift_giver", {
                description: disclosure, importance: 4, participants: [giver.id],
                privateOwnerId: witness.id
            });

            const exposed = choice.id === "confront";
            let outcome = `${witness.name} kept what they heard to themself.`;
            if (choice.id !== "keep" || witness === friend) {
                ClanQuirks.rememberDiscovery(friend, giver);
                const description = `${friend.name} learned that ${giver.name} spread a false rumor to come between them and ${rival.name}.`;
                Relationships.resolveGrievance(friend, rival, rumorId);
                Relationships.recordGrievance(friend, giver, "false_rumor", rumorId, state.day, {
                    strength: 2, privateOwnerId: exposed ? null : friend.id
                });
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
                    giver.quirkPublic = true;
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
            if (exposed) logEvent("story", outcome);
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

    function findWeatherStory(cats) {
        const spell = state.weather?.spell;
        if (!spell || spell.sceneResolved || spell.endsDay < state.day) return null;
        const actor = cats.find(cat => cat.id === state.playerCatId && cat.age >= 6) ??
            cats.find(cat => cat.rank === "Leader") ?? cats.find(cat => cat.age >= 6);
        if (!actor) return null;

        let title, description, options, npcChoice, recipient;
        if (spell.id === "thunderstorm") {
            title = "Thunder Over Camp";
            const approaching = spell.startsDay > state.day;
            const opening = approaching
                ? "Angry, dark clouds cover the sky above camp, threatening a downpour. Nearby, thunder can be heard."
                : "A peal of thunder cracks above the camp, reverberating through the dens and causing a clanmate to yelp in surprise. After a heartbeat, drops of rain begin to steadily come down.";
            const danger = state.disaster?.weatherStart === spell.startsDay
                ? "The river is quickly rising. There is enough time to evacuate the Clan or secure its supplies."
                : "The Clan has time to move to higher ground or secure its supplies.";
            description = `${opening} ${danger}`;
            options = [
                ["evacuate_storm", "Get the Clan to higher ground"],
                ["move_supplies", "Carry the prey and bedding above the flood line"]
            ];
            npcChoice = "evacuate_storm";
        } else if (spell.id === "rain") {
            title = "The Rising Bend";
            description = spell.startsDay > state.day
                ? "Rain clouds gather over Glassriver Bend. There is still time to carry the Clan's supplies above the flood line."
                : "Glassriver Bend is rising above its banks. The Clan can still carry its supplies above the flood line.";
            options = [["move_supplies", "Move the prey and bedding to higher ground"], ["wait", "Leave the supplies where they are"]];
            npcChoice = "move_supplies";
        } else if (spell.id === "frost") {
            title = spell.startsDay > state.day ? "Before the First Frost" : "The First Frost";
            description = "The air has turned crisp and cold. The Clan still has time to prepare, but must choose a task to prioritize.";
            options = [["gather", "Gather extra herbs"], ["hunt", "Bring in extra prey"], ["shelter", "Reinforce the nursery and dens"]];
            npcChoice = state.prey < expectedMeals() ? "hunt" : ClanHerbs.total(state.herbInventory) < 4 ? "gather" : "shelter";
        } else if (spell.startsDay > state.day) {
            return null;
        } else if (spell.id === "heat") {
            recipient = pick(cats.filter(cat => cat !== actor));
            if (!recipient) return null;
            title = "A Place in the Shade";
            const enemies = Relationships.enmityWith(recipient, actor);
            const rivals = Relationships.rivalriesWith(recipient, actor).length;
            const reaction = enemies ? "They give you a wary look." :
                rivals ? "They ask which of you spotted it first." : "They make room beside them.";
            description = `${actor.name} and ${recipient.name} reach the same patch of shade. ${reaction}`;
            options = [["share_shade", "Share the shade"], ["give_shade", `Give ${recipient.name} the spot`]];
            npcChoice = enemies ? "give_shade" : "share_shade";
        } else if (spell.id === "snow" && state.prey > 0 && state.prey < expectedMeals()) {
            recipient = cats.filter(cat => cat !== actor)
                .sort((a, b) => b.hunger - a.hunger || a.health - b.health)[0];
            if (!recipient) return null;
            title = "The Last Mouse";
            description = `Snow has covered the hunting trails. ${actor.name} finds a mouse in the nearly empty prey pile as ${recipient.name} comes looking for food.`;
            options = [["give_mouse", `Give the mouse to ${recipient.name}`], ["split_mouse", "Split the mouse"]];
            npcChoice = recipient.hunger >= actor.hunger ? "give_mouse" : "split_mouse";
        } else {
            return null;
        }

        return {
            participants: recipient ? { actor, recipient } : { actor },
            event: {
                id: `weather_${spell.id}`, title, description, decisionMaker: "actor", npcChoice,
                choices: options.map(([id, text]) => ({
                    id, text, effects: [{ type: "weather_choice", action: id, spellStart: spell.startsDay }]
                }))
            }
        };
    }

    function resolveWeatherChoice({ action, spellStart }, { actor, recipient }) {
        const spell = state.weather?.spell;
        if (spell?.startsDay !== spellStart || spell.sceneResolved) return;
        spell.sceneResolved = true;
        let outcome;
        switch (action) {
            case "evacuate_storm": {
                const flood = state.disaster;
                const pendingFlood = flood?.weatherStart === spell.startsDay && flood.day > state.day;
                if (pendingFlood) flood.warnClan = true;
                outcome = `${actor.name} led the clan to high ground to wait out the thunderstorm.`;
                break;
            }
            case "move_supplies":
                state.floodSuppliesSafeUntil = spell.endsDay + 2;
                actor.energy = Math.max(0, actor.energy - 5);
                outcome = `${actor.name} moved the prey and bedding above the flood line.`;
                break;
            case "gather": {
                const stock = state.herbInventory;
                const herb = [...ClanHerbs.medicinal].sort((a, b) => ClanHerbs.count(stock, a) - ClanHerbs.count(stock, b))[0];
                stock[herb.id] = ClanHerbs.count(stock, herb) + 2;
                outcome = `${actor.name} helped add 2 × ${herb.name} to the den before the frost.`;
                break;
            }
            case "hunt":
                state.prey += 3;
                outcome = `${actor.name} helped bring in three prey before the frost.`;
                break;
            case "shelter":
                state.nurseryShelterUntil = state.weather.seasonStart + ClanWeather.DAYS_PER_SEASON * 2 - 1;
                outcome = `${actor.name} helped reinforce the dens. Cats will have more warm, sheltered space during Leaf-bare snow.`;
                break;
            case "share_shade":
            case "give_shade": {
                const shared = action === "share_shade";
                recipient.energy = Math.min(100, recipient.energy + (shared ? 6 : 10));
                if (shared) actor.energy = Math.min(100, actor.energy + 6);
                setRelationship(actor, recipient, relationship(actor, recipient) + 3);
                outcome = shared
                    ? `${actor.name} and ${recipient.name} cooled down in the shade together.`
                    : `${actor.name} let ${recipient.name} rest in the shade.`;
                break;
            }
            case "give_mouse":
            case "split_mouse": {
                if (state.prey < 1) return "The prey pile was already empty.";
                const shared = action === "split_mouse";
                state.prey--;
                recipient.hunger = Math.max(0, recipient.hunger - (shared ? 22 : 45));
                if (shared) actor.hunger = Math.max(0, actor.hunger - 22);
                setRelationship(actor, recipient, relationship(actor, recipient) + 4);
                outcome = shared
                    ? `${actor.name} split the mouse with ${recipient.name}.`
                    : `${actor.name} gave ${recipient.name} the mouse.`;
                break;
            }
            default:
                outcome = `${actor.name} decided to leave the supplies in camp.`;
        }
        recordCatEvent(`weather_${spell.id}`, recipient ? [actor, recipient] : [actor], {
            description: outcome, importance: 3
        });
        return outcome;
    }

    const DEATHBERRY_DISCOVERY_COOLDOWN = 30;

    function showDeathberryDiscovery() {
        const pending = state.pendingDeathberryDiscovery;
        if (!pending) return false;
        const healer = getCat(pending.healerId);
        if (!healer || healer.rank !== "Medicine Cat" || healer.id !== state.playerCatId) {
            delete state.pendingDeathberryDiscovery;
            return false;
        }
        if (!$("questCard").hidden) return true;

        StoryEvents.showStoryEvent({
            id: "deathberry_discovery",
            title: "Red Berries Near Camp",
            description: `${healer.name} spots a bush flush with red berries near camp and recognizes it at once. This is a deathberry bush, named for the deadliness of its berries. It cannot be used to heal, but it might come in handy one day. Should ${healer.name} collect some for the den or leave them alone?`,
            decisionMaker: "healer",
            choices: [
                { id: "leave", text: "Leave the deathberries alone" },
                { id: "collect", text: "Collect a deathberry" }
            ]
        }, { healer }, choice => {
            if (state.pendingDeathberryDiscovery !== pending) return;
            delete state.pendingDeathberryDiscovery;
            const collected = choice.id === "collect";
            if (collected) healer.deathberryCache = (healer.deathberryCache ?? 0) + 1;
            const outcome = collected ? `${healer.name} tucked a deathberry into a hidden cache within their den.`
                : `${healer.name} decided to leave the deathberries alone.`;
            rememberEvent(healer, "deathberry_discovery", {
                description: outcome, importance: 3, privateOwnerId: healer.id
            });
            saveGame(false);
            render();
            showNotice(outcome);
        });
        return true;
    }

    function tryDeathberryDiscovery() {
        const healer = getCat(state.playerCatId);
        if (healer?.rank !== "Medicine Cat" || !canPatrol(healer) ||
            state.day - (state.lastDeathberryDiscoveryDay ?? -DEATHBERRY_DISCOVERY_COOLDOWN) < DEATHBERRY_DISCOVERY_COOLDOWN ||
            !chance(.04)) return false;
        state.lastDeathberryDiscoveryDay = state.day;
        state.pendingDeathberryDiscovery = { healerId: healer.id };
        StoryEvents.recordEvent({ id: "deathberry_discovery" });
        return showDeathberryDiscovery();
    }

    function autonomousDay() {
        if (showDeathberryDiscovery()) return;
        if (showVigil()) return;
        if (state.medicineDream && showMedicineDream()) return;
        if ($("questCard").hidden && DeathberryIncidents.showNightmare()) return;
        if (DeathberryIncidents.advance()) return;
        // Advance daily clock
        state.day++;
        if ((state.day - 1) % ClanWeather.DAYS_PER_SEASON === 0) {
            state.seasonIndex = (state.seasonIndex + 1) % SEASONS.length;
            logEvent("season", `${seasonName()} arrived.`);
        }
        ClanWeather.advance(state, seasonName(), rand, logEvent);
        scheduleWeatherFlood();
        scheduleHeatWildfire();
        ClanQuirks.daily();
        const disasterOutcome = resolveDisaster();
        const medicineDuty = runMedicineCatDay();
        CatConditions.advanceDay(livingCats(), state.day, logEvent, (cat, description) => {
            rememberEvent(cat, "healed_with_a_limp", { importance: 4, description });
        }, recordDeath, ClanWeather.exposureMultiplier(state));
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

        for (const c of cats) {
            const recovery = rand(8, 22);
            const restBonus = state.campRestDay === state.day ? 4 : 0;
            c.energy = clamp(c.energy + (griefAffectsRecovery(c) ? Math.floor(recovery / 2) : recovery) + restBonus, 0, 100);
            c.hunger = clamp(c.hunger + rand(10, 18), 0, 100);
        }

        const hungry = cats.filter(cat => cat.hunger > 35).sort((a, b) => b.hunger - a.hunger || a.health - b.health);
        const meals = hungry.slice(0, state.prey);
        state.prey -= meals.length;
        for (const cat of meals) cat.hunger = Math.max(0, cat.hunger - rand(20, 40));
        if (hungry.length > meals.length) {
            const unfed = hungry.length - meals.length;
            logEvent("clan", `${unfed} ${unfed === 1 ? "cat went" : "cats went"} without a meal.`);
            ClanSocial.startFoodDispute(hungry.slice(meals.length), meals);
        }

        cats.forEach(c => {
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
        ClanSocial.daily(new Set([...huntingPatrol, ...livingCats().filter(cat => medicineDuty.has(cat.id))]));
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
        const dreamActive = !giftStoryActive && (rollMedicineDream() ||
            ($("questCard").hidden && DeathberryIncidents.showNightmare()));

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

        const storyCats = livingCats().filter(cat => !cat.quarantined);
        const ordinaryStorySlot = !giftStoryActive && !dreamActive && window.StoryEvents?.canTriggerEvent();
        const imminentFlood = state.disaster?.weatherStart === state.weather?.spell?.startsDay &&
            state.disaster?.day === state.day + 1;
        const wildfireWarning = $("questCard").hidden && findWildfireWarning(storyCats);
        const weatherStory = wildfireWarning || ((ordinaryStorySlot || (imminentFlood && $("questCard").hidden)) &&
            findWeatherStory(storyCats));
        const discoveryActive = ordinaryStorySlot && !weatherStory && tryDeathberryDiscovery();
        const canRunStory = !discoveryActive && (ordinaryStorySlot || Boolean(weatherStory));
        const admirerEvent = canRunStory && ordinaryStorySlot && StoryEvents.events.find(event => event.id === "known_admirer");
        const admirerParticipants = admirerEvent
            ? StoryEvents.selectParticipants(admirerEvent, storyCats, state.playerCatId)
            : null;
        const priorityStory = canRunStory && (
            weatherStory ||
            StoryEvents.findMateConflict(storyCats) ||
            StoryEvents.findRescueThanks(storyCats) ||
            StoryEvents.findClanReconciliation(storyCats, state.playerCatId) ||
            (chance(.15) && StoryEvents.findMutualConfession(storyCats, state.playerCatId)) ||
            (admirerParticipants && { event: admirerEvent, participants: admirerParticipants }) ||
            ClanQuirks.findStory(storyCats) ||
            (chance(.20) && StoryEvents.findClanFight(storyCats, state.playerCatId)) ||
            (chance(.35) && StoryEvents.findClanArgument(storyCats, state.playerCatId))
        );

        if (canRunStory && (priorityStory || StoryEvents.shouldTriggerEvent())) {
            // Only select events whose global cooldown has expired.
            const availableEvents = StoryEvents.events.filter(
                event => !StoryEvents.isEventOnCooldown(event)
            );

            let storyEvent = priorityStory?.event || StoryEvents.getRandomEvent(
                availableEvents.filter(event => event.id !== "known_admirer")
            );

            if (storyEvent) {
                const rescue = storyEvent.id === "broken_ground";
                const candidates = rescue ? storyCats.filter(canPatrol) : storyCats;
                const participants = priorityStory?.participants || StoryEvents.selectParticipants(
                    storyEvent,
                    candidates,
                    state.playerCatId
                );

                if (participants) {
                    if (rescue) storyEvent = StoryEvents.buildBrokenGround(storyEvent, participants, candidates);
                    CatConditions.recordContact(Object.values(participants).filter(Boolean), "conversation", state.day);
                    // Record the event and start its global cooldown.
                    StoryEvents.recordEvent(storyEvent);

                    const playerInvolved = StoryEvents.involvesPlayer(
                        participants,
                        state.playerCatId
                    );

                    if (!storyEvent.private) {
                        logEvent("story", `${storyEvent.title}: ${storyEvent.description}`);
                    }

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

                                if (!storyEvent.private) logEvent("story", `${storyEvent.title} - ${outcome}`);

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
                        const selectedChoice = storyEvent.choices.find(choice => choice.id === storyEvent.npcChoice) ??
                            pick(storyEvent.choices);
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
        Relationships.refreshRivalries(livingCats(), clanHistoryCats());

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

        const player = playerCat();
        const canAppointDeputy = deputyCandidates(player).includes(c);
        const options = RANKS.filter(r =>
            (r !== "Deputy" || c.rank === "Deputy" || canAppointDeputy) &&
            !(c.age < 6 && r !== "Kit") &&
            !(c.age >= 6 && c.age < 12 && !["Apprentice", "Kit"].includes(r))
        );
        if (canChooseMedicineApprentice(player) && medicineApprenticeCandidates(true).includes(c)) {
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
        if (normalized === "Deputy" && c.rank !== "Deputy") {
            const message = appointDeputy(player, c);
            if (!message) return;
            saveGame(false);
            render();
            showNotice(message);
            return;
        }
        if (c.rank === "Medicine Cat" && normalized !== c.rank) delete c.reservedMedicineKitId;
        if (c.medicineTrack && (c.rank === "Apprentice" || normalized === "Apprentice")) {
            delete c.medicineTrack;
            delete c.mentorId;
        }
        c.rank = normalized;
        Relationships.refreshRivalries(livingCats(), clanHistoryCats());
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
            loaded.herbInventory = ClanHerbs.normalize(loaded.herbs ?? 3, loaded.herbInventory);
            delete loaded.herbs;
            loaded.medicineDream ??= null;
            loaded.disaster ??= null;
            loaded.nextDreamDay ??= loaded.day + 1;

            const legacyDeaths = loaded.cats.filter(cat => cat.alive === false).reverse();
            const archivedCats = [...(loaded.starClan ?? []), ...legacyDeaths];
            loaded.starClan = archivedCats.slice(0, STARCLAN_LIMIT);
            loaded.cats = loaded.cats.filter(cat => cat.alive !== false);
            const historyCats = [...loaded.cats, ...loaded.starClan];
            const legacyCache = loaded.herbInventory.deathberries;
            const healers = loaded.cats.filter(cat => cat.rank === "Medicine Cat");
            const cacheOwner = healers.find(cat => cat.id === loaded.playerCatId) ?? healers[0];
            if (legacyCache > 0 && cacheOwner) {
                cacheOwner.deathberryCache = (cacheOwner.deathberryCache ?? 0) + legacyCache;
                delete loaded.herbInventory.deathberries;
            }

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
            Relationships.migrateLegacyRivalries(historyCats, state.day);
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
        $("foodForecast").addEventListener("click", () => switchView("territory"));
        $("campRestBtn").addEventListener("click", toggleCampRest);
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
            const shortHuntButton = e.target.closest("[data-short-hunt]");
            if (shortHuntButton) {
                runShortHunt(shortHuntButton.dataset.shortHunt);
                return;
            }
            const medicineAction = e.target.closest("[data-medicine-action]");
            if (medicineAction) {
                handleMedicineAction(medicineAction.dataset.medicineAction, medicineAction.dataset.patient, medicineAction.dataset.condition);
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
    ClanQuirks.initialize({ getState: () => state, expectedMeals, rand, chance, relationship, rememberEvent, logEvent, startGiftStory });
    initializeSocialReactions();
    initializeGossip();
    ClanSocial.initialize({
        state: () => state, cats: livingCats, relationship, chance, rand, expectedMeals, skill: CatConditions.skill,
        remember: recordCatEvent, rememberEvent
    });
    DeathberryIncidents.initialize({
        state: () => state, cats: livingCats, getCat, clamp, pick, chance, relationship, setRelationship,
        areCloseRelatives, needsIsolation, apprentice: medicineApprentice, canTakeApprentice: canChooseMedicineApprentice,
        transferApprentice: assignMedicineApprentice, rememberEvent, recordDeath, log: logEvent,
        grievance: Relationships.recordGrievance, resolveGrievance: Relationships.resolveGrievance,
        afterDeath(patient) {
            resolveLeadershipVacancy();
            if (selectedCatId === patient.id) selectedCatId = state.playerCatId;
        },
        scene(title, description, actor, choices, resolve) {
            const returnView = selectedView;
            StoryEvents.showStoryEvent({ title, description, choices, decisionMaker: "actor" }, { actor }, choice => {
                switchView(returnView);
                const message = resolve(choice.id);
                saveGame(false);
                render();
                if (message) showNotice(message);
            });
        }
    });
    CatRenderer.initialize(COLORS);
    selectedCatId = state.playerCatId || livingCats()[0]?.id || null;

    bindEvents();
    render();
    if (!showDeathberryDiscovery()) {
        if (state.medicineDream) showMedicineDream();
        if (state.giftStory?.stage === "reveal" && state.giftStory.nextDay <= state.day) {
            advanceGiftStory();
        }
        if ($("questCard").hidden) DeathberryIncidents.showNightmare();
    }
})();
