window.ClanSocial = (() => {
    let game;

    function initialize(dependencies) {
        game = dependencies;
    }

    function canAct(cat) {
        return cat?.alive && cat.age >= 6 && !cat.quarantined && cat.health >= 35 && cat.energy >= 25;
    }

    function enemies(first, second) {
        return Relationships.enmityWith(first, second) || Relationships.enmityWith(second, first);
    }

    function recent(cat, events, other, days) {
        const day = game.state().day;
        return (cat.memories ?? []).findLast(memory =>
            events.includes(memory.event) && day - memory.day <= days && memory.participants?.includes(other.id));
    }

    function growBond(cat, other, amount, reciprocal = amount) {
        const bond = game.relationship(cat, other);
        const reverse = game.relationship(other, cat);
        Relationships.setRelationship(cat, other, bond + Relationships.routineBondGain(bond, amount),
            reverse + Relationships.routineBondGain(reverse, reciprocal));
    }

    function doFavor(actor, recipient, kind, returning) {
        const state = game.state();
        let description;
        if (kind === "prey") {
            state.prey--;
            recipient.hunger = Math.max(0, recipient.hunger - 8);
            description = `${actor.name} brought ${recipient.name} a piece of fresh-kill.`;
        } else if (kind === "moss") {
            description = `${actor.name} left fresh moss for ${recipient.name} at the medicine cat's den.`;
        } else {
            description = `${actor.name} made room for ${recipient.name} in a sheltered spot in camp.`;
        }
        actor.energy -= 2;
        growBond(recipient, actor, 4, 1);
        game.remember("clan_favor", [actor, recipient], {
            description, importance: 2, giverId: actor.id, returnedFavor: returning
        });
    }

    function favors(excluded) {
        const state = game.state();
        if (state.campRestDay === state.day || !game.chance(.55)) return;
        const cats = game.cats();
        const candidates = [];
        for (const actor of cats) {
            if (!canAct(actor) || excluded.has(actor) || actor.id === state.playerCatId ||
                actor.memories?.some(memory => memory.event === "clan_favor" &&
                    memory.giverId === actor.id && state.day - memory.day < 3)) continue;
            for (const recipient of cats) {
                if (actor === recipient || enemies(actor, recipient)) continue;
                const bond = game.relationship(actor, recipient);
                const previous = recent(actor, ["clan_favor"], recipient, 9);
                const returning = previous?.giverId === recipient.id && !previous.returnedFavor && state.day - previous.day >= 2;
                if (previous && !returning) continue;
                const helpful = ["gentle", "loyal", "helpful"].includes(actor.personality);
                if (bond < (helpful ? 10 : 30) && !returning) continue;
                const kind = recipient.quarantined || recipient.health < 60 ? "moss" :
                    recipient.hunger >= 45 && state.prey > Math.max(5, game.expectedMeals()) ? "prey" :
                        recipient.energy < 35 || returning ? "shelter" : null;
                if (kind) candidates.push({
                    actor, recipient, kind, returning,
                    score: (returning ? 20 : 0) + (helpful ? 10 : 0) + bond / 8 + game.rand(0, 16)
                });
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        const choice = candidates[0];
        if (choice) doFavor(choice.actor, choice.recipient, choice.kind, choice.returning);
    }

    function formerMentor(cat, other) {
        return cat.rank !== "Apprentice" && cat.mentorId === other.id;
    }

    function routineFor(cat, other) {
        if (enemies(cat, other)) return null;
        if (formerMentor(cat, other) || formerMentor(other, cat)) return "mentor";
        if (game.relationship(cat, other) < 30 || game.relationship(other, cat) < 25) return null;
        const day = game.state().day;
        const sharedDays = new Set((cat.memories ?? []).filter(memory =>
            ["friendly_interaction", "clan_favor", "clan_routine"].includes(memory.event) &&
            memory.day >= day - 24 && memory.participants?.includes(other.id)).map(memory => memory.day));
        return sharedDays.size >= 2 || cat.relationships.bestFriends?.includes(other.id) ? "friends" : null;
    }

    function routineCompany(cat, company) {
        const interests = company.filter(other => !enemies(cat, other) &&
            (cat.relationships.crushes?.includes(other.id) || cat.relationships.mates?.includes(other.id)));
        if (interests.length && game.chance(.32)) {
            return interests[game.rand(0, interests.length - 1)];
        }
        const familiar = company.filter(other =>
            routineFor(cat, other) && !recent(cat, ["clan_routine"], other, 6));
        if (familiar.length && game.chance(.40)) {
            return familiar[game.rand(0, familiar.length - 1)];
        }
        return null;
    }

    function rememberRoutine(cat, other) {
        const routine = routineFor(cat, other);
        if (!routine || recent(cat, ["clan_routine"], other, 6)) return "";
        const pupil = formerMentor(cat, other) ? cat : other;
        const mentor = pupil === cat ? other : cat;
        const description = routine === "mentor"
            ? `${pupil.name} sought advice from their former mentor, ${mentor.name}.`
            : `${cat.name} and ${other.name} spent time in their usual spot in the shade.`;
        game.remember("clan_routine", [cat, other], { description, importance: 2 });
        return description;
    }

    function romanceMoment(cat, other) {
        if (cat.age < 12 || other.age < 12 || enemies(cat, other) ||
            recent(cat, ["mate_affection", "mate_repair", "courtship_moment", "former_mates_worked_together"], other, 6)) return "";
        const day = game.state().day;
        if (cat.relationships.mates?.includes(other.id) && other.relationships.mates?.includes(cat.id)) {
            const madeUp = !!recent(cat, ["disagreement"], other, 4);
            const description = madeUp ? `${cat.name} and ${other.name} found a quiet moment to talk through their disagreement.` :
                `${cat.name} made time for ${other.name} after a long day at camp.`;
            growBond(cat, other, 2);
            game.remember(madeUp ? "mate_repair" : "mate_affection", [cat, other], { description, importance: 3 });
            return description;
        }
        const separation = recent(cat, ["mates_separated"], other, 90);
        if (separation && day - separation.day < 7) return "";
        if (cat.relationships.crushes?.includes(other.id)) {
            game.rememberEvent(cat, "courtship_moment", {
                description: `${cat.name} looked for a chance to spend a little longer with ${other.name}.`,
                privateOwnerId: cat.id, participants: [other.id], importance: 2
            });
        } else if (separation) {
            const description = `${cat.name} and ${other.name} tidied the camp together. It felt a little easier to be around each other.`;
            game.remember("former_mates_worked_together", [cat, other], { description, importance: 2 });
            return description;
        }
        return "";
    }

    function offerGriefSupport(excluded) {
        const state = game.state();
        const cats = game.cats();
        for (const mourner of cats) {
            if (mourner.quarantined || state.day < mourner.griefStartsDay || !(mourner.griefUntilDay > state.day) ||
                mourner.memories?.some(memory => memory.event === "grief_support" &&
                    memory.mournerId === mourner.id && state.day - memory.day < 3)) continue;
            const loss = mourner.memories?.findLast(memory => memory.event === "clan_loss");
            const lossId = loss?.participants?.[0];
            if (!lossId) continue;
            const options = cats.filter(cat => cat !== mourner && cat.id !== state.playerCatId &&
                canAct(cat) && !excluded.has(cat) && !enemies(cat, mourner) &&
                !recent(mourner, ["grief_support"], cat, 7)).map(cat => {
                const shared = cat.memories?.some(memory =>
                    memory.event === "clan_loss" && memory.participants?.includes(lossId));
                return { cat, shared, bond: game.relationship(mourner, cat) };
            }).filter(({ cat, shared, bond }) => shared || bond >= 40 ||
                (bond >= 15 && ["gentle", "loyal", "helpful"].includes(cat.personality)));
            options.sort((a, b) => b.bond - a.bond || Number(b.shared) - Number(a.shared));
            if (!options.length) continue;

            const { cat, shared, bond } = options[0];
            const wantsSpace = ["wary", "proud"].includes(mourner.personality) && bond < 50 && !shared;
            const departed = state.starClan?.find(cat => cat.id === lossId)?.name ?? "the clanmate they lost";
            const description = wantsSpace ? `${cat.name} offered to sit with ${mourner.name} and gave them space when they asked for it.` :
                shared ? `${cat.name} and ${mourner.name} shared a memory of ${departed}.` :
                    `${cat.name} kept ${mourner.name} company while they grieved for ${departed}.`;
            if (!wantsSpace) growBond(mourner, cat, shared ? 5 : 4, 2);
            game.remember("grief_support", [mourner, cat], {
                description, importance: shared ? 4 : 3, mournerId: mourner.id, lossId,
                logToChronicle: shared
            });
            excluded.add(cat);
            return true;
        }
        return false;
    }

    function startFoodDispute(unfed, fed) {
        const state = game.state();
        if (state.campDispute || state.day - (state.lastCampDisputeDay ?? -20) < 10 ||
            !unfed.length || !fed.length || !game.chance(.16)) return;
        const complainant = unfed.find(cat => canAct(cat) && cat.id !== state.playerCatId &&
            ["bold", "proud", "stubborn"].includes(cat.personality));
        if (!complainant) return;
        const other = fed.filter(cat => cat.age >= 6 && !cat.quarantined && !enemies(cat, complainant) &&
            game.relationship(complainant, cat) < 45).sort((a, b) =>
            game.relationship(complainant, a) - game.relationship(complainant, b))[0];
        if (!other) return;
        const id = `fresh-kill:${state.day}:${complainant.id}:${other.id}`;
        state.campDispute = { id, day: state.day, complainantId: complainant.id, otherId: other.id };
        state.lastCampDisputeDay = state.day;
        Relationships.recordGrievance(other, complainant, "fresh_kill_dispute", id, state.day);
        const description = `${complainant.name} challenged ${other.name} over how the fresh-kill was shared after several cats went hungry.`;
        game.remember("clan_disagreement", [complainant, other], { description, importance: 3, logToChronicle: true });
    }

    function settleFoodDispute(excluded) {
        const state = game.state();
        const dispute = state.campDispute;
        if (!dispute || state.day <= dispute.day) return false;
        const cats = game.cats();
        const complainant = cats.find(cat => cat.id === dispute.complainantId);
        const other = cats.find(cat => cat.id === dispute.otherId);
        if (!complainant || !other || state.day - dispute.day > 6 ||
            !Relationships.enmityWith(other, complainant)?.grievances.some(entry => entry.incidentId === dispute.id)) {
            delete state.campDispute;
            return false;
        }
        if (complainant.quarantined || other.quarantined) return false;
        const bystanders = cats.filter(cat => cat !== complainant && cat !== other && cat.id !== state.playerCatId &&
            canAct(cat) && !excluded.has(cat));
        const mediator = bystanders.find(cat => ["gentle", "patient", "helpful", "observant"].includes(cat.personality) &&
            game.relationship(complainant, cat) >= 25 && game.relationship(other, cat) >= 25);
        if (mediator) return resolveFoodDispute(dispute, complainant, other, mediator);
        const official = state.day - dispute.day >= 2 && bystanders.find(cat =>
            ["Deputy", "Leader"].includes(cat.rank) && !enemies(cat, complainant) && !enemies(cat, other));
        if (official) return resolveFoodDispute(dispute, complainant, other, official);

        const supporter = bystanders.find(cat => cat.personality === "loyal" &&
            !dispute.supporterId && Math.max(game.relationship(cat, other), game.relationship(cat, complainant)) >= 60);
        if (!supporter) return false;
        const backed = game.relationship(supporter, other) >= game.relationship(supporter, complainant) ? other : complainant;
        dispute.supporterId = supporter.id;
        growBond(backed, supporter, 4, 1);
        game.remember("stood_up_for_clanmate", [backed, supporter], {
            description: `${supporter.name} stood by ${backed.name} after the argument over fresh-kill.`, importance: 3
        });
        return true;
    }

    function resolveFoodDispute(dispute, complainant, other, mediator) {
        if (!Relationships.resolveGrievance(other, complainant, dispute.id)) return false;
        delete game.state().campDispute;
        growBond(other, complainant, 4, 2);
        growBond(other, mediator, 4, 1);
        growBond(complainant, mediator, 4, 1);
        game.remember("clan_dispute_mediated", [complainant, other, mediator], {
            description: `${mediator.name} heard both sides of the fresh-kill dispute. ${complainant.name} and ${other.name} agreed to move on.`,
            importance: 3, logToChronicle: true
        });
        return true;
    }

    function revisitGrievance(excluded) {
        const state = game.state();
        if (!game.chance(.25)) return false;
        const cats = game.cats();
        for (const actor of cats) {
            if (!canAct(actor) || excluded.has(actor) || actor.id === state.playerCatId ||
                !["gentle", "loyal", "helpful", "patient"].includes(actor.personality)) continue;
            const offended = cats.find(cat => cat !== actor && !cat.quarantined && game.relationship(actor, cat) >= 25 &&
                Relationships.enmityWith(cat, actor)?.grievances.some(grievance =>
                    !grievance.privateOwnerId && ["public_insult", "unfair_accusation"].includes(grievance.cause) &&
                    state.day - grievance.day >= 2 && state.day - grievance.day <= 14) &&
                !recent(actor, ["made_amends"], cat, 7));
            if (!offended) continue;
            const grievance = Relationships.enmityWith(offended, actor).grievances.find(entry =>
                !entry.privateOwnerId && ["public_insult", "unfair_accusation"].includes(entry.cause) &&
                state.day - entry.day >= 2 && state.day - entry.day <= 14);
            const accepts = offended.id !== state.playerCatId && game.relationship(offended, actor) >= 25 &&
                (offended.personality !== "stubborn" || game.relationship(offended, actor) >= 60);
            if (accepts) {
                Relationships.resolveGrievance(offended, actor, grievance.incidentId);
                growBond(offended, actor, 4, 2);
            }
            game.remember("made_amends", [actor, offended], {
                description: accepts ? `${actor.name} apologized to ${offended.name}, who accepted.` :
                    `${actor.name} offered ${offended.name} an apology for their earlier dispute.`,
                importance: 3
            });
            return true;
        }
        return false;
    }

    function respondToGossip(excluded) {
        const state = game.state();
        const cats = game.cats();
        for (const listener of cats) {
            if (!canAct(listener) || listener.id === state.playerCatId || excluded.has(listener) ||
                !["curious", "observant", "loyal", "proud"].includes(listener.personality)) continue;
            const report = Gossip.getKnownGossip(listener).find(item => item.type === "crush" &&
                state.day > item.heardDay && state.day - item.heardDay <= 7 && item.followedUpDay == null);
            if (!report) continue;
            const subject = cats.find(cat => cat.id === report.subjectId && !cat.quarantined);
            if (!subject) continue;

            let companion = subject;
            let description;
            if (listener.personality === "curious") {
                companion = cats.find(cat => cat !== listener && cat.id !== report.heardWithId && !cat.quarantined &&
                    Gossip.knowsGossip(cat, report));
                if (!companion) continue;
                description = `${listener.name} privately compared what they had heard about ${subject.name} with ${companion.name}.`;
            } else if (listener.personality === "observant") {
                const confirmed = subject.id !== state.playerCatId && game.relationship(subject, listener) >= 55 &&
                    subject.relationships.crushes?.includes(report.targetId);
                description = confirmed ? `${subject.name} privately confirmed the rumor to ${listener.name}.` :
                    `${listener.name} asked ${subject.name} about the rumor and came away without an answer.`;
            } else if (listener.personality === "loyal") {
                if (enemies(listener, subject)) continue;
                description = `${listener.name} quietly told ${subject.name} that others had been talking about them.`;
                growBond(subject, listener, 4, 1);
                game.rememberEvent(subject, "warned_about_gossip", {
                    description, participants: [listener.id], importance: 3, privateOwnerId: subject.id
                });
            } else {
                companion = cats.find(cat => cat.id === report.heardWithId && !cat.quarantined);
                if (!companion) continue;
                description = `${listener.name} told ${companion.name} to stop repeating the rumor about ${subject.name}.`;
            }
            report.followedUpDay = state.day;
            game.rememberEvent(listener, "followed_up_on_gossip", {
                description, participants: [...new Set([subject.id, companion.id])],
                importance: 3, privateOwnerId: listener.id
            });
            return true;
        }
        return false;
    }

    function checkOnTraining(excluded) {
        const state = game.state();
        if (state.campRestDay === state.day || !game.chance(.25)) return false;
        const cats = game.cats();
        const official = cats.find(cat => ["Deputy", "Leader"].includes(cat.rank) && canAct(cat) &&
            cat.id !== state.playerCatId && !excluded.has(cat));
        if (!official) return false;
        const apprentice = cats.find(cat => cat.rank === "Apprentice" && !cat.quarantined &&
            cat.mentorId !== official.id && !cat.memories?.some(memory =>
                memory.event === "training_check_in" && state.day - memory.day < 12) &&
            cats.some(mentor => mentor.id === cat.mentorId &&
                (game.relationship(cat, mentor) <= -15 ||
                    recent(cat, ["disagreement", "clan_disagreement"], mentor, 6))));
        if (!apprentice) return false;
        growBond(apprentice, official, 4, 1);
        game.remember("training_check_in", [official, apprentice], {
            description: `${official.name} asked ${apprentice.name} how training had been going and offered to help if they needed it.`,
            importance: 3
        });
        return true;
    }

    function daily(excluded) {
        if (offerGriefSupport(excluded) || settleFoodDispute(excluded) || revisitGrievance(excluded) ||
            respondToGossip(excluded) || checkOnTraining(excluded)) return;
        favors(excluded);
    }

    function patrolUnderstanding(cat, other) {
        return recent(cat, ["patrol_understanding"], other, 12);
    }

    function successfulPatrol(patrol) {
        const cats = [...new Set(patrol)].filter(cat => cat.alive);
        const day = game.state().day;
        for (const [index, first] of cats.entries()) {
            for (const second of cats.slice(index + 1)) {
                const rivals = Relationships.rivalriesWith(first, second).length || Relationships.rivalriesWith(second, first).length;
                if (!rivals || patrolUnderstanding(first, second)) continue;
                const previous = recent(first, ["patrolled_with_rival"], second, 12);
                if (previous?.day === day) continue;
                const description = previous
                    ? `${first.name} and ${second.name} agreed to put their rivalry aside while on patrol.`
                    : `${first.name} and ${second.name} worked together despite their rivalry.`;
                game.remember(previous ? "patrol_understanding" : "patrolled_with_rival", [first, second], {
                    description, importance: previous ? 3 : 2, logToChronicle: !!previous
                });
            }
        }
    }

    function patrolPreference(cat, team) {
        const familiarity = Math.max(0, ...team.map(other => {
            if (enemies(cat, other)) return 0;
            if (patrolUnderstanding(cat, other)) return 2;
            return routineFor(cat, other) || recent(cat, ["grief_support", "clan_favor"], other, 12) ? 1 : 0;
        }));
        const strainedTeam = team.some((first, index) => team.slice(index + 1).some(second => enemies(first, second)));
        const steadiesTeam = strainedTeam && ["patient", "gentle", "loyal"].includes(cat.personality) &&
            team.every(other => !enemies(cat, other) && game.relationship(other, cat) >= 25);
        return Math.max(familiarity, steadiesTeam ? 2 : 0);
    }

    function givePatrolRelief(leader, patrol, candidates) {
        const state = game.state();
        if (!canAct(leader) || state.day - (state.lastPatrolReliefDay ?? -10) < 5) return patrol;
        const mourner = patrol.find(cat => cat !== leader && cat.griefUntilDay > state.day &&
            state.day >= (cat.griefStartsDay ?? 0));
        if (!mourner) return patrol;
        const volunteer = candidates.find(cat => !patrol.includes(cat) && canAct(cat) &&
            !(cat.griefUntilDay > state.day) && !enemies(cat, mourner) &&
            ["loyal", "helpful", "bold"].includes(cat.personality) &&
            ["hunting", "agility", "stealth"].every(skill => game.skill(cat, skill) >= game.skill(mourner, skill)));
        if (!volunteer) return patrol;
        state.lastPatrolReliefDay = state.day;
        volunteer.respect = Math.min(100, (volunteer.respect ?? 50) + 2);
        mourner.energy = Math.min(100, mourner.energy + 6);
        game.remember("covered_patrol_duty", [leader, volunteer, mourner], {
            description: `${volunteer.name} volunteered to take ${mourner.name}'s place on the patrol so they could rest. ${leader.name} agreed.`,
            importance: 3, logToChronicle: true
        });
        return patrol.map(cat => cat === mourner ? volunteer : cat);
    }

    return { initialize, daily, startFoodDispute, routineCompany, rememberRoutine, romanceMoment,
        successfulPatrol, patrolUnderstanding, patrolPreference, givePatrolRelief };
})();
