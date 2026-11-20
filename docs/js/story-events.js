
/* Story Events */

window.StoryEvents = (() => {
    let game = null;

    function initialize(dependencies) {
        game = dependencies;
    }

    const FOOTPRINTS_RULES = {
        predatorChance: 0.35,
        warnedPredatorChance: 0.25,
        otherCatChance: 0.35,
        warningBonus: 0.15,
        poorTrackingThreshold: 4,
        predatorRiskBonus: 0.10,
        predatorRiskDays: 5
    };

    function resolveFootprintsEncounter(patrol, warned, predatorRisk = 0, forcedPredator = false) {
        if (!patrol.length) return { outcome: "No cats are available to investigate.", effects: [] };
        const pick = items => items[Math.floor(Math.random() * items.length)];
        const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const chance = probability => Math.random() < probability;
        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
        const effects = [];
        const averageSkill = skill => patrol.reduce((sum, cat) => sum + CatConditions.skill(cat, skill), 0) / patrol.length;
        const predatorChance = (warned ? FOOTPRINTS_RULES.warnedPredatorChance : FOOTPRINTS_RULES.predatorChance) + predatorRisk;
        const roll = Math.random();
        const warningBonus = warned ? FOOTPRINTS_RULES.warningBonus : 0;
        const names = patrol.map(cat => cat.name).join(", ");
        const preparation = warned ? "The patrol sends their swiftest cat to return to camp and warn the others. Once they come back, they brave the footprints together. " : "Following the tracks, ";
        let outcome;

        if (forcedPredator || roll < predatorChance) {
            const predator = pick(["fox", "badger", "dog"]);
            const success = chance(clamp(0.35 + averageSkill("fighting") * 0.05 + warningBonus, 0.05, 0.95));
            if (success) {
                outcome = `${preparation}${names} encounter a ${predator} and drive it away without anyone getting injured.`;
            } else {
                const injured = pick(patrol);
                const damage = rand(8, 20);
                effects.push({ type: "health", catId: injured.id, value: -damage });
                effects.push({
                    type: "injury",
                    catId: injured.id,
                    condition: damage >= 17 ? "brokenLeg" : "scrape",
                    chance: damage >= 17 ? .65 : .6
                });
                outcome = `${preparation}${names} encounter a ${predator}. ${injured.name} loses ${damage} health during the retreat.${injured.health > damage ? "" : ` ${injured.name} dies from their injuries.`}`;
            }
        } else if (roll < predatorChance + FOOTPRINTS_RULES.otherCatChance) {
            const stranger = pick(["loner", "kittypet", "rogue"]);
            const friendly = chance(clamp(0.40 + averageSkill("intuition") * 0.04 + warningBonus, 0.05, 0.95));
            outcome = `${preparation}${names} meet a ${stranger}. ${friendly ? "They have a calm conversation and part on friendly terms." : "They have a tense conversation that nearly ends in a fight."}`;
        } else {
            outcome = `${preparation}${names} find nothing and return to camp.`;
            if (!warned && averageSkill("hunting") < FOOTPRINTS_RULES.poorTrackingThreshold) {
                effects.push({
                    type: "predator_risk",
                    bonus: FOOTPRINTS_RULES.predatorRiskBonus,
                    days: FOOTPRINTS_RULES.predatorRiskDays
                });
                outcome += ` The patrol lost the trail. Predator encounters are more likely for the next ${FOOTPRINTS_RULES.predatorRiskDays} days.`;
            }
        }
        effects.push({ type: "memory", value: "tracks_encounter", importance: 3, description: outcome });
        return { outcome, effects };
    }

    // How likely a story event is to occur on a
    // day when the game checks for one.
    const EVENT_CHANCE = .2;

    // Minimum number of days between story events
    const STORY_EVENT_BUFFER = 2;

    // Minimum number of days before same event can happen again globally
    const EVENT_COOLDOWNS = {
        moonlit_confession: 20,
        unexpected_feelings: 30,
        strange_footprints: 8,
        jealous_words: 5,
        abandoned_kit: 30,
        broken_ground: 10,
        last_goodbye: 30
    }

    const events = [

        // -------------------------------------
        // MYSTERY
        // -------------------------------------

        {
            // wouldnt it be tea if first choice had the potential of triggering a fight with a predator or talking to a loner etc
            id: "strange_footprints",
            title: "Strange Footprints",
            category: "mystery",
            participantType: "footprints_patrol",
            decisionMaker: "patrol1",
            description:
                "A patrol discovers unfamiliar pawprints pressed into the mud near the territory border.",

            choices: [
                {
                    id: "follow_tracks",
                    text: "Follow the tracks",
                    effects: [
                        { type: "footprints_encounter", warned: false }
                    ]
                },
                {
                    id: "warn_clan",
                    text: "Warn the clan, then investigate prepared",
                    effects: [
                        { type: "footprints_encounter", warned: true }
                    ]
                }
            ]
        },

        // -------------------------------------
        // ROMANCE
        // -------------------------------------

        {
            id: "moonlit_confession",
            title: "A Moonlit Confession",
            category: "romance",
            description:
                "Under the moonlight, one cat quietly admits that their feelings for another clanmate have become difficult to ignore.",

            requiresCats: 2,
            participantType: "confession_pair",
            pairOnce: true,

            dialogue: {
                start: {
                    speaker: "confessor",
                    decisionMaker: "confessor",
                    text: "{confessor} asks {target} to meet them at moonhigh. As they sit together, {target} can tell something is on {confessor}'s mind. After a heartbeat, {confessor} finally makes a decision.",
                    // TODO: add personality text
                    personalityText: {
                        bold:
                            "{confessor} arrives with their tail high, buzzing with a nervous excitement that even {target} can feel from a tail-length away. Without any more pretense, {confessor} speaks.",
                        gentle:
                            "",
                        curious:
                            "",
                        patient:
                            "",
                        helpful:
                            "{confessor} arrives with prey, admitting they thought {target} might be hungry. After sharing a few bites, {confessor} raises their head and gazes intently at {target} -- like they have something on their mind.",
                        wary:
                            "{target} notices that {confessor} looks especially nervous tonight, shuffling their paws and glancing around furtively like they're worried they're being watched. {confessor} seems like they might lose their nerve at any moment.",
                        playful:
                            "{confessor} bumps their shoulder against {target}'s as they settle in close beside them. Their tailtip taps an easygoing rhythm against the ground, but there's a spark of uneasy in {confessor}'s face.",
                        proud:
                            "{confessor} sits primly before {target}, tail coiled tightly over their forepaws.",
                        observant:
                            "",
                        stubborn:
                            "",
                        loyal:
                            "",
                        ambitious:
                            ""
                    },

                    choices: [
                        {
                            text: "Confess.",
                            next: "confession"
                        },
                        {
                            text: "Keep your feelings hidden.",
                            next: "secret"
                        }
                    ]
                },

                confession: {
                    speaker: "confessor",
                    decisionMaker: "target",
                    text: "\"I've wanted to tell you for a long time... I have feelings for you.\"",
                    // TODO: add personality text
                    personalityText: {
                        bold:
                            "{confessor} purrs. \"{target}, I love you.\"",
                        gentle:
                            "{confessor}'s ears flush, then quietly: \"I really enjoy spending time with you, {target}.\"",
                        curious:
                            "",
                        patient:
                            "",
                        helpful:
                            "",
                        wary:
                            "\"I feel safe with you, {target}, in a way I've never felt with any other cat,\" {confessor} admits, the words rushing from their mouth before their courage can falter. Ears red, {confessor} looks away. \"And...I like you. I *love* you, i think.\"\n",
                        playful:
                            "",
                        proud:
                            "\"You're alright, {target},\" {confessor} admits with a sniff. It takes {target} a heartbeat to realize that this is a confession. \"And I think we make a good pair. What do you think?\"",
                        observant:
                            "",
                        stubborn:
                            "",
                        loyal:
                            "",
                        ambitious:
                            ""
                    },
                    choices: [
                        {
                            text: "I feel the same way.",
                            next: "accept"
                        },
                        {
                            text: "I'm sorry, but I don't feel the same way.",
                            next: "reject"
                        }
                    ]
                },

                accept: {
                    speaker: "target",
                    text: "{target} bumps their forehead against {confessor}'s cheek. \"I've been *waiting* for you to say that.\"",
                    // TODO: add personality text
                    effects: [
                        { type: "relationship", value: 20 },
                        {
                            type: "memory",
                            value: "mutual_confession",
                            importance: 5
                        },
                        {
                            type: "become_mates",
                            from: "confessor",
                            to: "target"
                        }
                    ]
                },

                reject: {
                    speaker: "target",
                    text: "\"I'm sorry, {confessor}. I don't feel the same way.\"",
                    // TODO: add personality text
                    personalityText: {
                        bold:
                            "{target} frowns. \"I like you better as a friend. Sorry.\"",
                        gentle:
                            "\"I... don't feel the same way. I'm sorry.\" {target} brushes their shoulder against {confessor}'s as a comforting gesture. \"But I appreciate the courage it took to tell me this. I hope we can stay friends.\"",
                        curious:
                            "",
                        patient:
                            "",
                        helpful:
                            "",
                        wary:
                            "{target} hesitates, a small frown forming on their face. The rejection there comes a beat before they finally muster the courage to verbalize it: \"I'm sorry, {confessor}. I just-- we can't be together. I'm sorry.\"",
                        playful:
                            "{target} laughs. When {confessor} doesn't start laughing along with them, {target}'s face falls. \"Oh, you're serious?!\" Embarrassment flushes their ears red. \"Sorry, {confessor}, but ... I just like us better as friends.\"",
                        proud:
                            "{target} scoffs. \"You? And me? No way. Not even in your dreams.\"",
                        observant:
                            "{target} winces. \"Ah, I thought you'd say that...\"",
                        stubborn:
                            "",
                        loyal:
                            "\"I don't feel the same way,\" {target} admits. \"But I'll always be by your side no matter what.\"",
                        ambitious:
                            "\"I'm sorry, I can't be with you. There's just way too many logistics involved.\""
                    },
                    effects: [
                        { type: "relationship", value: -10 },
                        {
                            type: "memory",
                            value: "rejected_confession",
                            importance: 4
                        }
                    ]
                },

                secret: {
                    speaker: "confessor",
                    text: "{confessor} looks away and flattens their ears. \"Actually, maybe we can talk about it another time...\"",
                    // TODO: add personality text
                    effects: [
                        {
                            type: "memory",
                            value: "hidden_feelings",
                            importance: 2
                        }
                    ]
                }
            }
        },

        // -------------------------------------
        // DRAMA
        // -------------------------------------

        {
            id: "jealous_words",
            title: "Words That Sting",
            category: "drama",
            description:
                "A cat overhears two clanmates laughing together and becomes convinced they are being deliberately excluded.",
            requiresCats: 2,
            participants: ["jealous_cat", "clanmate"],
            decisionMaker: "jealous_cat",
            pairCooldown: 10,

            choices: [
                {
                    id: "confront",
                    text: "Confront the clanmates",
                    outcome:
                        "{jealous_cat} sets their jaw and storms over to confront the two cats. Their laughter falls away as {jealous_cat}'s shadow passes over their loafing silhouettes. When {jealous_cat} confronts them, {clanmate} becomes defensive and accuses {jealous_cat} of eavesdropping. The conversation quickly devolves into an argument, further straining the relationship between {jealous_cat} and {clanmate}.",
                    effects: [
                        { type: "relationship", value: "negative" },
                        { type: "memory", value: "hurtful_argument", importance: 3}
                    ]
                },
                {
                    id: "talk_privately",
                    text: "Talk privately with another clanmate",
                    outcome:
                        "After a heartbeat, {jealous_cat} flattens their ears and turns away from their laughing clanmates, determined not to let their hurt feelings turn into explosive impulsivity. Later, they meet with {confidant} to talk about what happened. {confidant} offers reassurance and a new perspective on the situation, soothing {jealous_cat} to some degree.",
                    effects: [
                        { type: "relationship", value: "positive" },
                        { type: "memory", value: "supportive_conversation", importance: 2}
                    ]
                }
            ]
        },

        // -------------------------------------
        // CLAN LIFE
        // -------------------------------------

        {
            id: "abandoned_kit",
            title: "A Cry in the Bracken",
            category: "clan_life",
            participants: ["patrol"],
            decisionMaker: "patrol",
            participantRequirements: { patrol: { minAge: 6 } },
            description:
                "A patrol hears a tiny cry from a patch of bracken. Inside lies a frightened kit, alone and shivering.",

            choices: [
                {
                    id: "bring_kit_home",
                    text: "Bring the kit to camp",
                    outcome:
                        "After a brief discussion over what to do next, {patrol} picks the kit up and brings them back to camp.",
                    effects: [
                        { type: "special_event", value: "rescue_kit" },
                        { type: "clan_log", text: "A patrol found a kit alone in the bracken." },
                        { type: "memory", value: "rescued_kit", importance: 4}
                    ]
                },
                {
                    id: "search_area",
                    text: "Search for the kit's family",
                    outcome:
                        "The patrol searches the surrounding area for a sign of the kit's mother. When they return to the bracken, the kit is gone.",
                    effects: [
                        { type: "special_event", value: "search_for_family" }
                    ]
                }
            ]
        },

        // -------------------------------------
        // DANGER
        // -------------------------------------

        {
            id: "broken_ground",
            title: "The Broken Ground",
            category: "danger",
            description:
                "During a patrol, the ground gives way beneath a clanmate near a steep, crumbling slope. Their claws scrape desperately at the dirt.",

            requiresCats: 2,
            participants: ["rescuer", "victim"],
            decisionMaker: "rescuer",
            participantRequirements: {
                rescuer: { minAge: 12 },
                victim: { minAge: 6 }
            },
            pairCooldown: 30,

            choices: [
                {
                    id: "risk_rescue",
                    text: "Rush forward to rescue them",
                    outcome:
                        "{rescuer} lunges forward, trying to catch {victim} before the loose earth gives way.",
                    effects: [
                        {
                            type: "danger_check",
                            injuryChance: 0.65,
                            deathChance: 0.10
                        }
                    ]
                },
                {
                    id: "find_another_way",
                    text: "Find a safer way down",
                    outcome:
                        "The patrol scrambles around the slope. The rescue takes longer, and every passing moment feels unbearable. Eventually they make their way down to {victim}.",
                    effects: [
                        {
                            type: "danger_check",
                            injuryChance: 0.25,
                            deathChance: 0.03
                        }
                    ]
                }
            ]
        },

        // -------------------------------------
        // LOSS AND CONSEQUENCES
        // -------------------------------------

        {
            id: "last_goodbye",
            title: "A Final Goodbye",
            category: "emotional",
            description:
                "An aging clanmate asks someone they trust to sit beside them. They have something important left to say.",

            requiresCats: 2,
            participants: ["elder", "confidant"],
            decisionMaker: "confidant",
            participantRequirements: { elder: { ranks: ["Elder"] } },

            choices: [
                {
                    id: "stay_close",
                    text: "Stay and listen",
                    outcome:
                        "The two cats share a quiet moment together. The words exchanged will be remembered long after this day.",
                    effects: [
                        { type: "relationship", value: "positive" },
                        { type: "memory", value: "final_goodbye" }
                    ]
                },
                {
                    id: "give_space",
                    text: "Give them some quiet",
                    outcome:
                        "The cat respects their clanmate's wish for solitude, though they wonder afterward whether they should have stayed.",
                    effects: [
                        { type: "memory", value: "missed_goodbye" }
                    ]
                }
            ]
        }

    ];

    // Crush event
    events.push({
        id: "known_admirer",
        title: "A Conversation About Feelings",
        description: "After learning who has feelings for them, a cat asks their admirer for a private conversation.",
        category: "romance",
        participantType: "known_admirer_pair",
        requiresCats: 2,
        pairOnce: true,
        dialogue: {
            start: {
                speaker: "target",
                decisionMaker: "target",
                text: "{target} meets with {confessor} in a private corner of camp. \"So, I heard you have a crush on me?\"",
                choices: [
                    { text: "Because I would like to get to know you better, too.", next: "accept" },
                    { text: "I care about you, but I don't feel that way.", next: "reject" }
                ]
            },
            accept: {
                speaker: "target",
                text: "{target} and {confessor} agree to spend more time together and see how their feelings develop.",
                effects: [
                    { type: "relationship", value: 10 },
                    { type: "refresh_crush", from: "confessor", to: "target" },
                    { type: "memory", value: "admirer_conversation", importance: 3 }
                ]
            },
            reject: {
                speaker: "target",
                text: "{target} gently explains that they don't feel the same way. {confessor} listens, disappointed but grateful for an honest conversation.",
                // TODO: personality text
                effects: [
                    { type: "relationship", value: -15 },
                    { type: "clear_crush", from: "confessor", to: "target" },
                    { type: "memory", value: "rejected_confession", importance: 4 }
                ]
            }
        }
    });

    events.push({
        id: "unexpected_feelings",
        title: "Unexpected Feelings",
        description: "A cat with a mate finds themselves thinking about another clanmate.",
        category: "romance",
        participantType: "outside_crush_pair",
        pairCooldown: 60,
        dialogue: {
            start: {
                speaker: "admirer",
                decisionMaker: "admirer",
                text: "After sharing prey with {interest}, {admirer} catches themselves hoping they can do it again tomorrow. The thought catches them off guard. When did it start feeling like more than friendship?",
                choices: [
                    { text: "Privately acknowledge the crush", next: "acknowledge" },
                    { text: "Ask to see them in secret", next: "private_offer", requiresReciprocalCrush: true },
                    { text: "Let the feeling pass", next: "move_on" }
                ]
            },
            private_offer: {
                speaker: "admirer",
                decisionMaker: "interest",
                text: "“I want to spend more time with you,” {admirer} tells {interest}. “Could we keep this between us?”",
                choices: [
                    { text: "Agree to see each other in secret", next: "private_accept" },
                    { text: "Turn down the offer", next: "acknowledge" }
                ]
            },
            private_accept: {
                speaker: "interest",
                text: "{admirer} and {interest} agree to meet in secret.",
                effects: [
                    { type: "add_crush", from: "admirer", to: "interest" },
                    { type: "secret_relationship" },
                    { type: "memory", value: "secret_relationship", importance: 4 }
                ]
            },
            acknowledge: {
                speaker: "admirer",
                text: "{admirer} admits to themselves that they have feelings for {interest} and keeps it private.",
                effects: [
                    { type: "add_crush", from: "admirer", to: "interest" },
                    { type: "memory", value: "outside_crush", importance: 3 }
                ]
            },
            move_on: {
                speaker: "admirer",
                text: "{admirer} decides to let the feeling pass."
            }
        }
    });

    const MATE_CONFLICT = {
        id: "mate_conflict",
        title: "Between Mates",
        description: "Two mates have a difficult conversation about their future together.",
        pairCooldown: 14
    };

    function findMateConflict(cats) {
        const living = new Map(cats.map(cat => [cat.id, cat]));
        let strained = null;
        for (const challenger of cats) {
            for (const mateId of challenger.relationships.mates) {
                const partner = living.get(mateId);
                if (!partner?.relationships.mates.includes(challenger.id) ||
                    !canPairExperienceEvent(MATE_CONFLICT, challenger, partner)) continue;

                const evidence = challenger.relationships.mateConcerns?.[mateId]?.pending;
                if (evidence) {
                    return buildMateConflict(challenger, partner, evidence, living.get(evidence.targetId)?.name);
                }
                const bond = game.relationship(challenger, partner);
                if (bond <= 10 && (!strained || bond < strained.bond)) {
                    strained = { challenger, partner, bond };
                }
            }
        }
        return strained ? buildMateConflict(strained.challenger, strained.partner) : null;
    }

    function buildMateConflict(challenger, partner, evidence, interestName) {
        const dialogue = {};
        const strongEvidence = evidence?.type === "relationship";
        const interest = interestName || "another cat";
        const subject = strongEvidence
            ? `you've been seeing ${interest} in secret`
            : `you have feelings for ${interest}`;

        const decision = (speaker, decisionMaker, text, phase, choices, response) => ({
            speaker, decisionMaker, text, choices, conflict: { phase, strongEvidence, response }
        });
        const choice = (text, next) => ({ text, next });

        function addResolution(response, text) {
            const stay = `${response}_stay`;
            const leave = `${response}_leave`;
            dialogue[response] = decision("challenger", "challenger", text, "stay", [
                choice("Ask to work things out", `${response}_ask`),
                choice("End the relationship", leave)
            ], response);
            dialogue[`${response}_ask`] = decision("challenger", "partner",
                "“I'd like to try to fix this,” {challenger} says. “Do you still want us to be mates?”",
                "stay", [choice("Try to stay together", stay), choice("End the relationship", leave)], response);

            const believed = response === "believed";
            const caught = response === "doubted";
            const admitted = response === "admitted";
            const effect = {
                type: "resolve_mate_conflict",
                trust: believed ? 3 : caught ? -18 : admitted ? (strongEvidence ? -10 : -4) : 6,
                suspicion: believed ? 0 : caught ? 3 : 0,
                endOutsideTie: admitted || caught,
                interestId: evidence?.targetId
            };
            dialogue[stay] = {
                speaker: "partner",
                text: admitted || caught
                    ? "{challenger} and {partner} decide to stay together. {partner} agrees to end the outside involvement."
                    : "{challenger} and {partner} decide to stay together and give each other another chance.",
                effects: [{ ...effect, bond: caught ? -5 : admitted ? 2 : 10 }]
            };
            dialogue[leave] = {
                text: "{challenger} and {partner} part ways. They are no longer mates.",
                effects: [{ ...effect, bond: -12, separate: true }]
            };
        }

        if (evidence) {
            dialogue.start = decision("challenger", "partner",
                `“I heard ${subject},” {challenger} says to {partner}. “I want to hear the truth from you.”`,
                "lie", [choice("Tell the truth", "admitted"), choice("Deny it", "denial")]);
            dialogue.denial = decision("partner", "challenger",
                "“There's nothing between us,” {partner} says. “You can believe me.”",
                "believe", [choice("Believe the denial", "believed"), choice("Question the denial", "doubted")]);
            addResolution("admitted", "“What you heard was true,” {partner} says after a long pause. “I'm sorry I kept it from you.”");
            addResolution("believed", "{challenger} accepts {partner}'s explanation. They still need to decide what they want from each other.");
            addResolution("doubted", "{challenger} finds the denial hard to believe. “If we're going to stay together, I need you to take this seriously.”");
        } else {
            addResolution("start", "“We barely speak anymore,” {challenger} tells {partner}. “Do you think there's anything left between us to save?”");
        }
        return { event: { ...MATE_CONFLICT, dialogue }, participants: { challenger, partner } };
    }

    function chooseMateConflictChoice(node, participants, choices) {
        const { challenger, partner } = participants;
        const { phase, strongEvidence, response } = node.conflict;
        const cat = participants[node.decisionMaker];
        const mate = cat === challenger ? partner : challenger;
        const concern = game.mateConcern(cat, mate);
        const trust = concern.trust ?? cat.trust ?? 50;
        const suspicion = concern.suspicion;
        const bond = game.relationship(cat, mate);
        const loyalty = { loyal: 22, patient: 15, gentle: 12, helpful: 10, wary: -12, proud: -10, ambitious: -7 };
        const evasiveness = { proud: 25, wary: 20, ambitious: 17, stubborn: 12, bold: -10, gentle: -13, loyal: -22 };
        const skepticism = { wary: -20, observant: -15, stubborn: -10, patient: 8, gentle: 10, loyal: 8 };
        let score;
        if (phase === "lie") {
            const partnerSuspicion = game.mateConcern(challenger, partner).suspicion;
            score = 38 + (evasiveness[cat.personality] ?? 0) + bond * 0.12 +
                (50 - trust) * 0.2 - partnerSuspicion * 4 - (strongEvidence ? 18 : 0);
        } else if (phase === "believe") {
            score = 53 + (skepticism[cat.personality] ?? 0) + (trust - 50) * 0.65 +
                bond * 0.3 - suspicion * 12 - (strongEvidence ? 23 : 0);
        } else {
            const hurt = cat === challenger
                ? (response === "doubted" ? 26 : response === "admitted" ? (strongEvidence ? 19 : 10) : 0)
                : 0;
            score = 47 + (loyalty[cat.personality] ?? 0) + (trust - 50) * 0.35 + bond * 0.65 -
                (response === "believed" && cat === challenger ? 0 : suspicion * 5) - hurt;
        }
        const chance = Math.max(2, Math.min(98, score));
        const succeeds = Math.random() * 100 < chance;
        return choices[phase === "lie" ? Number(succeeds) : Number(!succeeds)];
    }

    // Get or initialize persistent story history
    function getStoryHistory() {
        const state = game?.getState();

        if (!state) {
            console.error("StoryEvents: Game state is unavailable.");
            return null;
        }

        if (!state.storyHistory) {
            state.storyHistory = {
                lastEventDay: -1,
                eventCooldowns: {},
                pairEvents: {}
            };
        }

        return state.storyHistory;
    }

    // debug
    function getCurrentDay() {
        return game?.getState()?.day;
    }

    // Generate a consistent ID for a pair of cats
    // CatA + CatB = CatB + CatA
    function getPairEventKey(eventId, catA, catB) {
        const ids = [catA.id, catB.id].sort();

        return `${eventId}_${ids[0]}_${ids[1]}`;
    }

    function canPairExperienceEvent(event, catA, catB) {
        if (!event || !catA || !catB) return false;

        const state = game?.getState();
        const history = getStoryHistory();

        if (!state || !history) return false;

        const key = getPairEventKey(event.id, catA, catB);
        const previous = history.pairEvents[key];

        if (previous === undefined) return true;

        if (event.pairOnce) return false;

        if (event.pairCooldown) {
            const lastDay = typeof previous === "object"
                ? previous.day
                : previous;

            return state.day - lastDay >= event.pairCooldown;
        }

        return true;
    }

    // helper for non-confession events
    function areParticipantsEligible(event, participants) {
        if (!event.pairOnce && !event.pairCooldown) {
            return true;
        }

        const cats = Array.isArray(participants)
            ? participants
            : Object.values(participants || {});

        for (let i = 0; i < cats.length; i++) {
            for (let j = i + 1; j < cats.length; j++) {
                if (!canPairExperienceEvent(event, cats[i], cats[j])) {
                    return false;
                }
            }
        }

        return true;
    }

    // Record pair history for every combination
    // of participants in an event
    function recordEventParticipants(event, participants) {
        if (!event || !participants) return;

        // Only track events that explicitly request pair history.
        if (!event.pairOnce && !event.pairCooldown) return;

        const cats = Array.isArray(participants)
            ? participants
            : Object.values(participants);

        const uniqueCats = cats.filter((cat, index) =>
            cat &&
            cats.findIndex(other => other?.id === cat.id) === index
        );

        // Record every unique pair.
        for (let i = 0; i < uniqueCats.length; i++) {
            for (let j = i + 1; j < uniqueCats.length; j++) {
                recordPairEvent(
                    event.id,
                    uniqueCats[i],
                    uniqueCats[j]
                );
            }
        }
    }

    function canTriggerEvent() {
        const state = game?.getState();
        const history = getStoryHistory();

        if (!state || !history) return false;

        return (
            state.day - history.lastEventDay >= STORY_EVENT_BUFFER
        );
    }

    // Check individual event cooldowns
    function isEventOnCooldown(event) {
        const state = game?.getState();
        const history = getStoryHistory();

        if (!history) {
            return false;
        }

        const lastDay = history.eventCooldowns[event.id];

        if (lastDay === undefined) {
            return false;
        }

        const cooldown = EVENT_COOLDOWNS[event.id] || 0;

        return state.day - lastDay < cooldown;
    }

    // Record that an event has started
    function recordEvent(event) {
        const state = game?.getState();
        const history = getStoryHistory();

        if (!history) {
            return;
        }

        history.lastEventDay = state.day;
        history.eventCooldowns[event.id] = state.day;
    }

    // Record an interaction between two cats
    function recordPairEvent(eventId, catA, catB) {
        const state = game?.getState();
        const history = getStoryHistory();

        if (!history || !catA || !catB) return;

        const key = getPairEventKey(eventId, catA, catB);

        history.pairEvents[key] = {
            day: state.day
        };
    }

    // Roll for an event on a day when the game
    // decides to check for one
    function shouldTriggerEvent() {
        return Math.random() < EVENT_CHANCE;
    }

    // Return a random event, optionally excluding
    // events that cannot currently happen
    function getRandomEvent(availableEvents = events) {
        if (availableEvents.length === 0) {
            return null;
        }

        const index = Math.floor(
            Math.random() * availableEvents.length
        );

        return availableEvents[index];
    }

    // Select living cats to participate in an event
    function selectParticipants(event, cats, playerCatId) {
        const living = cats.filter(cat => cat && cat.alive !== false);

        const shuffle = array => {
            const shuffled = [...array];

            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }

            return shuffled
        }

        if (event.participantType === "footprints_patrol") {
            const patrol = shuffle(living.filter(cat => cat.age >= 6 && cat.health > 20 && cat.energy > 15)).slice(0, 3);
            return patrol.length ? Object.fromEntries(patrol.map((cat, index) => [`patrol${index + 1}`, cat])) : null;
        }

        if (event.participantType === "outside_crush_pair") {
            const candidates = living.flatMap(admirer => {
                if (admirer.age < 12) return [];
                if (!living.some(cat => admirer.relationships?.mates?.includes(cat.id))) return [];

                return living.filter(interest =>
                    interest.age >= 12 &&
                    game.canStartCrush(admirer, interest) &&
                    (admirer.relationships[interest.id] ?? 0) >= 25 &&
                    (interest.sex === "male" ? admirer.attractionToMales : admirer.attractionToFemales) > 0 &&
                    canPairExperienceEvent(event, admirer, interest)
                ).map(interest => ({ admirer, interest }));
            });
            return shuffle(candidates)[0] || null;
        }

        if (event.participantType === "known_admirer_pair") {
            const candidates = living.flatMap(target => {
                if (target.age < 12) return [];
                const rumors = target.relationships?.knownGossip || [];
                return living.filter(confessor =>
                    confessor.id !== target.id && confessor.age >= 12 &&
                    confessor.relationships?.crushes?.includes(target.id) &&
                    rumors.some(rumor => rumor.type === "crush" &&
                        rumor.subjectId === confessor.id && rumor.targetId === target.id) &&
                    canPairExperienceEvent(event, confessor, target)
                ).map(confessor => ({ confessor, target }));
            });
            return shuffle(candidates)[0] || null;
        }

        // Select a pair where one cat has a crush on the other
        if (event.participantType == "confession_pair") {
            const candidates = living.flatMap(confessor => {
                // Cats who already have mates cannot confess
                if (
                    confessor.age < 12 ||
                    !Array.isArray(confessor.relationships?.crushes) ||
                    confessor.relationships?.mates?.length > 0
                ) {
                    return [];
                }

                return confessor.relationships.crushes
                    .map(targetId => living.find(cat => cat.id === targetId))
                    .filter(target =>
                        target &&
                        target.id !== confessor.id &&
                        target.age >= 12 &&
                        !(target.relationships?.mates?.length > 0) &&

                        // Prevent repeated confessions between this pair.
                        canPairExperienceEvent(
                            event,
                            confessor,
                            target
                        )
                    )
                    .map(target => ({ confessor, target }));
            });

            if (candidates.length === 0) {
                return null;
            }

            return shuffle(candidates)[0];
        }

        // Select cats and assign explicit participant roles
        const roles = event.participants;
        const required = event.requiresCats || roles?.length || 1;

        if (living.length < required) {
            return null;
        }

        const candidates = shuffle(living);
        const selected = [];

        // Try eligible assignments so a cat needed for one role is not
        // accidentally used in another, and pair cooldowns remain respected.
        function assignParticipant(index) {
            if (index === required) {
                return areParticipantsEligible(event, selected);
            }

            const requirements = event.participantRequirements?.[roles?.[index]] || {};

            for (const cat of candidates) {
                if (selected.includes(cat)) continue;
                if (requirements.minAge !== undefined && cat.age < requirements.minAge) continue;
                if (requirements.ranks && !requirements.ranks.includes(cat.rank)) continue;

                selected.push(cat);
                if (assignParticipant(index + 1)) return true;
                selected.pop();
            }

            return false;
        }

        if (!assignParticipant(0)) return null;

        // If the event defines roles, return an object keyed by role
        if (Array.isArray(roles)) {
            return Object.fromEntries(
                roles.map((role, index) => [role, selected[index]])
            );
        }

        // Otherwise, keep the existing array format
        return selected;

    }

    // Determine whether player is involved in an event
    function involvesPlayer(participants, playerCatId) {
        const cats = Array.isArray(participants)
            ? participants
            : Object.values(participants || {});

        return cats.some(cat => cat && cat.id === playerCatId);
    }

    function hasPersonality(cat, ...personalities) {
        return Boolean(
            cat &&
            personalities.includes(cat.personality)
        );
    }

    // Determines npc dialogue choices
    function chooseNpcDialogueChoice(node, participants) {
        if (!node || !node.choices?.length) return null;
        if (node.conflict) return chooseMateConflictChoice(node, participants, node.choices);

        const decisionMaker = participants[node.decisionMaker];

        if (!decisionMaker) return node.choices[0];

        // The confessor decides whether to confess
        if (node.decisionMaker === "confessor") {
            const confessor = participants.confessor;

            let chance = 0.8;

            if (hasPersonality(confessor, "bold")) {
                chance += 0.15;
            }

            if (hasPersonality(confessor, "wary")) {
                chance -= 0.3;
            }

            if (hasPersonality(confessor, "stubborn")) {
                chance += 0.1;
            }

            const shouldConfess = Math.random() < chance;

            const destination = shouldConfess
                ? "confession"
                : "secret";

            return node.choices.find(
                choice => choice.next === destination
            );
        }

        // The target decides whether to return the feelings
        if (node.decisionMaker === "target") {
            const confessor = participants.confessor;

            const reciprocates = Array.isArray(
                decisionMaker.relationships?.crushes
            ) && decisionMaker.relationships.crushes.includes(
                confessor?.id
            );

            const destination = reciprocates ? "accept" : "reject";

            return node.choices.find(
                choice => choice.next === destination
            );
        }

        // Fallback for other NPC dialogue
        return node.choices[
            Math.floor(Math.random() * node.choices.length)
        ];
    }

    function availableChoices(node, participants) {
        return (node.choices || []).filter(choice =>
            !choice.requiresReciprocalCrush ||
            participants.interest.relationships.crushes.includes(participants.admirer.id)
        );
    }

    function getParticipant(participants, name) {
        if (Array.isArray(participants)) {
            const roles = {
                confessor: 0,
                target: 1,
                rescuer: 0,
                victim: 1,
                jealous_cat: 0,
                clanmate: 1
            };

            const index = roles[name] ?? Number(name);

            return participants[index] || null;
        }

        return participants?.[name] || null;
    }

    // add dialogue variation depending on speaker's personality
    function getDialogueText(node, participants) {
        const isString = typeof node === "string";

        const speaker = isString
            ? null
            : getParticipant(participants, node.speaker);

        let text = isString ? node : node.text || "";

        if (!isString && speaker && node.personalityText) {
            const variation = node.personalityText[speaker.personality];

            if (Array.isArray(variation)) {
                const index = Math.floor(Math.random() * variation.length);
                text = variation[index] || text;
            } else if (variation) {
                text = variation;
            }
        }

        return text.replace(/\{(\w+)\}/g, (match, name) => {
            return getParticipant(participants, name)?.name || match;
        });
    }

    function showClanmateConversation(player, clanmate, onChoice) {
        showStoryEvent({
            title: "Time with a Clanmate",
            dialogue: {
                start: {
                    speaker: "clanmate",
                    decisionMaker: "player",
                    text: "“Hey, {player}. Want to sit with me for a while? It’s quieter over here.”",
                    personalityText: {
                        playful: [
                            "“Come sit with me, {player}. I have a story you have to hear.”",
                            "“{player}, settle a debate. How many mice could you carry at once?”",
                            "“I saved you the sunny spot. Your turn to tell a story.”"
                        ],
                        wary: "“Got a moment, {player}? I’d rather talk somewhere quiet.”"
                    },
                    choices: [
                        { text: "Stay and chat", next: "stay" },
                        { text: "Maybe later", next: "leave" }
                    ]
                },
                stay: {
                    speaker: "clanmate",
                    text: "{player} and {clanmate} settle in a quiet corner of camp and trade stories.",
                    spendTime: true
                },
                leave: {
                    speaker: "clanmate",
                    text: "“Another time, then.” {clanmate} flicks their tail in farewell."
                }
            }
        }, { player, clanmate }, onChoice);
    }

    function resolveChoiceParticipants(event, choice, participants) {
        if (event.id !== "jealous_words" || choice.id !== "talk_privately") {
            return { choice, participants };
        }

        const { jealous_cat, clanmate } = participants;
        const { relationship, relationshipLabel } = window.Relationships;
        const friends = [];
        const neutral = [];
        for (const cat of game.getState().cats) {
            if (!cat || cat.alive === false || cat.quarantined || cat.id === jealous_cat.id || cat.id === clanmate.id) continue;
            if (!canPairExperienceEvent(event, jealous_cat, cat)) continue;

            const label = relationshipLabel(relationship(jealous_cat, cat));
            if (label === "friendly" || label === "close bond") friends.push(cat);
            if (label === "neutral") neutral.push(cat);
        }

        const pool = friends.length ? friends : neutral;
        if (pool.length) {
            const confidant = pool[Math.floor(Math.random() * pool.length)];
            return { choice, participants: { jealous_cat, confidant } };
        }

        return {
            choice: {
                ...choice,
                outcome: "{jealous_cat} keeps their thoughts to themselves for now.",
                effects: []
            },
            participants: { jealous_cat }
        };
    }

    function showStoryEvent(event, participants, onChoice) {
        const slot = game.eventSlot;
        if (!slot.hidden) return;

        const panel = document.createElement("div");
        panel.className = event.dialogue
            ? "story-event-panel story-dialogue"
            : "story-event-panel story-event";
        const previousFocus = document.activeElement;

        function clearEvent() {
            if (slot.hidden) return;
            slot.hidden = true;
            panel.remove();
            game.setEventActive(false);
            const focusTarget = previousFocus !== document.body && previousFocus?.getClientRects().length
                ? previousFocus
                : document.querySelector(".tabs .active");
            focusTarget?.focus();
        }

        function completeEvent(result, displayedText) {
            clearEvent();
            const resolved = resolveChoiceParticipants(event, result, participants);
            const { choice, participants: choiceParticipants } = resolved;
            recordEventParticipants(event, choiceParticipants);
            onChoice({
                ...choice,
                outcome: choice.outcome || (displayedText ?? getDialogueText(choice, choiceParticipants))
            }, choiceParticipants);
        }

        function showPanel(text, speaker) {
            panel.replaceChildren();

            if (speaker && game?.renderPortrait) {
                const portrait = document.createElement("canvas");
                portrait.className = "story-dialogue-portrait";
                portrait.setAttribute("aria-hidden", "true");
                panel.appendChild(portrait);
                game.renderPortrait(portrait, speaker);
            }

            const card = document.createElement("div");
            card.className = "story-event-card";

            const nameplate = document.createElement("h2");
            nameplate.id = "storyEventSpeaker";
            nameplate.textContent = speaker?.name || event.title;
            nameplate.tabIndex = -1;
            nameplate.setAttribute("aria-describedby", "storyEventText");

            const description = document.createElement("p");
            description.id = "storyEventText";
            description.textContent = text;

            card.append(nameplate, description);
            panel.appendChild(card);

            const actions = document.createElement("div");
            actions.className = "story-event-actions";
            panel.appendChild(actions);
            return actions;
        }

        function addChoice(actions, label, onClick) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.addEventListener("click", onClick);
            actions.appendChild(button);
        }

        function playerMakesDecision(role) {
            const cat = getParticipant(participants, role);
            return Boolean(cat && cat.id === game.getState().playerCatId);
        }

        function showNode(nodeId) {
            const node = event.dialogue[nodeId];

            if (!node) {
                console.error("Missing dialogue node:", nodeId);
                clearEvent();
                return;
            }

            const dialogueText = getDialogueText(node, participants);
            const actions = showPanel(dialogueText, getParticipant(participants, node.speaker));
            const choices = availableChoices(node, participants);

            function advance(choice) {
                if (choice.next) {
                    showNode(choice.next);
                } else {
                    completeEvent(choice);
                }
            }

            // helper to decide if npc confesses or not
            function shouldNpcConfess(confessor, target) {
                const score = window.NPC.evaluateDecision(
                    confessor,
                    target,
                    {
                        type: "social",
                        relationshipWeight: 0.3
                    }
                );

                return score >= 50;
            }

            function chooseNpcChoice() {
                if (node.conflict) return chooseMateConflictChoice(node, participants, choices);

                // The confessor decides whether to confess
                if (
                    event.participantType === "confession_pair" &&
                    nodeId === "start"
                ) {
                    const confessor = participants.confessor;
                    const target = participants.target;

                    const willConfess = shouldNpcConfess(confessor, target);

                    return choices.find(
                        choice => choice.next === (
                            willConfess ? "confession" : "secret"
                        )
                    );
                }

                // The recipient decides whether to accept or reject
                if (
                    (event.participantType === "confession_pair" && nodeId === "confession" ||
                        event.participantType === "known_admirer_pair" && nodeId === "start")
                ) {
                    const confessor = participants.confessor;
                    const target = participants.target;

                    const targetHasCrush = Boolean(
                        target?.relationships?.crushes?.includes(confessor?.id)
                    );

                    const desiredNext = targetHasCrush ? "accept" : "reject";

                    return choices.find(
                        choice => choice.next === desiredNext
                    );
                }
                // Otherwise, let the NPC randomly choose
                return choices[
                    Math.floor(Math.random() * choices.length)
                ];
            }

            if (!choices.length) {
                addChoice(actions, "Continue", () => completeEvent(node, dialogueText));
            } else if (playerMakesDecision(node.decisionMaker)) {
                choices.forEach(choice => {
                    addChoice(actions, choice.text, () => advance(choice));
                });
            } else {
                addChoice(actions, "Next", () => advance(chooseNpcChoice() || choices[0]));
            }

            if (!slot.hidden) {
                panel.querySelector("h2").focus();
            }
        }

        if (event.dialogue) {
            showNode("start");
        } else {
            const actions = showPanel(event.description);
            if (playerMakesDecision(event.decisionMaker)) {
                event.choices.forEach(choice => {
                    addChoice(actions, choice.text, () => completeEvent(choice));
                });
            } else {
                addChoice(actions, "Continue", () => {
                    const choice = event.choices[Math.floor(Math.random() * event.choices.length)];
                    completeEvent(choice);
                });
            }
        }

        if (panel.childElementCount) {
            slot.appendChild(panel);
            slot.hidden = false;
            game.setEventActive(true);
            panel.querySelector("h2").focus({ preventScroll: true });
            slot.scrollIntoView({ block: "nearest" });
        }
    }

    function runNpcDialogue(event, participants, onComplete) {
        if (!event.dialogue || !participants) return;

        const dialogueLines = [];
        let nodeId = "start";
        let attempts = 0;

        while (attempts < 20) {
            attempts++;

            const node = event.dialogue[nodeId];

            if (!node) {
                console.error("Missing NPC dialogue node:", nodeId);
                return;
            }

            // Add this dialogue line to the event's conversation.
            const text = getDialogueText(node, participants);

            if (text) {
                const speaker = participants[node.speaker];

                dialogueLines.push(
                    speaker ? `${text}` : text
                );
            }

            // We've reached the ending. Apply its effects and finish.
            const choices = availableChoices(node, participants);
            if (!choices.length) {
                recordEventParticipants(event, participants);

                onComplete({
                    ...node,
                    outcome: dialogueLines.join(" ")
                });

                return;
            }

            // Choose the next dialogue branch.
            const choice = chooseNpcDialogueChoice({ ...node, choices }, participants);

            if (!choice) {
                console.error("NPC could not choose a dialogue option:", nodeId);
                return;
            }

            // Move to the next dialogue node.
            if (!choice.next) {
                recordEventParticipants(event, participants);

                onComplete({
                    ...choice,
                    outcome: dialogueLines.join(" ")
                });

                return;
            }

            nodeId = choice.next;
        }

        console.error("NPC dialogue exceeded maximum steps.");
    }

    // Expose the event library without placing
    // variables in the global namespace
    return {
        initialize,
        resolveFootprintsEncounter,
        events,
        getStoryHistory,
        formatText: getDialogueText,
        shouldTriggerEvent,
        getRandomEvent,
        selectParticipants,
        resolveChoiceParticipants,
        involvesPlayer,
        showStoryEvent,
        showClanmateConversation,
        findMateConflict,
        runNpcDialogue,

        // Cooldown and history helpers
        getCurrentDay,
        canTriggerEvent,
        isEventOnCooldown,
        recordEvent,
        canPairExperienceEvent,
        areParticipantsEligible,
        recordEventParticipants,
        recordPairEvent
    };

})();
