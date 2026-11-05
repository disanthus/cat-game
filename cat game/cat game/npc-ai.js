
/* EmberClan NPC AI
   Handles autonomous cat activities and social behavior. */

window.NPC = (() => {
    let game = null;

    // Receive helpers from the main game.
    function initialize(dependencies) {
        game = dependencies;
    }

    // Let NPCs choose their daily activities.
    function chooseNpcActivity(cat) {
        if (!game) {
            console.error("NPC AI has not been initialized.");
            return "rest";
        }

        if (cat.age < 6) {
            if (cat.energy < 35) return "rest";
            return game.pick(["play", "socialize", "rest"]);
        }

        if (cat.health < 35 || cat.energy < 20) {
            return "rest";
        }

        const choices = [];

        switch (cat.personality) {
            case "bold":
                choices.push("explore", "train", "hunt");
                break;
            case "curious":
            case "observant":
                choices.push("explore", "explore", "hunt");
                break;
            case "gentle":
            case "loyal":
                choices.push("socialize", "socialize", "hunt");
                break;
            case "patient":
                choices.push("train", "rest", "hunt");
                break;
            case "playful":
                choices.push("play", "socialize", "hunt");
                break;
            case "wary":
                choices.push("rest", "hunt", "train");
                break;
            case "proud":
            case "stubborn":
                choices.push("train", "hunt", "explore");
                break;
            default:
                choices.push("hunt", "train", "socialize");
        }

        if (game.getState().prey < 5) {
            choices.push("hunt", "hunt");
        }

        if (cat.energy < 40) {
            choices.push("rest", "rest");
        }

        // Cats with strong friendships are more likely to socialize.
        const friends = game.livingCats().filter(other =>
            other.id !== cat.id &&
            other.age >= 6 &&
            game.relationship(cat, other) >= 60
        );

        if (friends.length > 0) {
            choices.push("socialize", "socialize");
        }

        return game.pick(choices);
    }


    // Resolve an NPC's daily activity.
    function performNpcActivity(cat) {
        if (!game) {
            console.error("NPC AI has not been initialized.");
            return;
        }

        const activity = chooseNpcActivity(cat);
        const state = game.getState();
        let result = "";

        if (activity === "rest") {
            cat.energy = game.clamp(cat.energy + game.rand(12, 24), 0, 100);
            cat.hunger = game.clamp(cat.hunger - game.rand(2, 6), 0, 100);

            if (cat.health < 100 && cat.hunger < 60) {
                cat.health = game.clamp(cat.health + game.rand(1, 5), 0, 100);
            }

            result = `${cat.name} rested at camp and recovered some energy.`;
        } else if (activity === "hunt") {
            cat.energy = game.clamp(cat.energy - game.rand(6, 12), 0, 100);
            cat.hunger = game.clamp(cat.hunger + game.rand(3, 8), 0, 100);
            cat.experience += 1;

            const huntingSkill = cat.skills.hunting || 1;
            let successChance = 0.35 + huntingSkill * 0.06;

            if (cat.personality === "observant") successChance += 0.08;
            if (cat.personality === "patient") successChance += 0.06;
            if (cat.personality === "playful") successChance -= 0.04;

            if (Math.random() < game.clamp(successChance, 0.15, 0.90)) {
                const preyCaught = game.rand(1, 2);
                state.prey += preyCaught;

                if (game.chance(0.25)) {
                    cat.skills.hunting = game.clamp(huntingSkill + 1, 0, 10);
                }

                result = `${cat.name} caught ${preyCaught} prey while hunting.`;
            } else {
                result = `${cat.name} returned from hunting without catching anything.`;
            }
        } else if (activity === "train") {
            const skills = ["hunting", "fighting", "stealth", "agility", "stamina"];
            const skill = game.pick(skills);

            cat.energy = game.clamp(cat.energy - game.rand(8, 15), 0, 100);
            cat.hunger = game.clamp(cat.hunger + game.rand(4, 9), 0, 100);
            cat.experience += game.rand(1, 3);

            if (game.chance(0.45)) {
                cat.skills[skill] = game.clamp((cat.skills[skill] || 1) + 1, 0, 10);
                result = `${cat.name} practiced ${skill} and improved their skill.`;
            } else {
                result = `${cat.name} spent time practicing ${skill}.`;
            }
        } else if (activity === "socialize") {
            const others = game.livingCats().filter(other =>
                other.id !== cat.id && other.age >= 6
            );

            if (others.length === 0) {
                cat.energy = game.clamp(cat.energy + 5, 0, 100);
                return;
            }

            // Prefer friends when choosing a social partner.
            const friends = others.filter(other =>
                game.relationship(cat, other) >= 60
            );

            const other = friends.length > 0 && game.chance(0.70)
                ? game.pick(friends)
                : game.pick(others);

            let change = game.rand(1, 6);

            if (["gentle", "loyal", "playful"].includes(cat.personality)) {
                change += 2;
            }

            const difficultPersonalities = ["stubborn", "proud", "wary"];
            const easygoingPersonalities = ["gentle", "loyal", "playful"];

            let clashChance = 0.10;

            // Rivals are much more likely to clash.
            if (
                cat.relationships.rivals.includes(other.id) ||
                other.relationships.rivals.includes(cat.id)
            ) {
                clashChance += 0.30;
            }

            if (cat.personality !== other.personality) {
                clashChance += 0.15;
            }

            if (difficultPersonalities.includes(cat.personality)) {
                clashChance += 0.15;
            }

            if (difficultPersonalities.includes(other.personality)) {
                clashChance += 0.15;
            }

            if (easygoingPersonalities.includes(cat.personality)) {
                clashChance -= 0.05;
            }

            if (easygoingPersonalities.includes(other.personality)) {
                clashChance -= 0.05;
            }

            clashChance = game.clamp(clashChance, 0.05, 0.70);

            if (game.chance(clashChance)) {
                const areRivals =
                    cat.relationships.rivals.includes(other.id) ||
                    other.relationships.rivals.includes(cat.id);

                if (areRivals) {
                    change = -game.rand(5, 10);
                } else {
                    change = -game.rand(2, 6);
                }
            }

            game.setRelationship(
                cat,
                other,
                game.relationship(cat, other) + change
            );

            // Strong bonds can lead to becoming mates.
            if (
                game.canBecomeNaturalMates(cat, other) &&
                !cat.relationships.mates.includes(other.id) &&
                game.chance(0.10)
            ) {
                if (!cat.relationships.mates.includes(other.id)) {
                    cat.relationships.mates.push(other.id);
                }

                if (!other.relationships.mates.includes(cat.id)) {
                    other.relationships.mates.push(cat.id);
                }

                cat.relationships.crushes =
                    cat.relationships.crushes.filter(id => id !== other.id);

                other.relationships.crushes =
                    other.relationships.crushes.filter(id => id !== cat.id);

                result = `${cat.name} and ${other.name} have become mates!`;

                game.recordCatEvent("became_mates", [cat, other], {
                    importance: 5,
                    description: `${cat.name} and ${other.name} became mates!`
                });
            }

            // Sometimes develop a crush while socializing.
            const attraction = other.sex === "male"
                ? cat.attractionToMales
                : cat.attractionToFemales;

            const crushChance = 0.01 + (attraction / 100) * 0.19;

            if (
                game.canHaveCrush(cat, other) &&
                !cat.relationships.crushes.includes(other.id) &&
                (
                    !cat.relationships.mates.length
                        ? game.chance(crushChance)
                        : game.isProneToOutsideCrushes(cat)
                )
            ) {
                const hadCrush = cat.relationships.crushes.includes(other.id);

                game.addCrush(cat, other);

                if (!hadCrush && cat.relationships.crushes.includes(other.id)) {
                    result = `${cat.name} has started developing feelings for ${other.name}.`;

                    game.logEvent("romance", result);

                    game.recordCatEvent("developed_crush", [cat, other], {
                        importance: 3,
                        description: result
                    });

                    game.showNotice(result);
                }
            }

            cat.energy = game.clamp(cat.energy - 3, 0, 100);
            cat.experience += 1;

            if (!result) {
                const gossip = game.tryGenerateGossip(cat, other);

                if (gossip) {
                    result = gossip;
                } else if (change > 0) {
                    result = `${cat.name} spent time with ${other.name}. Their bond grew closer.`;
                } else {
                    result = `${cat.name} and ${other.name} had a small disagreement.`;
                }
            }

            if (change < 0) {
                game.recordCatEvent("disagreement", [cat, other], {
                    importance: 2,
                    description: `${cat.name} and ${other.name} had a disagreement.`
                });
            } else {
                game.recordCatEvent("friendly_interaction", [cat, other], {
                    importance: 1,
                    description: `${cat.name} and ${other.name} spent time together.`
                });
            }
        } else if (activity === "explore") {
            const locations = game.LOCATIONS.filter(
                loc => loc.id !== "moonpool"
            );
            const location = game.pick(locations);

            cat.energy = game.clamp(cat.energy - game.rand(8, 16), 0, 100);
            cat.hunger = game.clamp(cat.hunger + game.rand(4, 9), 0, 100);
            cat.experience += game.rand(1, 3);

            const curiosity = cat.skills.curiosity || 1;
            const discoveryChance = 0.15 + curiosity * 0.07;

            if (Math.random() < game.clamp(discoveryChance, 0.15, 0.80)) {
                cat.skills.curiosity = game.clamp(curiosity + 1, 0, 10);

                if (location.id === "ruins" && game.chance(0.5)) {
                    state.prey += 1;
                    result = `${cat.name} explored ${location.name} and found something useful, including a piece of prey.`;
                } else {
                    result = `${cat.name} explored ${location.name} and discovered something interesting.`;
                }
            } else if (game.chance(location.risk * 0.08)) {
                const damage = game.rand(2, 8);
                cat.health = game.clamp(cat.health - damage, 0, 100);
                result = `${cat.name} explored ${location.name} and returned with a few scratches (-${damage} health).`;
            } else {
                result = `${cat.name} wandered through ${location.name} and learned the territory a little better.`;
            }
        } else if (activity === "play") {
            cat.energy = game.clamp(cat.energy - game.rand(2, 7), 0, 100);
            cat.hunger = game.clamp(cat.hunger + game.rand(1, 4), 0, 100);
            cat.experience += 1;

            result = `${cat.name} played around camp, pouncing on leaves and chasing shadows.`;
        }

        if (result) {
            cat.notes.push(`Day ${state.day}: ${result}`);

            if (cat.notes.length > 30) {
                cat.notes.shift();
            }

            if (
                activity === "explore" ||
                result.includes("improved") ||
                result.includes("disagreement") ||
                (
                    !result.includes("has started developing feelings") &&
                    game.chance(0.35)
                )
            ) {
                game.logEvent("cat", result);
            }
        }
    }

    return {
        initialize,
        chooseNpcActivity,
        performNpcActivity
    };
})();
