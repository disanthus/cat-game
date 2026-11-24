window.ClanQuirks = (() => {
    let game;
    
    function initialize(dependencies) {
        game = dependencies;
    }
    
    const quirks = {
        prey_cacher: {
            title: "Prey cacher", personalities: ["wary", "observant", "stubborn"],
            clue: "{owner} doubled back toward a tangle of roots after the hunt.",
            proof: "Fresh prey is tucked beneath the roots, where {owner} has been setting it aside.",
            support: "Ask them to share the reserve in lean times",
            motives: ["famine_fear", "feed_overlooked", "self_reliance"]
        },
        secret_caretaker: {
            title: "Secret caretaker", personalities: ["helpful", "gentle", "proud"],
            clue: "{subject}'s bedding was changed before anyone was assigned to the elders' den.",
            proof: "{owner} carries fresh moss into {subject}'s nest while the camp is quiet.",
            support: "Offer to help with the bedding",
            motives: ["quiet_kindness", "repay_care", "protect_reputation"]
        },
        storm_watcher: {
            title: "Storm watcher", personalities: ["curious", "bold", "observant"],
            clue: "{owner} slips out of camp as clouds gather over the river.",
            proof: "{owner} is watching the water from a ledge and has been keeping track of how high it rises.",
            support: "Ask them to warn you if the river rises",
            motives: ["read_weather", "seek_danger", "watch_for_signs"]
        },
        quiet_superstitions: {
            title: "Quiet superstitions", personalities: ["wary", "patient", "stubborn"],
            clue: "{owner} goes back through the camp entrance to step over a different root.",
            proof: "Before leaving camp, {owner} returns to touch the same pale stone. It is part of a ritual.",
            support: "Join their ritual before the next patrol",
            motives: ["keep_safe", "honor_mentor", "listen_to_starclan"]
        },
        takes_blame: {
            title: "Takes the blame", personalities: ["loyal", "helpful", "ambitious"],
            clue: "{owner} says they misplaced a bundle of herbs, but another cat remembers seeing them elsewhere.",
            proof: "{subject} thanks {owner} for taking responsibility for the missing bundle.",
            support: "Encourage them to speak honestly with the cat they protected",
            motives: ["protect_friend", "protect_apprentice", "earn_favor"]
        },
        keeps_a_place: {
            title: "Keeps a place for the dead", personalities: ["loyal", "gentle", "proud"],
            clue: "A fresh feather has appeared in {subject}'s old nest.",
            proof: "{owner} sits by {subject}'s old nest and tells them about the day.",
            support: "Sit with them and listen to a memory",
            motives: ["private_grief", "keep_memory", "believe_they_listen"]
        },
        secret_gift_giver: {
            title: "Secret gift-giver",
            description: "Leaves small gifts in a favorite cat's nest.",
            personalities: ["loyal", "wary", "ambitious"],
            motives: ["possessive_friend", "fear_replacement", "court_influence", "misplaced_protection", "misread_omen"]
        }
    };

    const motives = {
        famine_fear: { label: "Fear of another famine", line: "I've seen the prey pile empty before. I can't bear to have nothing put aside.", personalities: ["wary"], trust: "low", context: "scarce" },
        feed_overlooked: { label: "Feeds overlooked clanmates", line: "I know which cats keep missing meals. I want to have something left for them.", personalities: ["observant", "helpful"], context: "scarce" },
        self_reliance: { label: "Wants an independent reserve", line: "I trust a reserve I can look after myself.", personalities: ["stubborn"], trust: "low", respect: "low" },
        quiet_kindness: { label: "Helps without taking credit", line: "Someone needed to make that nest comfortable. That's all.", personalities: ["gentle", "helpful"] },
        repay_care: { label: "Repays an old kindness", line: "They looked after me once. I wanted to do the same.", personalities: ["loyal"], context: "close" },
        protect_reputation: { label: "Keeps their soft side private", line: "Other cats would make a fuss if they knew. I would rather keep this between us.", personalities: ["proud"], respect: "high", trust: "low" },
        read_weather: { label: "Wants to understand the river", line: "The water leaves marks on the stones. If I watch long enough, maybe I can learn to read them!", personalities: ["curious", "observant"], context: "storm" },
        seek_danger: { label: "Wants to prove their nerve", line: "Everyone says to stay away. I want to see how close I can get and still come back.", personalities: ["bold", "ambitious"], respect: "low" },
        watch_for_signs: { label: "Watches for omens", line: "I think StarClan has something to show us in the way the river moves.", faith: "high", context: "storm" },
        keep_safe: { label: "Fears for their patrolmates", line: "I feel better when everyone leaves camp after I've done it.", personalities: ["wary", "gentle"], context: "danger" },
        honor_mentor: { label: "Keeps an old mentor's habit", line: "My mentor taught me that. I like carrying something of theirs with me.", personalities: ["stubborn", "patient"], faith: "low" },
        listen_to_starclan: { label: "Asks StarClan for safe passage", line: "I ask our ancestors to watch the patrol before we leave.", faith: "high" },
        protect_friend: { label: "Protects a close friend", line: "I didn't want them to face the clan's anger alone.", personalities: ["loyal"], context: "close" },
        protect_apprentice: { label: "Shields a younger cat", line: "They were frightened of getting into trouble. I thought taking the blame would help.", personalities: ["helpful", "gentle"], context: "apprentice" },
        earn_favor: { label: "Wants a favor owed", line: "If I stand up for them now, they might stand up for me later.", personalities: ["ambitious"], respect: "low", context: "rank" },
        private_grief: { label: "Grieves away from the clan", line: "I miss them. It's easier to say that here, where nobody expects me to explain.", personalities: ["proud", "wary"], trust: "low" },
        keep_memory: { label: "Keeps a loved one's memory alive", line: "Saying their name here helps me remember how they sounded.", personalities: ["gentle", "loyal"], context: "loss" },
        believe_they_listen: { label: "Believes the dead can hear them", line: "I like to think they still listen when I tell them about the day.", faith: "high" },
        possessive_friend: { label: "Wants a close friend all to themself", line: "They wanted to keep their friend all to themself.", personalities: ["stubborn", "loyal"], context: "close" },
        fear_replacement: { label: "Fears being replaced", line: "They were frightened their friend would leave them behind.", personalities: ["wary", "gentle"], trust: "low" },
        court_influence: { label: "Wants a powerful friend in their corner", line: "They hoped a friend with influence would take their side when it mattered.", personalities: ["proud", "ambitious"], respect: "low", context: "rank" },
        misplaced_protection: { label: "Distrusts the friend's other companion", line: "They convinced themself that keeping the two cats apart would protect their friend.", personalities: ["loyal", "observant"], trust: "low", context: "distrust" },
        misread_omen: { label: "Acts on a private omen", line: "They had taken a dream as a warning and decided to drive a wedge between the two cats.", personalities: ["wary"], faith: "high" }
    };

    function weighted(entries) {
        if (!entries.length) return null;
        let roll = game.rand(1, entries.reduce((sum, entry) => sum + entry.weight, 0));
        return entries.find(entry => (roll -= entry.weight) <= 0);
    }

    function recentLoss(owner, state) {
        const memory = owner.memories?.findLast(entry => entry.event === "clan_loss" && state.day - entry.day <= 60);
        return state.starClan.find(cat => memory?.participants?.includes(cat.id));
    }

    function context(owner, subject, state, rival) {
        return {
            scarce: state.prey < game.expectedMeals() || owner.hunger > 60,
            storm: ["rain", "thunderstorm"].includes(state.weather?.spell?.id) && state.weather.spell.endsDay >= state.day,
            close: !!subject && game.relationship(owner, subject) >= 50,
            apprentice: subject?.rank === "Apprentice",
            rank: ["Leader", "Deputy", "Medicine Cat"].includes(subject?.rank),
            danger: owner.health < 60 || (owner.conditions?.length ?? 0) > 0,
            loss: !!recentLoss(owner, state),
            distrust: !!rival && game.relationship(owner, rival) < 0
        };
    }

    function pickMotive(ids, owner, subject, state, rival) {
        const factors = context(owner, subject, state, rival);
        return weighted(ids.map(id => {
            const motive = motives[id];
            let weight = motive.personalities?.includes(owner.personality) ? 2 : 1;
            for (const stat of ["faith", "trust", "respect"]) {
                const value = owner[stat] ?? 50;
                if (motive[stat] === "high" && value >= 60 || motive[stat] === "low" && value <= 40) weight += 3;
            }
            if (motive.context && factors[motive.context]) weight += 3;
            return { id, weight };
        })).id;
    }

    function giftCast(owner, adults) {
        for (const friend of adults) {
            if (friend === owner || game.relationship(owner, friend) < 35) continue;
            const rival = adults.find(cat => cat !== owner && cat !== friend && game.relationship(friend, cat) >= 12);
            if (rival) return { friend, rival };
        }
        return null;
    }

    function rememberDiscovery(observer, owner, knowsMotive = false) {
        const knowledge = (observer.quirkKnowledge ??= {})[owner.id] ??= {};
        knowledge.noticed = true;
        knowledge.discovered = true;
        knowledge.motiveKnown ||= knowsMotive;
        return knowledge;
    }

    function assign() {
        const state = game.getState();
        const adults = state.cats.filter(cat => cat.alive && cat.age >= 12);
        const assigned = adults.filter(cat => quirks[cat.hiddenQuirk]).length;
        if (assigned >= Math.max(1, Math.floor(adults.length / 2)) ||
            state.day < (state.nextQuirkAssignmentDay ?? 3) || !game.chance(.18)) return;
        const options = [];
        const giftAllowed = !state.giftStory && state.day >= (state.nextGiftStoryDay ?? 5);
        for (const owner of adults) {
            if (owner.hiddenQuirk || owner.id === state.playerCatId) continue;
            const others = state.cats.filter(cat => cat.alive && cat !== owner);
            const elder = others.filter(cat => cat.rank === "Elder")
                .sort((a, b) => game.relationship(owner, b) - game.relationship(owner, a))[0];
            const protectionWeight = cat => game.relationship(owner, cat) +
                (owner.personality === "ambitious" && ["Leader", "Deputy"].includes(cat.rank) ? 25 : 0) +
                (["helpful", "gentle"].includes(owner.personality) && cat.rank === "Apprentice" ? 25 : 0);
            const protectedCat = others.filter(cat => cat.age >= 6)
                .sort((a, b) => protectionWeight(b) - protectionWeight(a))[0];
            const loss = recentLoss(owner, state);
            const subjects = { secret_caretaker: elder, takes_blame: protectedCat, keeps_a_place: loss };
            const factors = context(owner, protectedCat, state);
            const catalysts = { prey_cacher: factors.scarce, storm_watcher: factors.storm, quiet_superstitions: factors.danger, keeps_a_place: !!loss };
            for (const [id, quirk] of Object.entries(quirks)) {
                if (id === "secret_gift_giver") {
                    const gift = giftAllowed && giftCast(owner, adults);
                    if (!gift) continue;
                    const close = game.relationship(owner, gift.friend) >= 50;
                    options.push({
                        owner, id, subject: gift.friend, rival: gift.rival,
                        weight: (quirk.personalities.includes(owner.personality) ? 2 : 1) * (close ? 2 : 1)
                    });
                    continue;
                }
                if (Object.hasOwn(subjects, id) && !subjects[id]) continue;
                const weight = (quirk.personalities.includes(owner.personality) ? 2 : 1) * (catalysts[id] ? 2 : 1);
                options.push({ owner, id, subject: subjects[id], weight });
            }
        }
        const selected = weighted(options);
        if (!selected) return;
        const { owner, id, subject, rival } = selected;
        owner.hiddenQuirk = id;
        owner.quirkSubjectId = subject?.id;
        owner.hiddenMotive = pickMotive(quirks[id].motives, owner, subject, state, rival);
        state.nextQuirkAssignmentDay = state.day + 3;
        if (id === "secret_gift_giver") game.startGiftStory(owner, subject, rival);
    }

    function subjectFor(owner, state) {
        return [...state.cats, ...state.starClan].find(cat => cat.id === owner.quirkSubjectId);
    }

    function fill(text, owner, subject) {
        return text.replaceAll("{owner}", owner.name).replaceAll("{subject}", subject?.name ?? "a clanmate");
    }

    function discoverable(owner, state) {
        if (owner.hiddenQuirk === "prey_cacher") return (owner.hiddenPrey ?? 0) > 0;
        if (owner.hiddenQuirk === "storm_watcher") return context(owner, null, state).storm;
        if (["secret_caretaker", "takes_blame"].includes(owner.hiddenQuirk)) return subjectFor(owner, state)?.alive;
        if (owner.hiddenQuirk === "keeps_a_place") return !!subjectFor(owner, state);
        return true;
    }

    function findStory(cats) {
        const state = game.getState();
        const observer = cats.find(cat => cat.id === state.playerCatId);
        if (!observer || observer.age < 6 || state.day < (state.nextQuirkStoryDay ?? 4) || !game.chance(.28)) return null;
        const eligible = cats.filter(owner => owner !== observer && quirks[owner.hiddenQuirk] && owner.hiddenQuirk !== "secret_gift_giver" &&
            !owner.quirkPublic && !observer.quirkKnowledge?.[owner.id]?.responded && discoverable(owner, state));
        if (!eligible.length) return null;
        const owner = eligible[game.rand(0, eligible.length - 1)];
        const def = quirks[owner.hiddenQuirk];
        const subject = subjectFor(owner, state);
        const knowledge = observer.quirkKnowledge?.[owner.id];
        let title, description, actions;
        if (!knowledge?.noticed) {
            title = "Something Out of Place";
            description = fill(def.clue, owner, subject);
            actions = [["notice", "Keep it in mind"]];
        } else if (!knowledge.discovered) {
            title = "A Second Look";
            description = fill(def.clue, owner, subject) + " You remember seeing something like this before.";
            actions = [["ask", `Ask ${owner.name} in private`], ["watch", "Wait and look for proof"]];
        } else {
            title = def.title;
            description = fill(def.proof, owner, subject);
            actions = [["support", def.support], ["keep", "Keep it between you"], ["tell", "Tell the clan"]];
            if (!knowledge.motiveKnown) actions.unshift(["ask_motive", "Ask why they do it"]);
        }
        return { participants: { observer, owner }, event: {
            id: "hidden_quirk", title, description, decisionMaker: "observer", private: true,
            choices: actions.map(([id, text]) => ({ id, text, effects: [{ type: "hidden_quirk", action: id }] }))
        } };
    }

    function releaseCache(owner, state) {
        const released = owner.hiddenPrey ?? 0;
        state.prey += released;
        owner.hiddenPrey = 0;
        return released;
    }

    function help(owner, observer, subject, state) {
        owner.quirkSupported = true;
        Relationships.setRelationship(owner, observer, game.relationship(owner, observer) + 3,
            game.relationship(observer, owner) + 3);
        switch (owner.hiddenQuirk) {
            case "prey_cacher":
                return `${owner.name} brought ${releaseCache(owner, state)} prey to the clan and agreed to share their reserve in a shortage.`;
            case "secret_caretaker":
                subject.energy = Math.min(100, subject.energy + 8);
                return `${observer.name} helped ${owner.name} settle ${subject.name} into fresh bedding.`;
            case "storm_watcher":
                return `${owner.name} agreed to speak up when the river starts rising.`;
            case "quiet_superstitions":
                owner.energy = Math.min(100, owner.energy + 4);
                return `${observer.name} waited with ${owner.name} at the pale stone. ${owner.name} left camp a little steadier.`;
            case "takes_blame":
                owner.quirkConversationDay = state.day + 2;
                return `${observer.name} encouraged ${owner.name} to speak to ${subject.name} about owning up next time. ${owner.name} agreed to try.`;
            case "keeps_a_place":
                game.rememberEvent(observer, "quirk_remembrance", {
                    description: `${owner.name} remembered how ${subject.name} always made room in their nest for a cold apprentice.`,
                    importance: 4, participants: [owner.id, subject.id], privateOwnerId: observer.id, departedId: subject.id
                });
                return `${observer.name} stayed beside ${owner.name} and listened to a story about ${subject.name}.`;
        }
    }

    function resolve({ action }, { observer, owner }) {
        const state = game.getState();
        const def = quirks[owner.hiddenQuirk];
        const subject = subjectFor(owner, state);
        if (!def || !discoverable(owner, state)) return "There is nothing more to learn here today.";
        const knowledge = (observer.quirkKnowledge ??= {})[owner.id] ??= {};
        state.nextQuirkStoryDay = state.day + 3;
        let outcome;
        if (action === "notice") {
            knowledge.noticed = true;
            outcome = fill(def.clue, owner, subject);
        } else if (action === "ask" || action === "ask_motive") {
            const guarded = ["wary", "proud", "stubborn"].includes(owner.personality);
            const openness = game.relationship(owner, observer) + ((owner.trust ?? 50) - 50) / 2 +
                (guarded ? -12 : 5);
            if (openness >= 25) {
                rememberDiscovery(observer, owner, true);
                outcome = `${owner.name} opened up. “${motives[owner.hiddenMotive].line}”`;
            } else {
                outcome = `${owner.name} changed the subject. ${observer.name} still doesn't know ${knowledge.discovered ? "why they do it" : "what was happening"}.`;
            }
        } else if (action === "watch") {
            rememberDiscovery(observer, owner);
            outcome = fill(def.proof, owner, subject);
        } else {
            knowledge.responded = true;
            if (action === "tell") {
                owner.quirkPublic = true;
                Relationships.setRelationship(owner, observer, game.relationship(owner, observer) - 6,
                    game.relationship(observer, owner));
                outcome = `${observer.name} told the clan what they had seen. ${fill(def.proof, owner, subject)}`;
                if (owner.hiddenQuirk === "prey_cacher") {
                    outcome += ` The clan recovered ${releaseCache(owner, state)} prey.`;
                } else if (owner.hiddenQuirk === "secret_caretaker") {
                    owner.caretakerPauseUntil = state.day + 8;
                    outcome += ` ${owner.name} stopped visiting the elders' den in secret.`;
                }
                game.logEvent("quirk_discovery", outcome);
            } else if (action === "support") {
                outcome = help(owner, observer, subject, state);
            } else {
                outcome = `${observer.name} decided to keep what they learned about ${owner.name} private.`;
            }
        }
        game.rememberEvent(observer, knowledge.discovered ? "quirk_discovery" : "quirk_clue", {
            description: outcome, importance: 3, participants: [owner.id], privateOwnerId: observer.id
        });
        return outcome;
    }

    function patrolPrey(patrol, caught) {
        if (caught < 2) return caught;
        const day = game.getState().day;
        const cacher = patrol.find(cat => cat.hiddenQuirk === "prey_cacher" && !cat.quirkPublic &&
            (cat.hiddenPrey ?? 0) < 3 && cat.lastPreyCacheDay !== day);
        if (!cacher) return caught;
        cacher.lastPreyCacheDay = day;
        cacher.hiddenPrey = (cacher.hiddenPrey ?? 0) + 1;
        return caught - 1;
    }

    function daily() {
        const state = game.getState();
        assign();
        const cats = state.cats.filter(cat => cat.alive);
        for (const owner of cats) {
            if (owner.hiddenQuirk === "prey_cacher" && owner.quirkSupported && owner.hiddenPrey &&
                state.prey < game.expectedMeals()) {
                const amount = releaseCache(owner, state);
                game.logEvent("clan", `${owner.name} brought ${amount} stored prey to the clan during the shortage.`);
            }
            if (owner.hiddenQuirk === "secret_caretaker" && state.day >= (owner.caretakerPauseUntil ?? 0) && state.day % 4 === 0) {
                const subject = subjectFor(owner, state);
                if (subject?.alive && !owner.quarantined && !subject.quarantined) {
                    subject.energy = Math.min(100, subject.energy + 5);
                    if (owner.caretakerPauseUntil) {
                        delete owner.caretakerPauseUntil;
                        game.logEvent("clan", `${subject.name} asked ${owner.name} to help with their nest again.`);
                    }
                }
            }
            if (owner.hiddenQuirk === "takes_blame" && owner.quirkConversationDay <= state.day) {
                const subject = subjectFor(owner, state);
                if (subject?.alive && !owner.quarantined && !subject.quarantined) {
                    delete owner.quirkConversationDay;
                    const description = `${owner.name} asked ${subject.name} to speak up for themself the next time something went wrong.`;
                    for (const cat of [owner, subject]) {
                        game.rememberEvent(cat, "quirk_conversation", {
                            description, importance: 3, participants: [cat === owner ? subject.id : owner.id],
                            privateOwnerId: cat.id
                        });
                    }
                }
            }
            if (owner.hiddenQuirk === "storm_watcher" && owner.quirkSupported &&
                state.disaster?.weatherStart != null && !state.disaster.warnClan && state.disaster.day >= state.day) {
                state.disaster.warnClan = true;
                game.logEvent("weather", `${owner.name} warned the clan that the river was rising. Camp began preparing.`);
            }
        }
    }

    function profile(owner, observer) {
        const definition = quirks[owner.hiddenQuirk];
        const knowledge = observer?.quirkKnowledge?.[owner.id];
        const giftGiver = owner.hiddenQuirk === "secret_gift_giver";
        const olderGiftMemory = giftGiver && observer?.memories?.find(memory =>
            ["uncovered_gift_giver", "betrayed_by_friend"].includes(memory.event) &&
            memory.participants?.includes(owner.id) &&
            (!memory.privateOwnerId || memory.privateOwnerId === observer.id));
        const publicQuirk = owner.quirkPublic || (giftGiver && owner.giftStoryExposed);
        if (!definition || (owner !== observer && !publicQuirk && !knowledge?.discovered && !olderGiftMemory)) return null;
        const knowsMotive = owner === observer || knowledge?.motiveKnown || olderGiftMemory?.event === "uncovered_gift_giver";
        const motive = motives[owner.hiddenMotive] ?? (giftGiver ? motives.possessive_friend : null);
        return {
            title: definition.title,
            description: definition.description,
            motive: knowsMotive ? motive?.label : null
        };
    }

    function remembranceDream(healer, visitor) {
        if (!visitor) return null;
        const memory = healer.memories?.findLast(entry =>
            entry.event === "quirk_remembrance" && entry.departedId === visitor.id && !entry.echoedInDream);
        if (!memory) return null;
        memory.echoedInDream = true;
        return `${visitor.name} appeared in ${healer.name}'s dream beside a familiar feather and made room for them in the nest.`;
    }

    return { initialize, daily, findStory, resolve, patrolPrey, profile, rememberDiscovery, motives, remembranceDream };
})();
