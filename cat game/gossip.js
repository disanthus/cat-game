// Module for handling gossip
window.Gossip = (() => {
    let game = null;

    // Create standard gossip definitions
    const gossipTypes = {
        crush: {
            description: "A cat has feelings for another cat.",
            importance: 2
        }
    };

    function initialize(dependencies) {
        game = dependencies;
    }

    // Looks up a gossip type by its name.
    // Good for inspecting a whole category of gossip
    function getGossipType(type) {
        return gossipTypes[type] || null;
    }
    
    // Checks whether a cat knows any gossip about a subject.
    function knowsAboutSubject(cat, subjectId, type = null) {
        const gossip = getKnownGossip(cat).filter(item =>
            item.subjectId === subjectId
        );

        if (type === null) {
            return gossip.length > 0;
        }

        return gossip.some(item => item.type === type);
    }

    // Checks whether a gossip type is validated.
    function isValidGossipType(type) {
        return Object.prototype.hasOwnProperty.call(gossipTypes, type);
    }

    // Gets the importance of a gossip type.
    function getGossipImportance(type) {
        const gossip = getGossipType(type);
        return gossip ? gossip.importance : 1;
    }

    // Gets the description of a gossip type.
    function getGossipDescription(type) {
        const gossip = getGossipType(type);
        return gossip ? gossip.description : "Unknown gossip.";
    }

    // Creates a standardized gossip record.
    function createGossip(type, subjectId, targetId = null) {
        const definition = getGossipType(type);

        if (!definition) {
            return null;
        }

        return {
            type,
            subjectId,
            targetId,
            importance: definition.importance,
            description: definition.description
        };
    }

    // Checks whether a cat already knows a specific rumor.
    // Best for checking one individual piece of gossip
    function knowsGossip(cat, gossip) {
        if (!cat || !gossip) return false;

        const known = cat.relationships?.knownGossip || [];

        return known.some(item =>
            item.type === gossip.type &&
            item.subjectId === gossip.subjectId &&
            item.targetId === gossip.targetId
        );
    }

    // Retrieve all gossip known by a cat.
    function getKnownGossip(cat) {
        if (!cat || !cat.relationships) {
            return [];
        }

        if (!Array.isArray(cat.relationships.knownGossip)) {
            return [];
        }

        return [...cat.relationships.knownGossip];
    }

    // Records standardized gossip without adding duplicates.
    // Rejects invalid gossip types
    function recordGossip(cat, gossip) {
        if (
            !cat ||
            !gossip ||
            !isValidGossipType(gossip.type)
        ) {
            return false;
        }

        if (!cat.relationships) {
            cat.relationships = {};
        }

        if (!Array.isArray(cat.relationships.knownGossip)) {
            cat.relationships.knownGossip = [];
        }

        if (knowsGossip(cat, gossip)) {
            return false;
        }

        const record = createGossip(
            gossip.type,
            gossip.subjectId,
            gossip.targetId
        );

        if (!record) {
            return false;
        }

        cat.relationships.knownGossip.push(record);
        return true;
    }

    return {
        initialize,
        getGossipType,
        knowsAboutSubject,
        isValidGossipType,
        getGossipImportance,
        getGossipDescription,
        getKnownGossip,
        createGossip,
        knowsGossip,
        recordGossip
    };
})();
