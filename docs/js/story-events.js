
/* Story Events */

window.StoryEvents = (() => {
    let game = null;

    function initialize(dependencies) {
        game = dependencies;
    }

    function buildPatrolConflict(actor, other, enmity) {
        if (enmity) {
            return {
                id: "patrol_trust",
                pairCooldown: 5,
                title: "Giving credit",
                description: `Back in camp, ${other.name} tells the patrol leader that ${actor.name} spotted the trail no one else noticed. ${other.name} could easily have claimed the credit.`,
                decisionMaker: "actor",
                choices: [
                    { id: "accept", text: "Give them a chance", outcome: `${actor.name} thanked ${other.name} for giving them credit. It was a start.` },
                    { id: "doubt", text: "Keep your distance", outcome: `${actor.name} let ${other.name} finish speaking and kept their distance.` }
                ]
            };
        }
        return {
            id: "patrol_rivalry",
            pairCooldown: 5,
            title: "Keeping score",
            description: `On the way back to camp, ${actor.name} wonders whether ${other.name} noticed how often they tried to find prey first.`,
            decisionMaker: "actor",
            choices: [
                { id: "rematch", text: "Challenge them to a rematch", outcome: `${actor.name} challenged ${other.name} to see who could catch the most prey on their next hunt.` },
                { id: "concede", text: "Give them credit and drop the contest", outcome: `${actor.name} praised ${other.name}'s tracking and let the contest go for now.` },
                { id: "accuse", text: "Accuse them of spoiling the hunt", outcome: `${actor.name} blamed ${other.name} for messing up the hunt. ${other.name} took the accusation personally.` }
            ]
        };
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
        const predatorChance = (warned ? FOOTPRINTS_RULES.warnedPredatorChance : FOOTPRINTS_RULES.predatorChance) + predatorRisk;
        const roll = Math.random();
        const warningBonus = warned ? FOOTPRINTS_RULES.warningBonus : 0;
        const names = patrol.map(cat => cat.name).join(", ");
        const preparation = warned ? "The patrol sends their swiftest cat to return to camp and warn the others. Once they come back, they brave the footprints together. " : "Following the tracks, ";
        let outcome;
        let successful = false;

        if (forcedPredator || roll < predatorChance) {
            const predator = pick(["fox", "badger", "dog"]);
            const fighter = ClanPatrols.role(patrol, "fighting");
            const success = chance(clamp(0.35 + fighter.score * 0.05 + warningBonus, 0.05, 0.95));
            if (success) {
                successful = true;
                outcome = `${preparation}${names} encounter a ${predator}. ${fighter.lead.name} leads the patrol in driving it away without injury.`;
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
            const intuition = ClanPatrols.role(patrol, "intuition");
            const friendly = chance(clamp(0.40 + intuition.score * 0.04 + warningBonus, 0.05, 0.95));
            successful = friendly;
            outcome = `${preparation}${names} meet a ${stranger}. ${friendly ? "They have a calm conversation and part on friendly terms." : "They have a tense conversation that nearly ends in a fight."}`;
        } else {
            outcome = `${preparation}${names} find nothing and return to camp.`;
            if (!warned && ClanPatrols.role(patrol, "hunting").score < FOOTPRINTS_RULES.poorTrackingThreshold) {
                effects.push({
                    type: "predator_risk",
                    bonus: FOOTPRINTS_RULES.predatorRiskBonus,
                    days: FOOTPRINTS_RULES.predatorRiskDays
                });
                outcome += ` The patrol lost the trail. Predator encounters are more likely for the next ${FOOTPRINTS_RULES.predatorRiskDays} days.`;
            }
        }
        effects.push({ type: "memory", value: "tracks_encounter", importance: 3, description: outcome });
        return { outcome, effects, successful };
    }

    // How likely a story event is to occur on a
    // day when the game checks for one
    const EVENT_CHANCE = .2;

    // Minimum number of days between story events
    const STORY_EVENT_BUFFER = 2;

    // Minimum number of days before same event can happen again globally
    const EVENT_COOLDOWNS = {
        moonlit_confession: 10,
        unexpected_feelings: 30,
        strange_footprints: 8,
        jealous_words: 5,
        abandoned_kit: 30,
        broken_ground: 10,
        last_goodbye: 30,
        clan_argument: 5,
        clan_reconciliation: 3,
        clan_fight: 8
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
            pairCooldown: 30,

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
                        { type: "memory", value: "hurtful_argument", importance: 3 }
                    ]
                },
                {
                    id: "talk_privately",
                    text: "Talk privately with another clanmate",
                    outcome:
                        "After a heartbeat, {jealous_cat} flattens their ears and turns away from their laughing clanmates, determined not to let their hurt feelings turn into explosive impulsivity. Later, they meet with {confidant} to talk about what happened. {confidant} offers reassurance and a new perspective on the situation, soothing {jealous_cat} to some degree.",
                    effects: [
                        { type: "relationship", value: "positive" },
                        { type: "memory", value: "supportive_conversation", importance: 2 }
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
                        { type: "memory", value: "rescued_kit", importance: 4 }
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
                "The ground suddenly gives way with a rumble. Most of the patrol manages to scrabble out of the way, but one clanmate is barely hanging on, their claws clinging desperately to the rock.",

            requiresCats: 2,
            participants: ["rescuer", "victim"],
            decisionMaker: "rescuer",
            participantRequirements: {
                rescuer: { minAge: 12 },
                victim: { minAge: 6 }
            },
            pairCooldown: 30
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
                    { type: "refresh_crush", from: "target", to: "confessor" },
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

    const CLAN_ARGUMENT = {
        id: "clan_argument",
        title: "Sharp Words",
        description: "A disagreement breaks out in camp.",
        pairCooldown: 12
    };
    const CLAN_RECONCILIATION = {
        id: "clan_reconciliation",
        title: "A Quiet Apology",
        description: "Two clanmates have a chance to talk about their argument.",
        pairCooldown: 1
    };
    const CLAN_FIGHT = {
        id: "clan_fight",
        title: "A Fight in Camp",
        description: "A quarrel in camp turns physical.",
        pairCooldown: 18
    };
    const FIGHT_INSTIGATORS = new Set(["bold", "curious", "proud", "stubborn", "ambitious"]);
    const FIGHT_GRIEVANCES = {
        hurtful_rumor: "the rumor that {other} had mocked them",
        false_rumor: "a false rumor they blamed on {other}",
        unfair_accusation: "{other}'s accusation that they had spoiled a hunt",
        fresh_kill_dispute: "{other} calling them out over how fresh-kill was shared",
        unfair_medicine_den_accusation: "{other}'s public accusation about a death in the medicine den",
        betrayal_of_care: "what they'd learned about {other}'s treatment of a patient",
        public_insult: "{other} insulting them in front of their clanmates"
    };

    function fightOpening(instigator, other, playerCatId) {
        const grievance = window.Relationships.enmityWith(instigator, other)?.grievances?.reduce((chosen, entry) =>
            !chosen || entry.strength > chosen.strength || (entry.strength === chosen.strength && entry.day >= chosen.day)
                ? entry : chosen, null);
        const reason = grievance && FIGHT_GRIEVANCES[grievance.cause]?.replaceAll("{other}", other.name);
        const reasonText = reason ? `${instigator.name} was still angry about ${reason}.` : "";
        const privateReason = reasonText && grievance.privateOwnerId
            ? { ownerId: grievance.privateOwnerId, text: reasonText } : null;
        const context = privateReason || (grievance && !reasonText)
            ? `${instigator.name} was still holding a grudge against ${other.name}.`
            : reasonText || `${instigator.name}'s hostility toward ${other.name} boiled over.`;
        const action = `${instigator.name} sprang at ${other.name} by the fresh-kill pile.`;
        const publicOpening = `${context} ${action}`;
        return {
            publicOpening,
            privateReason,
            sceneOpening: privateReason?.ownerId === playerCatId ? `${reasonText} ${action}` : publicOpening
        };
    }

    function findClanFight(cats, playerCatId) {
        if (isEventOnCooldown(CLAN_FIGHT)) return null;
        const canInstigate = (cat, other) => FIGHT_INSTIGATORS.has(cat.personality) &&
            (window.Relationships.enmityWith(cat, other) || game.relationship(cat, other) <= -85);

        return selectClanConflict(cats, playerCatId, (first, second) => {
            if (!canPairExperienceEvent(CLAN_FIGHT, first, second)) return null;
            const firstCanInstigate = canInstigate(first, second);
            const secondCanInstigate = canInstigate(second, first);
            if (!firstCanInstigate && !secondCanInstigate) return null;

            const [instigator, other] = firstCanInstigate && (!secondCanInstigate || Math.random() < .5)
                ? [first, second] : [second, first];
            const { publicOpening, privateReason, sceneOpening } = fightOpening(instigator, other, playerCatId);
            return {
                participants: { instigator, other },
                event: {
                    ...CLAN_FIGHT,
                    dialogue: {
                        start: {
                            speaker: "instigator",
                            text: `${sceneOpening} The two cats wrestled in the dirt as the rest of camp scattered.`,
                            effects: [{ type: "clan_fight", publicOpening, privateReason }]
                        }
                    }
                }
            };
        });
    }

    const RECONCILIATION_TEMPERAMENT = {
        gentle: 3, patient: 3, loyal: 2, helpful: 2, observant: 1, playful: 1,
        curious: 1, bold: 0, ambitious: -1, wary: -1, proud: -2, stubborn: -2
    };

    function reconciliationTemperament(cat) {
        return RECONCILIATION_TEMPERAMENT[cat.personality] ?? 0;
    }

    function selectClanConflict(cats, playerCatId, describePair) {
        const available = cats.filter(cat => cat.alive && cat.age >= 6 && !cat.quarantined);
        const candidates = [];
        for (const [index, first] of available.entries()) {
            for (const second of available.slice(index + 1)) {
                const scene = describePair(first, second);
                if (scene) candidates.push(scene);
            }
        }
        const playable = candidates.filter(scene => involvesPlayer(scene.participants, playerCatId));
        const pool = playable.length && Math.random() < .75 ? playable : candidates;
        return pool[Math.floor(Math.random() * pool.length)] ?? null;
    }

    function findClanArgument(cats, playerCatId) {
        if (isEventOnCooldown(CLAN_ARGUMENT)) return null;
        return selectClanConflict(cats, playerCatId, (first, second) => {
            if (!canPairExperienceEvent(CLAN_ARGUMENT, first, second)) return null;
            const firstBond = game.relationship(first, second);
            const secondBond = game.relationship(second, first);
            const mutualEnemies = window.Relationships.enmityWith(first, second) &&
                window.Relationships.enmityWith(second, first);
            const mutualRivals = window.Relationships.rivalriesWith(first, second).length &&
                window.Relationships.rivalriesWith(second, first).length;
            if (!mutualEnemies && !mutualRivals && Math.min(firstBond, secondBond) > -60) return null;

            const [instigator, other] = firstBond < secondBond ||
                (firstBond === secondBond && Math.random() < .5) ? [first, second] : [second, first];
            const opening = mutualEnemies
                ? '"I was handling this just fine, {other}. Why do you always have to interfere?"'
                : mutualRivals
                    ? '"Funny how you always have something to say when I get praised, {other}."'
                    : '"I asked for a little space, {other}. Do you ever listen?"';
            const responder = instigator.id === playerCatId ? "instigator" : "other";
            const opponent = responder === "instigator" ? "other" : "instigator";
            const reconcileLine = responder === "instigator"
                ? '"... Sorry. That came out harsher than I meant."'
                : '"I am listening! No need to raise your voice."';
            const finish = (text, value, effect) => ({
                text,
                effects: [
                    { type: "relationship", value },
                    { type: "memory", value: "clan_argument", importance: 3, description: text },
                    ...(effect ? [effect] : [])
                ]
            });
            const incidentId = getPairEventKey(CLAN_ARGUMENT.id, first, second) + "_" + getCurrentDay();
            return {
                participants: { instigator, other },
                event: {
                    ...CLAN_ARGUMENT,
                    dialogue: {
                        start: {
                            speaker: "instigator",
                            decisionMaker: responder,
                            clanConflict: "argument",
                            text: opening,
                            choices: [
                                { text: "Lower the temperature", next: "calm" },
                                { text: "Walk away", next: "leave" },
                                { text: responder === "instigator" ? "Press the accusation" : "Snap back", next: "escalate" }
                            ]
                        },
                        calm: finish(`{${responder}} lowered their voice. ${reconcileLine} The two cats agreed to give each other some room.`, 2),
                        leave: finish(`{${responder}} walked away mid-argument. Neither cat felt heard.`, -2),
                        escalate: finish(`{${responder}} said {${opponent}} only cared about themself. The words carried across camp.`, -8, {
                            type: "argument_grievance", from: opponent, to: responder, incidentId
                        })
                    }
                }
            };
        });
    }

    function findClanReconciliation(cats, playerCatId) {
        if (isEventOnCooldown(CLAN_RECONCILIATION)) return null;
        return selectClanConflict(cats, playerCatId, (first, second) => {
            const argumentDay = lastPairEventDay(CLAN_ARGUMENT.id, first, second);
            const lastAttempt = lastPairEventDay(CLAN_RECONCILIATION.id, first, second);
            const daysSince = getCurrentDay() - argumentDay;
            if (!Number.isFinite(argumentDay) || daysSince < 2 || daysSince > 10 || lastAttempt >= argumentDay) return null;

            const firstTemperament = reconciliationTemperament(first);
            const secondTemperament = reconciliationTemperament(second);
            if (Math.max(firstTemperament, secondTemperament) < 2 || firstTemperament + secondTemperament < 2) return null;
            const [peacemaker, clanmate] = firstTemperament >= secondTemperament ? [first, second] : [second, first];
            const incidentId = getPairEventKey(CLAN_ARGUMENT.id, first, second) + "_" + argumentDay;
            return {
                participants: { peacemaker, clanmate },
                event: {
                    ...CLAN_RECONCILIATION,
                    dialogue: {
                        start: {
                            speaker: "peacemaker",
                            decisionMaker: "peacemaker",
                            clanConflict: "offer",
                            text: "{peacemaker} finds {clanmate} alone by the edge of camp. It's a quiet moment to bring up what happened.",
                            choices: [
                                { text: "Bring up the argument", next: "apology" },
                                { text: "Give them more space", next: "leave" }
                            ]
                        },
                        apology: {
                            speaker: "peacemaker",
                            decisionMaker: "clanmate",
                            clanConflict: "accept",
                            text: '"I keep thinking about the way we left things, {clanmate}. I could have handled it better. Could we talk?"',
                            choices: [
                                { text: "Hear them out", next: "reconcile" },
                                { text: "Say you still need time", next: "refuse" }
                            ]
                        },
                        reconcile: {
                            text: "{peacemaker} listens while {clanmate} explains what hurt. They agree to speak up sooner next time.",
                            effects: [
                                { type: "relationship", value: 7 },
                                { type: "argument_truce", incidentId },
                                { type: "memory", value: "clan_reconciliation", importance: 4 }
                            ]
                        },
                        leave: { text: "{peacemaker} decides to leave {clanmate} alone for now." },
                        refuse: {
                            text: "{clanmate} says they need more time. {peacemaker} respects that and gives them space.",
                            effects: [{ type: "memory", value: "clan_reconciliation_deferred", importance: 2 }]
                        }
                    }
                }
            };
        });
    }

    function buildBrokenGround(event, { rescuer, victim }, candidates) {
        const rain = ["rain", "thunderstorm"].includes(ClanWeather.active(game.getState()));
        const slipping = game.chance(rain ? .65 : .35);
        const climbing = CatConditions.skill(rescuer, "climbing");
        const agility = CatConditions.skill(rescuer, "agility");
        const runner = ClanPatrols.role(candidates.filter(cat => cat !== rescuer && cat !== victim), "stamina")?.lead;
        const footing = slipping
            ? `${victim.name} is losing their grip.`
            : `${victim.name} has found a ledge wide enough to brace against.`;
        const skillClue = Math.max(climbing, agility) >= 5
            ? `${rescuer.name} is steady on steep ground.`
            : `${rescuer.name} has little practice on steep ground.`;
        const options = [
            ["reach", "Reach them now"],
            ["scout", "Find a safer way down"]
        ];
        if (runner) options.push(["help", `Send ${runner.name} for help`]);
        const npcChoice = slipping && Math.max(climbing, agility) >= 5 ? "reach" :
            runner && !slipping && CatConditions.skill(runner, "stamina") >= 5 ? "help" : "scout";
        return {
            ...event,
            description: `${event.description} ${footing} ${skillClue}${rain ? " Rain is washing soil away from the slope. Another collapse could take both cats." : ""}`,
            npcChoice,
            choices: options.map(([id, text]) => ({
                id, text, effects: [{ type: "broken_ground_rescue", method: id, rain, slipping, runnerId: runner?.id }]
            }))
        };
    }

    function resolveBrokenGround({ method, rain, slipping, runnerId }, { rescuer, victim }) {
        if (!rescuer.alive || !victim.alive) return;
        const { getCat, chance, clamp, rand, logEvent, rememberEvent, recordCatEvent, tryDevelopCrush, resolveRescueDeaths, relationship } = game;
        const reach = method === "reach";
        const runner = method === "help" ? getCat(runnerId) : null;
        const climb = Math.max(CatConditions.skill(rescuer, "climbing"), CatConditions.skill(rescuer, "agility"));
        const scout = CatConditions.skill(rescuer, "agility");
        const footingRisk = slipping ? .08 : .015;
        const rainRisk = rain ? .025 : 0;
        const deathRisk = reach ? .07 + rainRisk - climb * .007 :
            footingRisk + rainRisk - (runner ? CatConditions.skill(runner, "stamina") : scout) * .004;
        const parts = [reach ? `${rescuer.name} reached over the edge for ${victim.name}.` :
            runner ? `${runner.name} ran to camp for help while ${rescuer.name} stayed with ${victim.name}` :
                `${rescuer.name} searched for a way down to ${victim.name} without risking the crumbling edge.`];
        if (runner) {
            runner.energy = Math.max(0, runner.energy - 12);
            parts.push("The patrol gave up the hunt to focus on the rescue.");
        }

        if (rain && chance(reach ? .01 : .005)) {
            resolveRescueDeaths([victim, rescuer], cat => `${cat.name} died when the rain-soaked slope collapsed.`);
            return [...parts, `The rain-soaked slope collapsed, killing both ${rescuer.name} and ${victim.name}.`].join(" ");
        }

        if (reach && chance(clamp(.45 + rainRisk - climb * .035, .05, .65))) {
            rescuer.health = Math.max(1, rescuer.health - rand(5, 12));
            CatConditions.add(rescuer, "scrape", getCurrentDay(), logEvent);
            parts.push(`${rescuer.name} earned a scrape across their pawpad when the earth shifted underneath them.`);
        }
        if (chance(clamp(deathRisk, .01, .15))) {
            const loss = `${victim.name} lost their grip and fell. ${rescuer.name} scrambled down to the bottom of the ridge as fast as their paws would carry them, but they found ${victim.name} laying motionless, their body broken by the fall.`;
            resolveRescueDeaths([victim], () => loss, rescuer);
            rememberEvent(rescuer, "broken_ground_loss", { description: loss, participants: [victim.id], importance: 5 });

            return [...parts, loss].join(" ");
        }

        const fractureChance = (reach ? .34 - climb * .024 : (slipping ? .55 : .12) - scout * .008) +
            (rain ? .12 : 0) - (runner ? CatConditions.skill(runner, "stamina") * .012 : 0);
        const fracture = chance(clamp(fractureChance, .05, .70));
        if (fracture) {
            victim.health = Math.max(1, victim.health - rand(12, 22));
            CatConditions.add(victim, "brokenLeg", getCurrentDay(), logEvent);
            victim.brokenGroundReturn = true;
            parts.push(`${victim.name} returned to camp with a broken leg.`);
        } else {
            parts.push(`${rescuer.name} brought ${victim.name} back safely.`);
            victim.rescueThanks = { rescuerId: rescuer.id, earliestDay: getCurrentDay() + 1 };
        }
        const victimHeldGrudge = Relationships.enmityWith(victim, rescuer);
        const wereEnemies = victimHeldGrudge || Relationships.enmityWith(rescuer, victim);
        if (Relationships.rivalriesWith(victim, rescuer).length && chance(.12)) {
            Relationships.clearRivalries(victim, rescuer);
            parts.push(`After the rescue, ${victim.name} let go of their rivalry with ${rescuer.name}.`);
        }
        if (victimHeldGrudge && chance(.05)) {
            Relationships.clearEnmity(victim, rescuer);
            parts.push(`After the rescue, ${victim.name} no longer saw ${rescuer.name} as an enemy.`);
        }
        const outcome = parts.join(" ");
        recordCatEvent("broken_ground_rescue", [rescuer, victim], { description: outcome, importance: 4 });
        if (!Relationships.enmityWith(victim, rescuer) && !Relationships.enmityWith(rescuer, victim)) {
            Relationships.setRelationship(victim, rescuer, relationship(victim, rescuer) + 4, relationship(rescuer, victim) + 4);
            tryDevelopCrush(victim, rescuer, 2);
        }
        return outcome;
    }

    function findRescueThanks(cats) {
        for (const victim of cats) {
            const pending = victim.rescueThanks;
            if (!pending || pending.earliestDay > getCurrentDay()) continue;
            const rescuer = game.getCat(pending.rescuerId);
            if (!rescuer) {
                delete victim.rescueThanks;
                continue;
            }
            if (!cats.includes(rescuer)) continue;
            const enemies = Relationships.enmityWith(victim, rescuer) || Relationships.enmityWith(rescuer, victim);
            const rivals = Relationships.rivalriesWith(victim, rescuer).length || Relationships.rivalriesWith(rescuer, victim).length;
            const line = enemies ? "I remember what you did for me. I'm still angry about what happened before." :
                rivals ? "You were steady up there. I would have slipped without you so thank you for that." :
                    game.relationship(victim, rescuer) >= 60 ? "I was so scared but hearing your voice helped me hold on." :
                        "I never got to thank you for coming after me so... thank you. I wouldn't be here if not for you.";
            return {
                participants: { victim, rescuer },
                event: {
                    id: "broken_ground_thanks", title: "After the Fall", decisionMaker: "victim", npcChoice: "thank",
                    description: `${victim.name} finds ${rescuer.name} alone near the camp entrance.`,
                    choices: [
                        { id: "thank", text: "Tell them what the rescue meant", description: `${victim.name} told ${rescuer.name}, “${line}”` },
                        { id: "quiet", text: "Leave it unspoken for now", description: `${victim.name} sat beside ${rescuer.name} for a while. Neither brought up the fall.` }
                    ].map(choice => ({ ...choice, effects: [{ type: "broken_ground_thanks", description: choice.description }] }))
                }
            };
        }
        return null;
    }

    function readyAfterFall(cat) {
        return cat.brokenGroundReturn && !cat.conditions?.some(condition => condition.id === "brokenLeg");
    }

    function resolveRescueThanks({ description }, { victim, rescuer }) {
        delete victim.rescueThanks;
        game.recordCatEvent("broken_ground_thanks", [victim, rescuer], { description, importance: 3 });
        return description;
    }

    function rememberReturnPatrol(cat, location) {
        delete cat.brokenGroundReturn;
        const description = `${cat.name} went back out on patrol after the fall, taking the route to ${location.name}.`;
        game.rememberEvent(cat, "broken_ground_return", { description, importance: 3 });
        game.logEvent("patrol", description);
    }

    function showRecoveredPatrolChoice(cat) {
        if (!game.eventSlot.hidden) return false;
        const limp = cat.permanentEffects?.includes("limp");
        showStoryEvent({
            title: "The First Patrol Back",
            description: limp ? `${cat.name}'s leg has healed with a limp. Windcut Ridge is steep, and Pinewood Trail offers gentler ground.` :
                `${cat.name}'s leg has healed. They can face Windcut Ridge again or ease back in on Pinewood Trail.`,
            decisionMaker: "cat",
            choices: [
                { id: "ridge", text: "Try Windcut Ridge again" },
                { id: "pinewood", text: "Take the gentler Pinewood Trail" }
            ]
        }, { cat }, choice => game.runPatrol(choice.id, true));
        return true;
    }

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
        const trust = window.Relationships.trustToward(cat, mate);
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

    // Loadbearing current day function
    function getCurrentDay() {
        return game?.getState()?.day;
    }

    // Generate a consistent ID for a pair of cats
    // CatA + CatB = CatB + CatA
    function getPairEventKey(eventId, catA, catB) {
        const ids = [catA.id, catB.id].sort();

        return `${eventId}_${ids[0]}_${ids[1]}`;
    }

    function lastPairEventDay(eventId, catA, catB) {
        const previous = getStoryHistory()?.pairEvents[getPairEventKey(eventId, catA, catB)];
        return typeof previous === "object" ? previous?.day : previous;
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

            if (state.day - lastDay < event.pairCooldown) return false;
            if (event.id !== "moonlit_confession") return true;
            const mutual = hasRomanticFeelings(catA, catB) && hasRomanticFeelings(catB, catA);
            const bond = Math.min(game.relationship(catA, catB), game.relationship(catB, catA));
            if (previous.mutual == null) {
                return (mutual && mutualCrushSince(catA, catB) > lastDay) || bond >= 65;
            }
            return (mutual && !previous.mutual) || bond >= previous.bond + 10;
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
        if (eventId === "moonlit_confession") {
            history.pairEvents[key].mutual = hasRomanticFeelings(catA, catB) && hasRomanticFeelings(catB, catA);
            history.pairEvents[key].bond = Math.min(game.relationship(catA, catB), game.relationship(catB, catA));
        }
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
                    hasRomanticFeelings(confessor, target) &&
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
                    confessor.relationships?.mates?.length > 0
                ) {
                    return [];
                }

                return living
                    .filter(target =>
                        hasRomanticFeelings(confessor, target) &&
                        game.canBecomeMates(confessor, target) &&
                        !(target.relationships?.mates?.length > 0) &&
                        (!event.mutualOnly || readyForMutualConfession(confessor, target)) &&

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

    function hasRomanticFeelings(cat, other) {
        if (!cat || !other || cat.id === other.id) return false;
        return cat.relationships?.crushes?.includes(other.id) ||
            (cat.relationships?.secretPartners?.[other.id] != null &&
                other.relationships?.secretPartners?.[cat.id] != null);
    }

    function mutualCrushSince(a, b) {
        return Math.max(a.relationships.crushStartDays?.[b.id] ?? getCurrentDay(),
            b.relationships.crushStartDays?.[a.id] ?? getCurrentDay());
    }

    function readyForMutualConfession(a, b) {
        return a?.relationships?.crushes?.includes(b?.id) && b?.relationships?.crushes?.includes(a.id) &&
            getCurrentDay() - mutualCrushSince(a, b) >= 5 &&
            Math.min(game.relationship(a, b), game.relationship(b, a)) >= 50;
    }

    function findMutualConfession(cats, playerCatId) {
        const confession = events.find(event => event.id === "moonlit_confession");
        if (isEventOnCooldown(confession)) return null;
        const event = { ...confession, mutualOnly: true };
        const participants = selectParticipants(event, cats, playerCatId);
        return participants ? { event, participants } : null;
    }

    function playerConfession(player, clanmate) {
        const event = events.find(entry => entry.id === "moonlit_confession");
        if (player.quarantined || clanmate.quarantined || !game.canBecomeMates(player, clanmate) ||
            player.relationships.mates.length || clanmate.relationships.mates.length ||
            !hasRomanticFeelings(player, clanmate) || !canPairExperienceEvent(event, player, clanmate)) return null;
        return { ...event, dialogue: { ...event.dialogue, start: event.dialogue.confession } };
    }

    // Determines npc dialogue choices
    function chooseNpcDialogueChoice(node, participants) {
        if (!node || !node.choices?.length) return null;
        if (node.conflict) return chooseMateConflictChoice(node, participants, node.choices);
        if (node.clanConflict) return chooseClanConflictChoice(node, participants);

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
            if (readyForMutualConfession(confessor, participants.target)) chance += .12;

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

            const reciprocates = hasRomanticFeelings(decisionMaker, confessor);

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

    function chooseClanConflictChoice(node, participants) {
        const cat = participants[node.decisionMaker];
        const temperament = reconciliationTemperament(cat);
        const roll = Math.random();
        let destination;
        if (node.clanConflict === "argument") {
            const calmChance = .38 + temperament * .09;
            destination = roll < calmChance ? "calm" : roll < calmChance + .27 ? "leave" : "escalate";
        } else if (node.clanConflict === "offer") {
            destination = roll < .65 + temperament * .08 ? "apology" : "leave";
        } else {
            const bond = game.relationship(cat, participants.peacemaker);
            destination = roll < .62 + temperament * .08 + bond * .002 ? "reconcile" : "refuse";
        }
        return node.choices.find(choice => choice.next === destination);
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

    const CLANMATE_CONVERSATIONS = {
        enemies: {
            greetings: ["{player}.", "You can sit here, just don't bother me."],
            stay: "{player} and {clanmate} share the quiet without quarrel.",
            leave: '"That’s enough for today." {clanmate} moves to the other side of camp.'
        },
        strained: {
            greetings: ["All right, {player}. We can talk for a bit.", "I'm still thinking about how things have been between us."],
            stay: "{player} and {clanmate} stick to camp news and part on easier terms.",
            leave: '"Fair enough." {clanmate} gives {player} some room.'
        },
        rivals: {
            greetings: ["Still keeping score, {player}?", "I suppose we can call a truce until the sun moves."],
            stay: "{player} and {clanmate} trade stories about their last outing, each trying to top the other.",
            leave: '"I’ll catch up with you later." {clanmate} gives a quick tail flick.'
        },
        mates: {
            greetings: ["There you are. I saved you a spot next to me.", "I've been looking forward to a little time with you."],
            stay: "{player} and {clanmate} lean against each other and talk until camp stirs again.",
            leave: '"Find me when you’re done." {clanmate} brushes against {player} on the way past.'
        },
        family: {
            greetings: ["Come sit with me, {player}! I haven't seen you since sunup.", "It feels like ages since we had a quiet moment together."],
            stay: "{player} and {clanmate} catch up and trade memories from the past.",
            leave: '"I’ll look for you later." {clanmate} watches {player} go.'
        },
        friends: {
            greetings: ["I was hoping you'd come by, {player}.", "You always find me in this spot. Here, come sit!"],
            stay: "{player} and {clanmate} swap stories until they both lose track of time.",
            leave: '"I’ll save the good part of that story, then." {clanmate} settles back down.'
        },
        crush: {
            greetings: ["Oh, {player}. I was hoping we'd get a moment together.", "Stay a little, if you like. I don't have anywhere else to be."],
            stay: "{player} and {clanmate} linger together a little longer than either planned.",
            leave: '"Oh. Maybe another time." {clanmate} looks toward the camp entrance.'
        },
        familiar: {
            greetings: ["Hello, {player}. There’s room here.", "Want to take a break with me, {player}?"],
            stay: "{player} and {clanmate} spend a little time catching up.",
            leave: '"See you around." {clanmate} stretches out again.'
        },
        neutral: {
            greetings: ["Hello, {player}. How has your day been?", "Are you between duties too, {player}?"],
            stay: "{player} and {clanmate} talk about how their day has been.",
            leave: '"Maybe another time." {clanmate} returns to their own affairs.'
        }
    };
    const CLANMATE_PERSONALITY_LINES = {
        bold: ["I've been wondering what's on the other side of the mountain. One day I'm going to find out.", "If there's something on your mind, just say it!"],
        gentle: ["Tell me how you're holding up. I've got time.", "We can sit somewhere quieter if that's better for you."],
        curious: ["I found the oddest set of tracks today. Want to help me figure them out?", "I've got a question about the last patrol we went on together. Would you hear me out?"],
        patient: ["We've got until the stars come out. Take your time.", "Wait -- there's still time before the next patrol, what did you want to talk about?"],
        helpful: ["Oh! I was just sorting out the new bedding. Want some fresh moss for your nest?", "I can make room for you on this side of the den if you'd like."],
        wary: ["Let's talk somewhere more private.", "I'd rather talk here, where we can see who's coming."],
        playful: ["Settle something for me. How many mice could you carry at once?", "I promise to keep my terrible mouse impression to myself."],
        proud: ["You should have seen the hunting trail I picked up this morning.", "I know my work speaks for itself. So what did you want to talk about?"],
        observant: ["There were two thrushes by the brambles this morning. They went quiet before the patrol got back.", "The camp's nearly empty at this hour. We won't be interrupted."],
        stubborn: ["I still say the west trail is quicker. You got time to hear my case?", "You have your views and I have mine. I can live with that for a while."],
        loyal: ["Tell me how your patrol went. Some other cats were talking about it, but I wanted to hear it from you.", "I'll hear out whatever you have to say."],
        ambitious: ["I've been working on my tracking lately. What are you practicing these days?", "I have to get back to my duties soon but I guess I have a few moments to spare."]
    };

    function clanmateConversationTone(clanmate, player) {
        const bond = game.relationship(clanmate, player);
        if (window.Relationships.enmityWith(clanmate, player)) return "enemies";
        if (bond <= -20) return "strained";
        if (window.Relationships.rivalriesWith(clanmate, player).length) return "rivals";
        if (clanmate.relationships?.mates?.includes(player.id)) return "mates";
        if (game.areCloseRelatives(clanmate, player)) return "family";
        if (hasRomanticFeelings(clanmate, player)) return "crush";
        if (clanmate.relationships?.bestFriends?.includes(player.id) || bond >= 65) return "friends";
        return bond >= 25 ? "familiar" : "neutral";
    }

    function showClanmateConversation(player, clanmate, onChoice) {
        const tone = clanmateConversationTone(clanmate, player);
        const { greetings, stay, leave } = CLANMATE_CONVERSATIONS[tone];
        const greeting = greetings[Math.floor(Math.random() * greetings.length)];
        const cautious = ["enemies", "strained", "rivals"].includes(tone);
        const followUp = CLANMATE_PERSONALITY_LINES[clanmate.personality]?.[Number(cautious)];
        showStoryEvent({
            title: "Time with a Clanmate",
            dialogue: {
                start: {
                    speaker: "clanmate",
                    decisionMaker: "player",
                    text: '"' + [greeting, followUp].filter(Boolean).join(" ") + '"',
                    choices: [
                        { text: "Stay and chat", next: "stay" },
                        ...(playerConfession(player, clanmate)
                            ? [{ text: "Talk about your feelings", next: "confess" }] : []),
                        { text: "Maybe later", next: "leave" }
                    ]
                },
                stay: { speaker: "clanmate", text: stay, spendTime: true },
                confess: { speaker: "player", text: "{player} takes a breath and turns to {clanmate}.", talkAboutFeelings: true },
                leave: { speaker: "clanmate", text: leave }
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

            function chooseNpcChoice() {
                if (node.conflict || node.clanConflict) return chooseNpcDialogueChoice({ ...node, choices }, participants);

                // The confessor decides whether to confess
                if (
                    event.participantType === "confession_pair" &&
                    nodeId === "start"
                ) {
                    return chooseNpcDialogueChoice({ ...node, choices }, participants);
                }

                // The recipient decides whether to accept or reject
                if (
                    (event.participantType === "confession_pair" && nodeId === "confession" ||
                        event.participantType === "known_admirer_pair" && nodeId === "start")
                ) {
                    return chooseNpcDialogueChoice({ ...node, choices }, participants);
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
                    const choice = event.choices.find(option => option.id === event.npcChoice) ??
                        event.choices[Math.floor(Math.random() * event.choices.length)];
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
        buildPatrolConflict,
        buildBrokenGround,
        resolveBrokenGround,
        findRescueThanks,
        resolveRescueThanks,
        readyAfterFall,
        rememberReturnPatrol,
        showRecoveredPatrolChoice,
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
        findMutualConfession,
        playerConfession,
        findClanFight,
        findClanArgument,
        findClanReconciliation,
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
