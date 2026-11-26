window.DeathberryIncidents = (() => {
    let game;
    const reviewDays = 8;
    const supervisionDays = 7;

    function initialize(dependencies) {
        game = dependencies;
    }

    function incidents() {
        return Object.values(game.state().deathberryIncidents ?? {});
    }

    function adjust(cat, stat, amount) {
        cat[stat] = game.clamp((cat[stat] ?? 50) + amount, 0, 100);
    }

    function privateMemory(cat, event, incident, description, importance = 4) {
        game.rememberEvent(cat, event, {
            description, importance, incidentId: incident.id, privateOwnerId: cat.id,
            participants: [incident.patientId, incident.healerId].filter(id => id !== cat.id)
        });
    }

    function trained(cat) {
        return cat.rank === "Medicine Cat" || (cat.rank === "Apprentice" && cat.medicineTrack);
    }

    function eligible(healer, patient) {
        const state = game.state();
        return healer?.alive && healer.id === state.playerCatId && healer.rank === "Medicine Cat" &&
            healer.health >= 35 && !healer.quarantined && patient?.alive && patient !== healer &&
            game.needsIsolation(patient) && healer.lastTreatmentDay !== state.day &&
            healer.deathberryCache > 0 && !oversight(healer);
    }

    function severeDiagnosed(patient) {
        return (patient.conditions ?? []).some(condition => condition.severity === "severe" &&
            condition.stageDay <= game.state().day && condition.diagnosedSeverity === condition.severity &&
            condition.diagnosedStageDay === condition.stageDay);
    }

    function canAskWishes(healer, patient) {
        return healer !== patient && patient.age >= 6 && healer.health >= 35 && !healer.quarantined &&
            severeDiagnosed(patient) && !patient.careWishes?.[healer.id];
    }

    function askWishes(healer, patient) {
        if (!canAskWishes(healer, patient)) return;
        game.scene("A Quiet Moment in the Den", `${healer.name} sits beside ${patient.name} and asks what they need.`,
            healer, [{ id: "listen", text: "Listen to their wishes" }, { id: "wait", text: "Give them some space" }], choice => {
                if (choice !== "listen") return;
                const open = game.relationship(patient, healer) >= 25;
                const wantsRelief = open && game.chance(["bold", "proud", "independent"].includes(patient.personality) ? .55 : .3);
                const words = wantsRelief ? "said that if their suffering could not be eased, they wanted it to end" :
                    open ? "asked for rest and continued care" : "wasn't ready to talk about their wishes";
                const description = `${patient.name} ${words}.`;
                (patient.careWishes ??= {})[healer.id] = { day: game.state().day, wantsRelief };
                game.rememberEvent(healer, "heard_a_patients_wishes", {
                    description, importance: 4, privateOwnerId: healer.id, participants: [patient.id]
                });
                return description;
            });
    }

    function concern(incident, cat) {
        return incident.concerns[cat.id] ??= { suspicion: 0, heard: {} };
    }

    function hear(incident, listener, sourceId) {
        const account = incident.accounts[sourceId];
        const entry = concern(incident, listener);
        if (entry.heard[sourceId] >= account.weight) return false;

        entry.suspicion = Math.min(5, entry.suspicion + account.weight - (entry.heard[sourceId] ?? 0));
        entry.heard[sourceId] = account.weight;
        if (!incident.dormant || account.direct) {
            incident.reviewUntil = game.state().day + reviewDays;
            incident.dormant = false;
        }
        recordHealerRequest(incident, listener);
        return true;
    }

    function observe(incident, witness, observation, weight, direct = false) {
        incident.accounts[witness.id] = { observation, weight, direct };
        hear(incident, witness, witness.id);
        if (weight >= 2) privateMemory(witness, "medicine_den_witness", incident, observation);
    }

    function closeLossTie(cat, patient) {
        if (!patient) return null;
        if (cat.relationships.mates?.includes(patient.id) || patient.relationships.mates?.includes(cat.id) ||
            game.areCloseRelatives(cat, patient)) return "family";
        if (cat.relationships.bestFriends?.includes(patient.id) || patient.relationships.bestFriends?.includes(cat.id)) {
            return "bestFriend";
        }
        return null;
    }

    function start(healer, patient, motive) {
        if (!eligible(healer, patient) || (motive === "mercy" && !severeDiagnosed(patient))) return;

        const state = game.state();
        const mourners = game.cats().filter(cat => cat !== patient && cat !== healer && (
            closeLossTie(cat, patient) || game.relationship(cat, patient) >= 65 ||
            cat.mentorId === patient.id || patient.mentorId === cat.id
        )).sort((a, b) => game.relationship(b, patient) - game.relationship(a, patient));
        const incident = {
            id: `deathberry:${patient.id}`, day: state.day, healerId: healer.id, healerName: healer.name,
            patientId: patient.id, patientName: patient.name, motive,
            requestedRelief: !!patient.careWishes?.[healer.id]?.wantsRelief,
            reviewUntil: state.day + reviewDays, concerns: {}, accounts: {}, aftermath: {},
            mourners: mourners.map(cat => cat.id),
            mournerTies: Object.fromEntries(mourners.map(cat => [cat.id, closeLossTie(cat, patient)]))
        };
        (state.deathberryIncidents ??= {})[incident.id] = incident;
        healer.deathberryCache--;
        healer.lastTreatmentDay = state.day;
        const reason = { mercy: "to end their suffering", grudge: "to settle a grudge", silent: "without telling anyone why" };
        privateMemory(healer, "gave_a_deathberry", incident,
            `${healer.name} gave ${patient.name} a deathberry ${reason[motive]}.`, 5);

        const apprentice = game.apprentice(healer);
        const available = game.cats().filter(cat => cat !== healer && cat !== patient && cat.rank !== "Kit" &&
            !cat.quarantined && cat.health >= 35);
        const witness = available.includes(apprentice) && game.chance(.45) ? apprentice :
            game.chance(.28) ? game.pick(available) : null;
        if (witness) {
            const direct = trained(witness);
            observe(incident, witness, direct
                ? `${witness.name} recognized what ${healer.name} gave ${patient.name} as a deathberry.`
                : `${witness.name} saw ${healer.name} give ${patient.name} something unusual before they died.`, 2, direct);
        }
        if (!severeDiagnosed(patient)) {
            for (const id of incident.mourners.slice(0, 2)) {
                const mourner = game.getCat(id);
                if (mourner && mourner !== witness) observe(incident, mourner,
                    `${patient.name}'s death came sooner than ${mourner.name} expected.`, 1);
            }
        }

        game.recordDeath(patient, `${patient.name} died while in the medicine cat's den.`);
        game.afterDeath(patient);
        return `${healer.name} remembers giving ${patient.name} a deathberry.`;
    }

    function openChoice(healer, patient) {
        if (!eligible(healer, patient)) return;
        const choices = [
            { id: "cancel", text: "Leave the berry in the cache" },
            { id: "silent", text: "Feed it and keep your reason private" },
            { id: "grudge", text: "Feed it to settle a grudge" }
        ];
        if (severeDiagnosed(patient)) choices.push({ id: "mercy", text: "Feed it to end their suffering" });
        game.scene("A Choice in the Medicine Den",
            `${patient.name} will die if ${healer.name} gives them the deathberry.`, healer, choices,
            choice => {
                if (choice !== "cancel") return start(healer, patient, choice);
            });
    }

    function suspicion(cat, healer) {
        return incidents().filter(incident =>
            incident.healerId === healer.id && incident.publicDay == null && !incident.dormant
        ).reduce((highest, incident) => Math.max(highest, incident.concerns[cat.id]?.suspicion ?? 0), 0);
    }

    function share(speaker, listener) {
        for (const incident of incidents()) {
            if (incident.publicDay != null || speaker.id === incident.healerId || listener.id === incident.healerId) continue;
            const entry = incident.concerns[speaker.id];
            if (!entry?.suspicion) continue;
            const probability = { curious: .6, observant: .48, loyal: .19, wary: .24 }[speaker.personality] ?? .32;

            // Testimony from a living source can revive a case that went quiet.
            const sourceId = Object.keys(entry.heard).find(id => {
                const account = incident.accounts[id];
                return (incident.dormant ? account.direct && id === speaker.id : true) &&
                    (incident.concerns[listener.id]?.heard[id] ?? 0) < account.weight;
            });
            if (!sourceId || !game.chance(probability)) continue;

            const gossip = Gossip.createGossip("deathberry_report", incident.healerId, incident.patientId,
                { incidentId: incident.id, sourceId });
            // A source who later learns more can update their account in the same conversation channel.
            if (!Gossip.recordGossip(listener, gossip) && !Gossip.knowsGossip(listener, gossip)) continue;
            if (!hear(incident, listener, sourceId)) continue;
            const account = incident.accounts[sourceId];
            if (listener.rank === "Leader" && speaker.id === sourceId && account.direct) {
                incident.proven = true;
                incident.proofReported = true;
            }
            privateMemory(listener, "heard_medicine_den_account", incident, account.observation, 3);
            return account.observation;
        }
        return false;
    }

    function pendingConfession(healer) {
        return incidents().some(incident => incident.healerId === healer.id && incident.publicDay == null && !incident.confession);
    }

    function confession(healer) {
        const incident = incidents().find(entry => entry.healerId === healer.id && entry.publicDay == null && !entry.confession);
        if (!incident) return;
        game.scene("Speak to the Clan Leader", `Will ${healer.name} tell the Clan the truth of how ${incident.patientName} died?`,
            healer, [
                { id: "explain", text: "Admit it and explain why" },
                { id: "admit", text: "Admit it and keep your reason private" },
                { id: "cancel", text: "Wait" }
            ], choice => {
                if (choice !== "cancel") {
                    incident.confession = choice;
                    incident.proven = true;
                    incident.voluntary = !incident.denied && !incident.spokenTo && !incident.earlyQuestionerId &&
                        !incident.proofReported;
                    return `${healer.name} asked to speak to the Clan leader.`;
                }
            });
    }

    function askHealer(incident, investigator, healer, { fromPlayerChoice = false, firsthand = false } = {}) {
        if (firsthand) incident.earlyQuestionerId = investigator.id;
        else incident.spokenTo = investigator.id;
        const resolve = choice => {
            if (choice === "deny") {
                incident.denied = true;
                const denial = `${healer.name} denied having a role in ${incident.patientName}'s death.`;
                privateMemory(investigator, "medicine_den_denial", incident,
                    denial, 3);
                if (fromPlayerChoice) {
                    game.scene("Do You Believe the Healer?", denial, investigator, [
                        { id: "defend", text: "Stand by the healer" },
                        { id: "doubt", text: "Keep your doubts" }
                    ], response => {
                        if (response === "defend") incident.defenderId = investigator.id;
                    });
                    return;
                }
                if (game.relationship(investigator, healer) >= 40) incident.defenderId = investigator.id;
                return denial;
            }
            observe(incident, investigator,
                `${healer.name} privately admitted giving ${incident.patientName} a deathberry.`, 3, true);
            if (choice === "explain") {
                incident.privateExplanationTo = investigator.id;
                privateMemory(investigator, "heard_the_healers_reason", incident,
                    `${healer.name} shared their reason for acting. ${reasonText(incident)}`);
            }
            return `${healer.name} told ${investigator.name} what happened in private.`;
        };
        if (game.state().playerCatId === healer.id) {
            game.scene("Questions at the Medicine Den",
                firsthand
                    ? `${investigator.name} asks ${healer.name} what they gave ${incident.patientName} shortly before they died.`
                    : `${investigator.name} asks ${healer.name} what happened to ${incident.patientName}.`, healer,
                [
                    { id: "explain", text: "Admit it and explain why" },
                    { id: "admit", text: "Admit what happened" },
                    { id: "deny", text: "Deny it" }
                ], resolve);
            return true;
        }
        const outcome = resolve(["gentle", "loyal", "helpful"].includes(healer.personality) ? "explain" : "deny");
        return fromPlayerChoice ? outcome : false;
    }

    function followUp(incident, witness, healer) {
        const entry = concern(incident, witness);
        const source = Object.keys(incident.accounts).map(id => game.getCat(id)).find(cat =>
            cat && cat !== witness && !cat.quarantined && !entry.heard[cat.id]);

        function resolve(choice, fromPlayerChoice = false) {
            entry.privateFollowUpUsed = true;
            if (choice === "ask") return askHealer(incident, witness, healer, { fromPlayerChoice, firsthand: true });
            if (choice === "compare") {
                const { observation } = incident.accounts[source.id];
                hear(incident, witness, source.id);
                const description = `${witness.name} compared what they saw with ${source.name}'s account. ${observation}`;
                privateMemory(witness, "compared_medicine_den_accounts", incident, description, 3);
                return description;
            }
        }

        if (game.state().playerCatId === witness.id) {
            const choices = [{ id: "ask", text: `Ask ${healer.name} what they gave ${incident.patientName}` }];
            if (source) choices.push({ id: "compare", text: `Compare accounts privately with ${source.name}` });
            choices.push({ id: "leave", text: "Let it go" });
            game.scene("Something in the Medicine Den",
                incident.accounts[witness.id].observation, witness, choices, choice => resolve(choice, true));
            return true;
        }
        if (source) {
            resolve("compare");
            return false;
        }
        return resolve("ask");
    }

    function question(incident, investigator, healer, leader) {
        const entry = concern(incident, investigator);
        if (game.state().playerCatId === investigator.id && investigator !== leader) {
            game.scene("Questions About the Medicine Den",
                `${investigator.name} has heard troubling accounts of ${incident.patientName}'s death.`, investigator,
                [
                    { id: "ask", text: `Ask ${healer.name} privately` },
                    { id: "report", text: "Ask clan leadership to look into it" },
                    { id: "accuse", text: "Publicly name the healer as a suspect" },
                    { id: "exaggerate", text: `Claim a witness saw ${healer.name} collecting deathberries` },
                    { id: "wait", text: "Wait for more evidence" }
                ], choice => {
                    entry.questioned = true;
                    if (choice === "ask") return askHealer(incident, investigator, healer, { fromPlayerChoice: true });
                    if (choice === "report") incident.referredBy = investigator.id;
                    if (choice === "accuse" || choice === "exaggerate") correctAccusation(incident, investigator, healer, choice);
                });
            return true;
        }

        entry.questioned = true;
        if (investigator !== leader && investigator.mentorId !== healer.id &&
            ["observant", "wary", "bold"].includes(investigator.personality)) {
            incident.referredBy = investigator.id;
            return false;
        }
        return askHealer(incident, investigator, healer);
    }

    function correctAccusation(incident, investigator, healer, choice) {
        const exaggerated = choice === "exaggerate";
        const description = exaggerated
            ? `${investigator.name} claimed a witness saw ${healer.name} collecting deathberries. The accounts they presented did not support that claim.`
            : `${investigator.name} publicly blamed ${healer.name} for ${incident.patientName}'s death before the Clan had solid proof. The accusation was set aside.`;
        game.log("story", description);
        game.grievance(healer, investigator, "unfair_medicine_den_accusation", incident.id, game.state().day);
        if (exaggerated) adjust(investigator, "respect", -6);
    }

    function reasonText(incident) {
        if (incident.motive === "mercy") return "They said they wanted to end the patient's suffering." +
            (incident.requestedRelief ? " They told the clan the patient had asked for the pain to end." : "");
        if (incident.motive === "grudge") return "They admitted acting out of a grudge.";
        return "They said they had kept their reasons to themself.";
    }

    function denialBondLoss(tie, mourner, apprentice, witness) {
        if (tie === "family") return 125;
        if (tie === "bestFriend") return 100;
        if (mourner) return 80;
        if (apprentice) return 65;
        return witness ? 55 : 0;
    }

    function reveal(incident, leader, choice) {
        if (incident.publicDay != null) return;
        const state = game.state();
        incident.publicDay = state.day;
        const healer = game.getCat(incident.healerId);
        const patient = state.starClan.find(cat => cat.id === incident.patientId);
        const explained = (incident.confession ?? choice) === "explain";
        const mercy = explained && incident.motive === "mercy";
        const grudge = explained && incident.motive === "grudge";
        const deniedAtHearing = choice === "deny";
        const description = `The clan learned that ${incident.healerName} gave ${incident.patientName} a deathberry.` +
            (deniedAtHearing ? ` ${incident.healerName} denied it even after the Clan heard firsthand evidence.` :
                explained ? ` ${reasonText(incident)}` : "");
        if (patient) patient.deathCause = `${patient.name} died after ${incident.healerName} gave them a deathberry.`;
        game.log("story", description);

        const apprentice = healer && game.apprentice(healer);
        const witnesses = new Set(Object.entries(incident.accounts ?? {}).filter(([, account]) => account.direct).map(([id]) => id));
        const affected = new Set([
            ...(deniedAtHearing ? [incident.mourners[0], ...witnesses, apprentice?.id] : []),
            ...incident.mourners, apprentice?.id, incident.defenderId
        ]);
        const reactions = [];
        for (const id of affected) {
            const cat = game.getCat(id);
            if (!cat || id === incident.healerId) continue;
            const mourner = incident.mourners.includes(id);
            const betrayed = incident.denied && id === incident.defenderId;
            const tie = mourner && (incident.mournerTies
                ? incident.mournerTies[id] : closeLossTie(cat, patient));
            const denialLoss = deniedAtHearing
                ? denialBondLoss(tie, mourner, id === apprentice?.id, witnesses.has(id))
                : 0;
            const severity = grudge ? 20 : mercy ? 8 : 14;
            const closeness = healer && game.relationship(cat, healer) >= 60 ? 4 : 0;
            const empathy = mercy && ["gentle", "patient", "helpful"].includes(cat.personality)
                ? (incident.requestedRelief ? 6 : 4) : 0;
            if (healer) {
                const ordinaryLoss = severity + (mourner ? 4 : -4) + closeness - empathy;
                const loss = (denialLoss || ordinaryLoss) + (betrayed ? 5 : 0);
                game.setRelationship(cat, healer, game.relationship(cat, healer) - loss);
                if (denialLoss || betrayed || (!mercy && mourner)) game.grievance(cat, healer, "betrayal_of_care",
                    incident.id, state.day, { strength: denialLoss || grudge || betrayed ? 2 : 1 });
            }
            const betrayal = betrayed && healer
                ? `${cat.name} had believed ${healer.name}'s denial. Learning the truth shattered their trust in ${healer.name}.`
                : "";
            if (betrayal) {
                Relationships.adjustTrust(cat, healer, -45);
                privateMemory(cat, "trust_shaken", incident, betrayal, 5);
            }
            let reaction = "";
            if (denialLoss) {
                if (mourner) reaction = `${cat.name} said ${incident.patientName} deserved the truth, then walked away.`;
                else if (id === apprentice?.id) reaction = `${cat.name} stepped away from their mentor and asked to leave the hearing.`;
                else reaction = `${cat.name} spoke up. “We heard what happened. How can you still deny it?”`;
                reactions.push(reaction);
            }
            game.rememberEvent(cat, "medicine_den_revelation", {
                description: reaction ? `${description} ${reaction}` : description,
                importance: 5, participants: [incident.patientId, incident.healerId], incidentId: incident.id
            });
        }

        const publicReactions = reactions.slice(0, 2).join(" ");
        if (publicReactions) game.log("story", publicReactions);
        const outcome = publicReactions ? `${description} ${publicReactions}` : description;
        if (!healer) return outcome;
        const respectLoss = (mercy ? 8 : grudge ? 20 : 14) - (incident.voluntary ? 5 : 0);
        adjust(healer, "respect", -respectLoss - (incident.denied ? 5 : 0));
        incident.supervisionUntil = state.day + supervisionDays;
        incident.apprenticeReviewId = apprentice?.id;
        for (const id of incident.mourners) {
            const mourner = game.getCat(id);
            if (mourner) recordHealerRequest(incident, mourner);
        }
        game.rememberEvent(healer, "medicine_den_hearing", {
            description: outcome, importance: 5, participants: [incident.patientId, leader?.id].filter(Boolean),
            incidentId: incident.id
        });
        game.log("story", `${healer.name}'s work in the medicine den will be reviewed for ${supervisionDays} days.`);
        return outcome;
    }

    function hearing(incident, leader) {
        incident.proven = true;
        incident.proofReported = true;
        const healer = game.getCat(incident.healerId);
        if (healer?.id === game.state().playerCatId && !incident.confession) {
            game.scene("The Medicine Den Hearing",
                `Clan leadership has heard firsthand evidence about ${incident.patientName}'s death.`, healer,
                [
                    { id: "explain", text: "Admit it and explain why" },
                    { id: "admit", text: "Admit what happened" },
                    { id: "deny", text: "Maintain your denial" }
                ], choice => {
                    if (choice === "deny") incident.denied = true;
                    return reveal(incident, leader, choice);
                });
            return true;
        }
        if (leader && leader.id === game.state().playerCatId) {
            game.scene("The Medicine Den Hearing",
                `Clan leadership has firsthand evidence about ${incident.patientName}'s death.`, leader,
                [{ id: "publish", text: "Tell the Clan what happened and order a review" }],
                choice => reveal(incident, leader, choice));
            return true;
        }
        reveal(incident, leader, healer && ["gentle", "loyal", "helpful"].includes(healer.personality) ? "explain" : "publish");
        return false;
    }

    function oversight(healer) {
        return incidents().find(incident => incident.healerId === healer.id && incident.supervisionUntil > game.state().day);
    }

    function supervisor(healer, patient) {
        const available = game.cats().filter(cat => cat !== healer && cat !== patient && !cat.quarantined && cat.health >= 35);
        return available.find(cat => cat.rank === "Medicine Cat") ??
            available.find(cat => cat.id === game.apprentice(healer)?.id && trained(cat)) ??
            available.find(cat => cat.rank === "Leader" || cat.rank === "Deputy");
    }

    function noteCare(healer, patient) {
        const incident = oversight(healer);
        if (!incident) return "";
        incident.careDays ??= [];
        if (!incident.careDays.includes(game.state().day)) incident.careDays.push(game.state().day);
        const reviewer = supervisor(healer, patient);
        return reviewer ? `${reviewer.name} checked the treatment.` : "The treatment was recorded for review.";
    }

    function apprenticeReview(incident) {
        const apprentice = game.getCat(incident.apprenticeReviewId);
        const healer = game.getCat(incident.healerId);
        if (!apprentice || !healer || apprentice.rank !== "Apprentice" || apprentice.mentorId !== healer.id) {
            incident.apprenticeReviewed = true;
            return false;
        }
        const alternative = !apprentice.quarantined && game.cats().find(cat =>
            cat !== healer && game.canTakeApprentice(cat));
        function resolve(choice) {
            incident.apprenticeReviewed = true;
            if (choice === "transfer" && alternative && game.canTakeApprentice(alternative)) {
                return game.transferApprentice(alternative, apprentice);
            }
            const description = `${apprentice.name} chose to stay with ${healer.name} and help review their work.`;
            game.log("training", description);
            return description;
        }
        if (game.state().playerCatId === apprentice.id) {
            const choices = [{ id: "stay", text: "Stay and help review their work" }];
            if (alternative) choices.push({ id: "transfer", text: `Train with ${alternative.name}` });
            game.scene("An Apprentice's Decision", `${apprentice.name} must decide how to continue their training.`,
                apprentice, choices, resolve);
            return true;
        }
        resolve(alternative && game.relationship(apprentice, healer) < 35 && apprentice.personality !== "loyal"
            ? "transfer" : "stay");
        return false;
    }

    function finishReview(incident) {
        incident.reviewCompleted = true;
        const healer = game.getCat(incident.healerId);
        if (!healer || (incident.careDays?.length ?? 0) < 2) return;
        adjust(healer, "respect", 4);
        const cat = game.getCat(incident.defenderId ?? incident.apprenticeReviewId) ?? game.getCat(incident.mourners[0]);
        if (cat) {
            game.setRelationship(cat, healer, game.relationship(cat, healer) + 5);
            game.resolveGrievance(cat, healer, incident.id);
        }
        game.log("story", `The clan finished reviewing ${healer.name}'s care. Though the Clan will never forget what they did, they still rely on ${healer.name} expertise. After some debate, the Clan agreed to let them return to normal duties.`);
    }

    function isVictimOf(healerId, patientId) {
        return game.state().deathberryIncidents?.[`deathberry:${patientId}`]?.healerId === healerId;
    }

    function showNightmare() {
        const state = game.state();
        for (const incident of incidents()) {
            if (incident.nightmareDay != null || state.day <= incident.day) continue;
            const healer = game.getCat(incident.healerId);
            if (!healer) continue;

            const question = incident.motive === "mercy"
                ? "Did you ever care about me, or were you always a foxheart?"
                : "Did you think I wouldn't remember what you gave me?";
            const vision = `${healer.name} dreamed they were standing in front of the sickbeds. ${incident.patientName} lay in the nest before them, alive and alert as they had once been. “${question}”`;
            function wake(choice) {
                if (incident.nightmareDay != null) return;
                incident.nightmareDay = state.day;
                const ending = choice === "answer"
                    ? `${healer.name} tried to answer, but the den went dark before they could speak. Before they wake up, they realize all the stars have disappeared from the night sky outside.`
                    : `${healer.name} flattened their ears and turned away, ignoring the chorus of whispers behind them. Before they reach the den's exit, they wake up.`;
                privateMemory(healer, "deathberry_nightmare", incident, `${vision} ${ending}`, 5);
                return ending;
            }
            if (healer.id === state.playerCatId) {
                game.scene("The Empty Nest", vision, healer, [
                    { id: "answer", text: "Try to answer them" },
                    { id: "turn_away", text: "Turn away" }
                ], wake);
                return true;
            }
            wake(["gentle", "loyal", "bold"].includes(healer.personality) ? "answer" : "turn_away");
        }
        return false;
    }

    function aftermath(incident) {
        const cat = game.getCat(game.state().playerCatId);
        if (!cat || !(cat.id === incident.healerId || (incident.publicDay != null && incident.mourners.includes(cat.id))) ||
            incident.aftermath[cat.id]) return false;
        const earliest = cat.id === incident.healerId ? incident.day : incident.publicDay;
        if (game.state().day <= earliest || game.state().day > earliest + reviewDays) return false;
        game.scene("After the Vigil", `${cat.name} sits alone after remembering ${incident.patientName}. What does the silence of StarClan mean to them?`,
            cat, [
                { id: "comfort", text: "Take comfort in StarClan's silence" },
                { id: "doubt", text: "Question why StarClan stayed silent" },
                { id: "quiet", text: "Remember them quietly" }
            ], choice => {
                incident.aftermath[cat.id] = true;
                adjust(cat, "faith", choice === "comfort" ? 3 : choice === "doubt" ? -3 : 0);
                const reflection = {
                    comfort: "took comfort in the thought that StarClan's silence meant they approved of their decision",
                    doubt: "questioned why StarClan had stayed silent",
                    quiet: `sat quietly with the memory of ${incident.patientName}`
                };
                const description = `${cat.name} remembered ${incident.patientName} and ${reflection[choice]}.`;
                privateMemory(cat, "medicine_den_reflection", incident, description);
                return description;
            });
        return true;
    }

    function advance() {
        const state = game.state();
        const leader = game.cats().find(cat => cat.rank === "Leader") ?? game.cats().find(cat => cat.rank === "Deputy");
        for (const incident of incidents()) {
            if (incident.publicDay != null) {
                if (!incident.reviewCompleted && state.day >= (incident.supervisionUntil ?? incident.publicDay)) finishReview(incident);
                if (incident.apprenticeReviewId && !incident.apprenticeReviewed && state.day > incident.publicDay &&
                    apprenticeReview(incident)) return true;
                if (aftermath(incident)) return true;
                continue;
            }
            if (incident.proven) {
                if (hearing(incident, leader)) return true;
                continue;
            }
            if (state.day >= incident.reviewUntil) incident.dormant = true;
            if (incident.dormant || state.day <= incident.day) {
                if (aftermath(incident)) return true;
                continue;
            }
            const healer = game.getCat(incident.healerId);
            const referral = game.getCat(incident.referredBy);
            const leads = Object.entries(incident.accounts);
            const direct = leads.find(([id, account]) => account.direct && game.getCat(id) &&
                (referral || incident.concerns[leader?.id]?.heard[id] || id === leader?.id ||
                    incident.mourners.includes(id) || state.day >= incident.day + 3));
            if (direct) {
                if (hearing(incident, leader)) return true;
                continue;
            }
            if (referral && leader) {
                const report = incident.concerns[referral.id];
                for (const id of Object.keys(report?.heard ?? {})) hear(incident, leader, id);
                delete incident.referredBy;
            }
            if (healer && !incident.spokenTo) {
                const investigator = game.cats().filter(cat => {
                    const entry = incident.concerns[cat.id];
                    return entry?.suspicion >= 3 && !entry.questioned && !cat.quarantined;
                }).sort((a, b) => Number(b.id === state.playerCatId) - Number(a.id === state.playerCatId) ||
                    Number(b.mentorId === healer.id) - Number(a.mentorId === healer.id) ||
                    incident.concerns[b.id].suspicion - incident.concerns[a.id].suspicion)[0];
                if (investigator) {
                    if (question(incident, investigator, healer, leader)) return true;
                } else {
                    const witness = game.cats().find(cat => {
                        const entry = incident.concerns[cat.id];
                        const account = incident.accounts[cat.id];
                        // In existing saves, a weight-two non-direct account is an eyewitness's unusual-treatment observation.
                        return cat.personality === "observant" && !cat.quarantined &&
                            entry?.suspicion === 2 && !entry.privateFollowUpUsed &&
                            account?.weight === 2 && !account.direct;
                    });
                    if (witness && followUp(incident, witness, healer)) return true;
                }
            }
            if (aftermath(incident)) return true;
        }
        return false;
    }

    function requestsDifferentHealer(incident, patient) {
        if (incident.publicDay != null) {
            return incident.supervisionUntil > game.state().day && incident.mourners.includes(patient.id);
        }
        return !incident.dormant && incident.concerns[patient.id]?.suspicion >= 3;
    }

    function prefersOtherHealer(patient, healer) {
        return incidents().some(incident => incident.healerId === healer.id && requestsDifferentHealer(incident, patient));
    }

    function recordHealerRequest(incident, patient) {
        if (patient.id === incident.healerId || !requestsDifferentHealer(incident, patient) ||
            !(patient.quarantined || game.needsIsolation(patient))) return;
        const healer = game.getCat(incident.healerId);
        if (healer?.rank !== "Medicine Cat") return;
        const recorded = incident.patientRequestIds ??= [];
        if (recorded.includes(patient.id)) return;
        recorded.push(patient.id);
        adjust(healer, "respect", -2);
    }

    function recordPatientRequests() {
        const cats = game.cats();
        for (const incident of incidents()) {
            for (const patient of cats) recordHealerRequest(incident, patient);
        }
    }

    return { initialize, eligible, openChoice, canAskWishes, askWishes, share, pendingConfession, confession, advance,
        isVictimOf, showNightmare,
        oversight, noteCare, prefersOtherHealer, recordPatientRequests, suspicion };
})();
