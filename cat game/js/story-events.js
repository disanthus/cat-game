
/* Story Events */

window.StoryEvents = (() => {
    let game = null;

    function initialize(dependencies) {
        game = dependencies;
    }

    // How likely a story event is to occur on a
    // day when the game checks for one.
    const EVENT_CHANCE = .2;

    // Minimum number of days between story events
    const STORY_EVENT_BUFFER = 2;

    // Minimum number of days before same event can happen again globally
    const EVENT_COOLDOWNS = {
        moonlit_confession: 20,
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
            participants: ["patrol"],
            description:
                "A patrol discovers unfamiliar pawprints pressed into the mud near the territory border.",

            choices: [
                {
                    id: "follow_tracks",
                    text: "Follow the tracks",
                    outcome:
                        "The pawprints lead deep into the undergrowth. Something has been watching the territory.",
                    effects: [
                        { type: "clan_log", text: "A patrol discovered unfamiliar tracks." }
                    ]
                },
                {
                    id: "warn_clan",
                    text: "Warn the clan",
                    outcome:
                        "The patrol returns to camp. For the rest of the day, every rustle outside camp draws suspicious glances.",
                    effects: [
                        { type: "clan_log", text: "The clan was warned about unfamiliar tracks." }
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
                            "{confessor} asks {target} to meet them at moonhigh. {confessor} arrives with their tail high, buzzing with a nervous excitement that even {target} can feel from a tail-length away. Without any more pretense, {confessor} speaks.",
                        gentle:
                            "{confessor} asks {target} to meet them at moonhigh.",
                        curious:
                            "{confessor} asks {target} to meet them at moonhigh.",
                        patient:
                            "{confessor} asks {target} to meet them at moonhigh.",
                        helpful:
                            "{confessor} asks {target} to meet them at moonhigh. {confessor} arrives with prey, admitting they thought {target} might be hungry. After sharing a few bites, {confessor} raises their head and gazes intently at {target} -- like they have something on their mind.",
                        wary:
                            "{confessor} asks {target} to meet them at moonhigh. {target} notices that {confessor} looks especially nervous tonight, shuffling their paws and glancing around furtively like they're worried they're being watched. {confessor} seems like they might lose their nerve at any moment.",
                        playful:
                            "",
                        proud:
                            "",
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
                            "{target} laughs. When {confessor} doesn't start laughing along with them, {target}'s face falls. \"Oh, you're serious?!\" Embarrassment flushes their ears red. \"Sorry, {confessor}, but ... I just like us better as friends.",
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
            pairCooldown: 10,

            choices: [
                {
                    id: "confront",
                    text: "Confront the clanmates",
                    outcome:
                        "The confrontation brings buried frustrations to the surface. Neither cat leaves the conversation feeling entirely understood.",
                    effects: [
                        { type: "relationship", value: "negative" },
                        { type: "memory", value: "hurtful_argument" }
                    ]
                },
                {
                    id: "talk_privately",
                    text: "Talk privately with a trusted friend",
                    outcome:
                        "A quiet conversation helps the cat consider another explanation, though their insecurity doesn't disappear overnight.",
                    effects: [
                        { type: "relationship", value: "positive" },
                        { type: "memory", value: "supportive_conversation" }
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
            description:
                "A patrol hears a tiny cry from a patch of bracken. Inside lies a frightened kit, alone and shivering.",

            choices: [
                {
                    id: "bring_kit_home",
                    text: "Bring the kit to camp",
                    outcome:
                        "The patrol carries the kit home. The clan must decide how to protect this unexpected new arrival.",
                    effects: [
                        { type: "special_event", value: "rescue_kit" },
                        { type: "clan_log", text: "A patrol found a kit alone in the bracken." }
                    ]
                },
                {
                    id: "search_area",
                    text: "Search for the kit's family",
                    outcome:
                        "The patrol searches the surrounding area before deciding what to do next.",
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
                        "The patrol scrambles around the slope. The rescue takes longer, and every passing moment feels unbearable.",
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

        const selected = shuffle(living).slice(0, required);

        if (!areParticipantsEligible(event, selected)) {
            return null;
        }

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

    // add dialogue variation depending on speaker's personality
    function getDialogueText(node, participants) {
        function getParticipant(name) {
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

        const isString = typeof node === "string";

        const speaker = isString
            ? null
            : getParticipant(node.speaker);

        let text = isString ? node : node.text || "";

        if (!isString && speaker && node.personalityText) {
            const variation = node.personalityText[speaker.personality];

            if (variation) {
                text = variation;
            }
        }

        return text.replace(/\{(\w+)\}/g, (match, name) => {
            return getParticipant(name)?.name || match;
        });
    }

    // Display an event with branching dialogue
    function showStoryEvent(event, participants, onChoice) {
        function completeEvent(result) {
            console.log("PLAYER EVENT COMPLETED:", event.id);
            console.log("Ending node:", result);

            recordEventParticipants(event, participants);

            const finalResult = {
                ...result,
                outcome: result.outcome || getDialogueText(result, participants)
            };

            console.log("Final outcome:", finalResult.outcome);

            onChoice(finalResult, participants);
        }

        let modal = document.getElementById("storyEventModal");

        if (!modal) {
            modal = document.createElement("div");
            modal.id = "storyEventModal";

            modal.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(20, 15, 25, 0.8);
        `;

            document.body.appendChild(modal);
        }

        const panel = document.createElement("div");
        panel.style.cssText = `
        background: #fff8f0;
        color: #302733;
        width: 100%;
        max-width: 480px;
        padding: 24px;
        border-radius: 14px;
        box-sizing: border-box;
    `;

        modal.innerHTML = "";
        modal.appendChild(panel);

        // Support both named participants and old participant arrays
        function getParticipant(name) {
            if (!Array.isArray(participants)) {
                return participants[name] || null;
            }

            return participants[Number(name)] || null;
        }

        // Replace character placeholders with actual names
        function formatText(text) {
            return text.replace(/\{(\w+)\}/g, (match, name) => {
                return getParticipant(name)?.name || match;
            });
        }

        // Show a dialogue node
        function showNode(nodeId) {
            const node = event.dialogue[nodeId];

            if (!node) {
                console.error("Missing dialogue node:", nodeId);
                modal.remove();
                return;
            }

            panel.innerHTML = "";

            if (node.speaker) {
                const speaker = getParticipant(node.speaker);

                const speakerName = document.createElement("h3");
                speakerName.textContent = speaker?.name || node.speaker;
                panel.appendChild(speakerName);
            }
            console.log("Participants:", participants);
            console.log("Confessor:", participants.confessor);
            console.log("Target:", participants.target);
            console.log("Resolved text:", getDialogueText(node, participants));
            const dialogue = document.createElement("p");
            dialogue.textContent = getDialogueText(node, participants);
            panel.appendChild(dialogue);
            const decisionMaker = node.decisionMaker;
            const decisionCat = decisionMaker
                ? getParticipant(decisionMaker)
                : null;

            const playerMakesDecision =
                decisionCat?.id === game?.getState()?.playerCatId;

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
                // The confessor decides whether to confess
                if (
                    event.participantType === "confession_pair" &&
                    nodeId === "start"
                ) {
                    const confessor = participants.confessor;
                    const target = participants.target;

                    const willConfess = shouldNpcConfess(confessor, target);

                    return node.choices.find(
                        choice => choice.next === (
                            willConfess ? "confession" : "secret"
                        )
                    );
                }

                // The recipient decides whether to accept or reject
                if (
                    event.participantType === "confession_pair" &&
                    nodeId === "confession"
                ) {
                    const confessor = participants.confessor;
                    const target = participants.target;

                    const targetHasCrush = Boolean(
                        target?.relationships?.crushes?.includes(confessor?.id)
                    );

                    const desiredNext = targetHasCrush ? "accept" : "reject";

                    return node.choices.find(
                        choice => choice.next === desiredNext
                    );
                }
                // Otherwise, let the NPC randomly choose
                return node.choices[
                    Math.floor(Math.random() * node.choices.length)
                ];
            }

            if (playerMakesDecision || !decisionMaker) {

                // The player gets to make this decision.
                (node.choices || []).forEach(choice => {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.textContent = choice.text;

                    button.style.cssText = `
                    display: block;
                    width: 100%;
                    padding: 12px;
                    margin-top: 10px;
                    border: 1px solid #b9a5bd;
                    border-radius: 8px;
                     background: #eaddec;
                    color: #302733;
                    cursor: pointer;
                    font: inherit;
                    text-align: left;
                    `;

                    button.addEventListener("click", () => {
                        if (choice.next) {
                            showNode(choice.next);
                        } else {
                            modal.remove();
                            completeEvent(choice, participants);
                        }
                    });

                    panel.appendChild(button);
                });

            } else {

                // The NPC makes the decision when the player presses Next.
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = "Next";

                button.addEventListener("click", () => {
                    const choice = chooseNpcChoice();

                    if (!choice) return;

                    if (choice.next) {
                        showNode(choice.next);
                    } else {
                        modal.remove();
                        completeEvent(choice);
                    }
                });

                panel.appendChild(button);
            };

            // Ending node: apply its effects
            if (!node.choices || node.choices.length === 0) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = "Continue";

                button.addEventListener("click", () => {
                    modal.remove();
                    completeEvent(node);
                });

                panel.appendChild(button);
            }
        }

        // Old events still use their original flat choices
        if (!event.dialogue) {
            const title = document.createElement("h2");
            title.textContent = event.title;

            const description = document.createElement("p");
            description.textContent = event.description;

            panel.append(title, description);

            event.choices.forEach(choice => {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = choice.text;

                button.addEventListener("click", () => {
                    modal.remove();
                    completeEvent(choice);
                });

                panel.appendChild(button);
            });

            return;
        }

        const title = document.createElement("h2");
        title.textContent = event.title;
        panel.appendChild(title);

        showNode("start");
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
                    speaker ? `${speaker.name}: ${text}` : text
                );
            }

            // We've reached the ending. Apply its effects and finish.
            if (!node.choices || node.choices.length === 0) {
                recordEventParticipants(event, participants);

                onComplete({
                    ...node,
                    outcome: dialogueLines.join(" ")
                });

                return;
            }

            // Choose the next dialogue branch.
            const choice = chooseNpcDialogueChoice(node, participants);

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
        events,
        getStoryHistory,
        formatText: getDialogueText,
        shouldTriggerEvent,
        getRandomEvent,
        selectParticipants,
        involvesPlayer,
        showStoryEvent,
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
