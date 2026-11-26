// Module for handling relationships

window.Relationships = (() => {
    let clamp;

    function initialize(dependencies) {
        clamp = dependencies.clamp;
    }

    // Get the relationship score between two cats.
    function relationship(a, b) {
        if (!a || !b || !a.relationships) {
            return 0;
        }

        return a.relationships[b.id] ?? 0;
    }

    function trustToward(cat, other) {
        const ties = cat.relationships;
        return ties?.trustByCat?.[other.id] ?? ties?.mateConcerns?.[other.id]?.trust ??
            (ties?.mates?.includes(other.id) ? cat.trust ?? 50 : 50);
    }

    function adjustTrust(cat, other, amount) {
        const trust = clamp(trustToward(cat, other) + amount, 0, 100);
        const ties = cat.relationships ??= {};
        (ties.trustByCat ??= {})[other.id] = trust;
        return trust;
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
        return "very strained";
    }

    function routineBondGain(bond, gain) {
        if (bond >= 85) return Math.min(1, Math.floor(gain / 4));
        if (bond >= 60) return Math.min(2, Math.floor(gain / 2));
        return gain;
    }

    // Check whether two cats are best friends.
    function areBestFriends(a, b) {
        return relationship(a, b) >= 85 &&
            relationship(b, a) >= 85;
    }

    function conflictWith(cat, other) {
        return cat?.relationships?.conflicts?.[other?.id];
    }

    function rivalriesWith(cat, other) {
        return Object.values(conflictWith(cat, other)?.rivalries ?? {});
    }

    function enmityWith(cat, other) {
        return conflictWith(cat, other)?.enmity;
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

    function ensureConflict(cat, other) {
        return (cat.relationships.conflicts ??= {})[other.id] ??= { rivalries: {} };
    }

    function removeEmptyConflict(cat, other) {
        const entry = conflictWith(cat, other);
        if (entry && !entry.enmity && !Object.keys(entry.rivalries).length) {
            delete cat.relationships.conflicts[other.id];
        }
    }

    function clearRivalries(cat, other) {
        const entry = conflictWith(cat, other);
        if (!entry) return;
        entry.rivalries = {};
        removeEmptyConflict(cat, other);
    }

    function clearEnmity(cat, other) {
        const entry = conflictWith(cat, other);
        if (!entry) return;
        delete entry.enmity;
        removeEmptyConflict(cat, other);
    }

    function startRivalry(cat, other, kind, goalId, day) {
        if (!cat?.alive || !other?.alive || cat.id === other.id) return false;
        const key = `${kind}:${goalId}`;
        const rivalries = ensureConflict(cat, other).rivalries;
        if (rivalries[key]) return false;
        rivalries[key] = { kind, goalId, intensity: 1, lastEventDay: day };
        return true;
    }

    function adjustRivalry(cat, other, rivalry, amount, day) {
        const rivalries = conflictWith(cat, other)?.rivalries;
        const key = `${rivalry.kind}:${rivalry.goalId}`;
        if (rivalries?.[key] !== rivalry) return false;
        rivalry.intensity = clamp(rivalry.intensity + amount, 0, 3);
        rivalry.lastEventDay = day;
        if (rivalry.intensity > 0) return false;
        delete rivalries[key];
        removeEmptyConflict(cat, other);
        return true;
    }

    function recordGrievance(cat, other, cause, incidentId, day, { strength = 1, privateOwnerId = null } = {}) {
        if (!cat?.alive || !other?.alive || cat.id === other.id) return false;
        const entry = ensureConflict(cat, other);
        if (entry.enmity?.grievances.some(grievance => grievance.incidentId === incidentId)) return false;
        const enmity = entry.enmity ??= { distrust: 0, grievances: [] };
        enmity.distrust = clamp(enmity.distrust + strength, 1, 3);
        enmity.grievances.push({ cause, incidentId, day, strength, privateOwnerId });
        return true;
    }

    function resolveGrievance(cat, other, incidentId) {
        const enmity = enmityWith(cat, other);
        const grievance = enmity?.grievances.find(entry => entry.incidentId === incidentId);
        if (!grievance) return false;
        enmity.grievances = enmity.grievances.filter(entry => entry !== grievance);
        if (enmity.grievances.length) {
            enmity.distrust = Math.max(1, enmity.distrust - grievance.strength);
        } else {
            delete conflictWith(cat, other).enmity;
            removeEmptyConflict(cat, other);
        }
        return true;
    }

    function easeDistrust(cat, other) {
        const enmity = enmityWith(cat, other);
        if (!enmity || --enmity.distrust > 0) return false;
        delete conflictWith(cat, other).enmity;
        removeEmptyConflict(cat, other);
        return true;
    }

    function rivalryGoalIsActive(cat, other, rivalry, livingById) {
        const goal = livingById.get(rivalry.goalId);
        if (rivalry.kind === "shared_crush") {
            return goal && cat.relationships.crushes?.includes(goal.id) && other.relationships.crushes?.includes(goal.id);
        }
        return goal && cat.rank === "Apprentice" && other.rank === "Apprentice" &&
            cat.mentorId === goal.id && other.mentorId === goal.id;
    }

    function refreshRivalries(cats, historyCats = cats) {
        const livingById = new Map(cats.map(cat => [cat.id, cat]));
        const historyById = new Map(historyCats.map(cat => [cat.id, cat]));
        for (const cat of cats) {
            for (const [otherId, entry] of Object.entries(cat.relationships.conflicts ?? {})) {
                const other = historyById.get(otherId);
                if (!other) {
                    delete cat.relationships.conflicts[otherId];
                    continue;
                }
                // Keep a deceased clanmate's relationship as it was at their death.
                if (!other.alive) continue;
                for (const [key, rivalry] of Object.entries(entry.rivalries)) {
                    if (!rivalryGoalIsActive(cat, other, rivalry, livingById)) delete entry.rivalries[key];
                }
                removeEmptyConflict(cat, other);
            }
        }
    }

    function migrateLegacyRivalries(cats, day) {
        const catsById = new Map(cats.map(cat => [cat.id, cat]));
        for (const cat of cats) {
            const rels = cat.relationships;
            const targetsByRival = rels.crushRivalTargets ?? {};
            const legacyRivals = Array.isArray(rels.crushRivals) ? rels.crushRivals : [];
            const rivalIds = new Set([...legacyRivals, ...Object.keys(targetsByRival)]);
            for (const rivalId of rivalIds) {
                const rival = catsById.get(rivalId);
                if (!rival || rival === cat) continue;
                for (const targetId of targetsByRival[rivalId] ?? rels.crushes ?? []) {
                    if (!rels.crushes?.includes(targetId) || !rival.relationships.crushes?.includes(targetId)) continue;
                    const rivalries = ensureConflict(cat, rival).rivalries;
                    rivalries[`shared_crush:${targetId}`] ??= {
                        kind: "shared_crush", goalId: targetId, intensity: 1, lastEventDay: day
                    };
                }
            }
            delete rels.rivals;
            delete rels.crushRivals;
            delete rels.crushRivalTargets;
        }
    }

    // Set both relationship scores and refresh derived lists.
    function setRelationship(a, b, value, reciprocalValue = value) {
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
        b.relationships[a.id] = clamp(reciprocalValue, -100, 100);

        updateBestFriendship(a, b);
    }

    function strengthenPatrolBonds(patrol) {
        const survivors = [...new Set(patrol)].filter(cat => cat.alive);
        for (const [index, first] of survivors.entries()) {
            for (const second of survivors.slice(index + 1)) {
                if (enmityWith(first, second) || enmityWith(second, first)) continue;
                setRelationship(first, second, relationship(first, second) + 1, relationship(second, first) + 1);
            }
        }
    }

    return {
        initialize,
        relationship,
        trustToward,
        adjustTrust,
        relationshipLabel,
        routineBondGain,
        strengthenPatrolBonds,
        areBestFriends,
        updateBestFriendship,
        rivalriesWith,
        enmityWith,
        clearRivalries,
        clearEnmity,
        startRivalry,
        adjustRivalry,
        recordGrievance,
        resolveGrievance,
        easeDistrust,
        refreshRivalries,
        migrateLegacyRivalries,
        jealousyAdmiration,
        setJealousyAdmiration,
        adjustJealousyAdmiration,
        jealousyAdmirationLabel,
        setRelationship
    };
})();
