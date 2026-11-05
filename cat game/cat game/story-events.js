
/* Story Events */

window.StoryEvents = (() => {

    // How likely a story event is to occur on a
    // day when the game checks for one.
    const EVENT_CHANCE = 0.25;

    const events = [

        // -------------------------------------
        // MYSTERY
        // -------------------------------------

        {
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
            participants: ["romantic_pair"],

            choices: [
                {
                    id: "confess",
                    text: "Encourage an honest confession",
                    outcome:
                        "The cat gathers their courage and speaks from the heart. Whatever happens next, things between them may never be quite the same.",
                    effects: [
                        { type: "relationship", value: "positive" },
                        { type: "memory", value: "romantic_confession" }
                    ]
                },
                {
                    id: "stay_silent",
                    text: "Keep the feelings secret",
                    outcome:
                        "The moment passes without a confession. The unspoken feelings remain, waiting for another chance.",
                    effects: [
                        { type: "memory", value: "hidden_feelings" }
                    ]
                }
            ]
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

            choices: [
                {
                    id: "risk_rescue",
                    text: "Rush forward to rescue them",
                    outcome:
                        "The rescuer lunges forward, trying to catch their clanmate before the loose earth gives way.",
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

    // Roll for an event on a day when the game
    // decides to check for one.
    function shouldTriggerEvent() {
        return Math.random() < EVENT_CHANCE;
    }

    // Return a random event, optionally excluding
    // events that cannot currently happen.
    function getRandomEvent(availableEvents = events) {
        if (availableEvents.length === 0) {
            return null;
        }

        const index = Math.floor(
            Math.random() * availableEvents.length
        );

        return availableEvents[index];
    }

    // Select living cats to participate in an event.
    function selectParticipants(event, cats, playerCatId) {
        const living = cats.filter(cat => cat && cat.alive !== false);

        const required = event.requiresCats || 1;

        if (living.length < required) {
            return null;
        }

        // Events with no special roles can use any living cats.
        const eligible = living.slice();

        // Randomize the candidates.
        for (let i = eligible.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
        }

        // Shuffle all living cats so the player and NPCs
        // have a fair chance of being selected.
        const participants = eligible.slice(0, required);

        return participants.length === required ? participants : null;
    }

    // Determine whether player is involved in an event
    function involvesPlayer(participants, playerCatId) {
        return participants.some(cat => cat && cat.id === playerCatId);
    }


    // Display an event and let the player choose its outcome.
    function showStoryEvent(event, participants, onChoice) {
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

        modal.innerHTML = "";

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

        const title = document.createElement("h2");
        title.textContent = event.title;

        const description = document.createElement("p");
        description.textContent = event.description;

        panel.append(title, description);

        event.choices.forEach(choice => {
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
                modal.remove();
                onChoice(choice, participants);
            });

            panel.appendChild(button);
        });

        modal.appendChild(panel);
    }


    // Expose the event library without placing
    // variables in the global namespace.
    return {
        events,
        shouldTriggerEvent,
        getRandomEvent,
        selectParticipants,
        involvesPlayer,
        showStoryEvent
    };

})();
