// Module for handling relationships

window.Relationships = (() => {
    let clamp;
    let shareCrushOnSameCat;
    let recordCatEvent;

    function initialize(dependencies) {
        clamp = dependencies.clamp;
        shareCrushOnSameCat = dependencies.shareCrushOnSameCat;
        recordCatEvent = dependencies.recordCatEvent;
    }

    // Get the relationship score between two cats.
    function relationship(a, b) {
        if (!a || !b || !a.relationships) {
            return 0;
        }

        return a.relationships[b.id] ?? 0;
    }

    function jealousyAdmiration(a, b) {
        // no cats? no relationships? no problem
        if (!a || !b || !a.relationships) {
            return 0;
        }
        return a.relationships.jealousyAdmiration?.[b.id] ?? 0;
    }

    // Update Cat A's feelings towards Cat B
    function setJealousyAdmiration(a, b, value) {
        if (!a || !b) {
            return;
        }

        if (!a.relationships) {
            a.relationships = {};
        }

        if (!a.relationships.jealousyAdmiration || typeof a.relationships.jealousyAdmiration !== "object") {
            a.relationships.jealousyAdmiration = {};
        }

        a.relationships.jealousyAdmiration[b.id] = clamp(value, -100, 100);
    }

    // Adjust score
    function adjustJealousyAdmiration(a, b, amount) {
        if (!a || !b) {
            return;
        }

        const current = jealousyAdmiration(a, b);
        setJealousyAdmiration(a, b, current + amount);
    }

    // Description labels for the jealousy-admiration spectrum
    function jealousyAdmirationLabel(value) {
        if (value <= -61) {
            return "strong jealousy";
        }
        if (value <= -21) {
            return "mild jealousy";
        }
        if (value <= 20) {
            return "neutral";
        }
        if (value <= 60) {
            return "mild admiration";
        }
        return "strong admiration";
    }

    // Convert a relationship score into a readable label.
    function relationshipLabel(value) {
        if (value >= 65) return "close bond";
        if (value >= 25) return "friendly";
        if (value > -20) return "neutral";
        if (value > -60) return "strained";
        return "rivals";
    }

    // Check whether two cats are best friends.
    function areBestFriends(a, b) {
        return relationship(a, b) >= 85 &&
            relationship(b, a) >= 85;
    }

    // Check whether two cats are mutual rivals.
    function areRivals(a, b) {
        return relationship(a, b) <= -60 &&
            relationship(b, a) <= -60;
    }

    // Update best-friend lists when relationships change.
    function updateBestFriendship(a, b) {
        if (!a || !b) {
            return;
        }

        if (!a.relationships) a.relationships = {};
        if (!b.relationships) b.relationships = {};

        if (!Array.isArray(a.relationships.bestFriends)) {
            a.relationships.bestFriends = [];
        }

        if (!Array.isArray(b.relationships.bestFriends)) {
            b.relationships.bestFriends = [];
        }

        const friends = areBestFriends(a, b);

        if (friends) {
            if (!a.relationships.bestFriends.includes(b.id)) {
                a.relationships.bestFriends.push(b.id);
            }

            if (!b.relationships.bestFriends.includes(a.id)) {
                b.relationships.bestFriends.push(a.id);
            }
        } else {
            a.relationships.bestFriends =
                a.relationships.bestFriends.filter(id => id !== b.id);

            b.relationships.bestFriends =
                b.relationships.bestFriends.filter(id => id !== a.id);
        }
    }

    // Update rivalry lists without removing rivalries
    // previously discovered through shared crushes.
    function updateRivalry(a, b) {
        if (!a || !b) {
            return;
        }

        if (!a.relationships) a.relationships = {};
        if (!b.relationships) b.relationships = {};

        if (!Array.isArray(a.relationships.rivals)) {
            a.relationships.rivals = [];
        }

        if (!Array.isArray(b.relationships.rivals)) {
            b.relationships.rivals = [];
        }

        const crushRivalsA = a.relationships.crushRivals || [];
        const crushRivalsB = b.relationships.crushRivals || [];

        const hasCrushRivalry =
            crushRivalsA.includes(b.id) ||
            crushRivalsB.includes(a.id);

        const rivals = areRivals(a, b) || hasCrushRivalry;

        if (rivals) {
            if (!a.relationships.rivals.includes(b.id)) {
                a.relationships.rivals.push(b.id);
            }

            if (!b.relationships.rivals.includes(a.id)) {
                b.relationships.rivals.push(a.id);
            }
        } else {
            a.relationships.rivals =
                a.relationships.rivals.filter(id => id !== b.id);

            b.relationships.rivals =
                b.relationships.rivals.filter(id => id !== a.id);
        }
    }

    // Cats with the same love interest can develop a rivalry
    function createCrushRivalry(a, b, sharedCrush) {
        if (!a || !b || !sharedCrush || a.id === b.id) {
            return false;
        }

        if (!shareCrushOnSameCat(a, b)) {
            return false;
        }

        if (!Array.isArray(a.relationships.rivals)) {
            a.relationships.rivals = [];
        }

        if (!Array.isArray(b.relationships.rivals)) {
            b.relationships.rivals = [];
        }

        if (!Array.isArray(a.relationships.crushRivals)) {
            a.relationships.crushRivals = [];
        }

        if (!Array.isArray(b.relationships.crushRivals)) {
            b.relationships.crushRivals = [];
        }

        // Check whether this pair's crush rivalry was already recorded.
        const alreadyRecorded =
            a.relationships.crushRivals.includes(b.id) &&
            b.relationships.crushRivals.includes(a.id);

        // Remember that these cats have already discovered this shared crush.
        if (!Array.isArray(a.relationships.knownCrushes)) {
            a.relationships.knownCrushes = [];
        }

        if (!Array.isArray(b.relationships.knownCrushes)) {
            b.relationships.knownCrushes = [];
        }

        if (!a.relationships.knownCrushes.includes(sharedCrush.id)) {
            a.relationships.knownCrushes.push(sharedCrush.id);
        }

        if (!b.relationships.knownCrushes.includes(sharedCrush.id)) {
            b.relationships.knownCrushes.push(sharedCrush.id);
        }

        // Ensure the rivalry is mutual.
        if (!a.relationships.rivals.includes(b.id)) {
            a.relationships.rivals.push(b.id);
        }

        if (!b.relationships.rivals.includes(a.id)) {
            b.relationships.rivals.push(a.id);
        }

        // Remember the reason for the rivalry.
        if (!a.relationships.crushRivals.includes(b.id)) {
            a.relationships.crushRivals.push(b.id);
        }

        if (!b.relationships.crushRivals.includes(a.id)) {
            b.relationships.crushRivals.push(a.id);
        }

        // Only record the event the first time.
        if (!alreadyRecorded) {
            recordCatEvent("became_rivals", [a, b], {
                importance: 4,
                description: `${a.name} and ${b.name} became rivals over their shared feelings for ${sharedCrush.name}.`
            });
        }

        return !alreadyRecorded;
    }

    // Set a mutual relationship score and refresh derived lists.
    function setRelationship(a, b, value) {
        if (!a || !b) {
            return;
        }

        if (!a.relationships || typeof a.relationships !== "object") {
            a.relationships = {};
        }

        if (!b.relationships || typeof b.relationships !== "object") {
            b.relationships = {};
        }

        a.relationships[b.id] = clamp(value, -100, 100);
        b.relationships[a.id] = clamp(value, -100, 100);

        updateBestFriendship(a, b);
        updateRivalry(a, b);
    }

    return {
        initialize,
        relationship,
        relationshipLabel,
        areBestFriends,
        areRivals,
        updateBestFriendship,
        updateRivalry,
        createCrushRivalry,
        jealousyAdmiration,
        setJealousyAdmiration,
        adjustJealousyAdmiration,
        jealousyAdmirationLabel,
        setRelationship
    };
})();