// Module for handling social reactions 
window.SocialReactions = (() => {
    let game = null;

    function initialize(dependencies) {
        game = dependencies;
    }

    // Get relationship information
    function getRelationship(a, b) {
        if (!a || !b) {
            return 0;
        }

        return game.relationship(a, b);
    }

    function areBestFriends(a, b) {
        if (!a || !b) {
            return false;
        }

        return (a.relationships.areBestFriends?.includes(b.id) && b.relationships.areBestFriends?.includes(a.id));
    }

    function areRivals(a, b) {
        if (!a || !b) {
            return false;
        }

        return (a.relationships.areRivals?.includes(b.id) && b.relationships.areRivals?.includes(a.id));
    }

    // Calculate jealousy-admiration
    function calculateReaction(cat, gossip) {
        if (!cat || !gossip || gossip.type !== "crush"){
            return 0;
        }

        const subject = game.cats().find(c => c.id === gossip.subjectId);
        const target = game.cats().find(c => c.id === gossip.targetId);

        if (!subject || !target || cat.id === subject.id) {
            return 0;
        }

        let change = 0;

        const sharesCrush = (cat.relationships?.crushes || []).includes(target.id);
        const besties = areBestFriends(cat, subject);
        const rivals = areRivals(cat, subject);

        // Having feelings for the same cat makes jealousy more likely
        if (sharesCrush) {
            change -= 15;
        }

        // Friendship makes jealousy less likely
        if (besties) {
            change += 10;
        }

        // Rivalry makes jealousy more liekly
        if (rivals) {
            change -= 10;
        }

        // Personality weights
        if (cat.personality === "loyal" && besties) {
            change += 10;
        }

        if (cat.personality === "ambitious") {
            change -=5;
        }

        if (cat.personality === "playful") {
            change += 3;
        }

        return change;
    }

    function reactToGossip(cat, gossip) {
        const change = calculateReaction(cat, gossip);

        if (change === 0) {
            return;
        }

        const subject = game.cats().find(c => c.id === gossip.subjectId);

        if (!subject) {
            return;
        }

        game.adjustJealousyAdmiration(cat, subject, change);
    }

    function reactToInteraction(cat, other, eventType) {
        if(!cat || !other || cat.id === other.id) {
            return;
        }

        if (eventType === "friendly_interaction"){
            change = 4;
            if (["gentle", "loyal", "playful"].includes(cat.personality)) {
                change += 2;
            }
        }

        if (eventType === "disagreement") {
            change = -4;

            if(["stubborn", "proud", "wary"].includes(cat.personality)) {
                change -=2;
            }
        }

        if (change === 0) {
            return;
        }

        game.adjustJealousyAdmiration(cat, other, change);
    }

    // Gradually fade feelings from reaction
    function fadeJealousyAdmiration(cat) {
        if(!cat?.relationships?.jealousyAdmiration) {
            return;
        }

        const feelings = cat.relationships.jealousyAdmiration;

        Object.keys(feelings).forEach(otherCatId => {
            const value = feelings[otherCatId];

            if (typeof value !== "number" || value === 0) {
                return 0;
            }

            const strength = Math.abs(value);

            // Stronger feelings take longer to fade
            let fadeAmount = strength > 60 ? 1 : strength > 20 ? 2 : 3;

            // Personality weights on how quickly feelings fade
            if (cat.personality === "loyal") {
                fadeAmount = Math.max(1, fadeAmount - 1);
            }

            if (cat.personality === "playful") {
                fadeAmount += 1;
            }

            if (value > 0) {
                feelings[otherCatId] = Math.max(0, value - fadeAmount);
            } else {
                feelings[otherCatId] = Math.min(0, value + fadeAmount);
            }
        });
    }

    return {
        initialize,
        calculateReaction,
        reactToGossip,
        reactToInteraction,
        fadeJealousyAdmiration
    };
})();