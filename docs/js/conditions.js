window.CatConditions = (() => {
    const severityOrder = { mild: 1, serious: 2, severe: 3 };
    const definitions = {
        scrape: {
            name: "Scrape",
            initialSeverity: "mild",
            mild: { treatment: "clean the scrape", success: .75, recovery: 1, natural: 3 }
        },
        brokenLeg: {
            name: "Broken leg",
            initialSeverity: "serious",
            serious: {
                treatment: "set and splint the leg", success: .5, recovery: 4, natural: 7,
                deadline: 3, penalties: { agility: 2, climbing: 2 }
            }
        },
        greencough: {
            name: "Greencough",
            initialSeverity: "mild",
            mild: { treatment: "provide rest and supportive care", success: .7, recovery: 2, worsensAfter: 3 },
            serious: {
                treatment: "give greencough medicine", success: .55, recovery: 3, worsensAfter: 3,
                damage: 3, penalties: { stamina: 1 }
            },
            severe: {
                treatment: "give medicine and tend to breathing", success: .35, recovery: 4, natural: 10,
                damage: 12, penalties: { stamina: 3 }
            }
        }
    };

    const lastingEffects = {
        limp: { name: "Limp", penalties: { agility: 1, climbing: 1 } }
    };

    const contactRisk = { conversation: .035, patrol: .08, close: .12 };
    const conditionRules = condition => definitions[condition.id][condition.severity];

    function add(cat, id, day, log, incubation = 0) {
        const definition = definitions[id];
        if (!definition || cat.alive === false || cat.conditions?.some(condition => condition.id === id)) {
            return false;
        }

        cat.conditions ??= [];
        cat.conditions.push({
            id,
            severity: definition.initialSeverity,
            stageDay: day + incubation,
            recoveryDay: null,
            treatedDay: null
        });
        if (!incubation) {
            const article = id === "greencough" ? "" : "a ";
            log("condition", `${cat.name} has ${article}${definition.initialSeverity} ${definition.name.toLowerCase()}.`);
        }
        return true;
    }

    function skill(cat, name, minimumBase = 0) {
        let penalty = 0;
        for (const condition of cat.conditions ?? []) {
            penalty += conditionRules(condition).penalties?.[name] ?? 0;
        }
        for (const effect of cat.permanentEffects ?? []) {
            penalty += lastingEffects[effect].penalties[name] ?? 0;
        }
        const base = Math.max(minimumBase, cat.skills?.[name] ?? 0);
        return Math.max(0, base - penalty);
    }

    function recordContact(participants, kind, day) {
        const cats = [...new Set(participants)].filter(cat => cat.alive !== false && !cat.quarantined);
        const infectious = cats.filter(cat =>
            cat.conditions?.some(condition => condition.id === "greencough" && condition.stageDay <= day)
        );

        for (const cat of cats) {
            if (cat.conditions?.some(condition => condition.id === "greencough")) continue;
            for (const source of infectious) {
                const risk = contactRisk[kind];
                // Keep the closest contact for each pair so repeated dialogue cannot inflate exposure.
                cat.greencoughExposure ??= {};
                const exposure = cat.greencoughExposure[source.id] ?? 0;
                cat.greencoughExposure[source.id] = Math.max(exposure, risk);
            }
        }
    }

    function patientsNeedingTreatment(cats, day) {
        const patients = [];
        for (const cat of cats) {
            for (const condition of cat.conditions ?? []) {
                if (condition.stageDay > day || condition.recoveryDay !== null || condition.lastTreatmentAttemptDay === day) continue;
                const rules = conditionRules(condition);
                const deadline = (rules.deadline ?? rules.worsensAfter ?? Infinity) + condition.stageDay;
                patients.push({ cat, condition, rules, deadline: deadline >= day ? deadline : Infinity });
            }
        }
        patients.sort((a, b) =>
            severityOrder[b.condition.severity] - severityOrder[a.condition.severity] ||
            a.deadline - b.deadline || a.condition.stageDay - b.condition.stageDay
        );
        return patients;
    }

    function treat(healer, patient, day) {
        const { cat, condition, rules } = patient;
        condition.lastTreatmentAttemptDay = day;
        const success = Math.random() < Math.min(.95, rules.success + skill(healer, "healing") * .05);
        const target = healer === cat ? "themself" : cat.name;
        if (success) {
            condition.treatedDay = day;
            condition.recoveryDay = day + rules.recovery;
            return `${healer.name} managed to ${rules.treatment} for ${target}. Recovery has begun.`;
        } else {
            return `${healer.name} tried to ${rules.treatment} for ${target}, but the treatment didn't take.`;
        }
    }

    function progress(cat, condition, day, log, rememberLimp) {
        const definition = definitions[condition.id];
        const elapsed = day - condition.stageDay;
        if (elapsed < 0) return true;
        if (elapsed === 0) {
            log("condition", `${cat.name} began showing signs of ${definition.name.toLowerCase()}.`);
            return true;
        }

        const rules = conditionRules(condition);
        const recovering = condition.recoveryDay !== null;
        if (recovering ? day >= condition.recoveryDay : elapsed >= rules.natural) {
            if (condition.id === "brokenLeg") {
                const lateTreatment = condition.treatedDay === null ||
                    condition.treatedDay > condition.stageDay + rules.deadline;
                if (lateTreatment && !cat.permanentEffects?.includes("limp") && Math.random() < .65) {
                    cat.permanentEffects ??= [];
                    cat.permanentEffects.push("limp");
                    const description = `${cat.name}'s broken leg healed with a permanent limp.`;
                    log("condition", description);
                    rememberLimp?.(cat, description);
                    return false;
                }
            }
            log("condition", `${cat.name} recovered from ${definition.name.toLowerCase()}.`);
            return false;
        }

        if (recovering) return true;
        if (rules.damage) {
            cat.health = Math.max(0, cat.health - rules.damage);
            if (cat.health === 0) {
                cat.alive = false;
                log("loss", `${cat.name} died from ${definition.name.toLowerCase()}.`);
                return true;
            }
        }
        if (elapsed >= rules.worsensAfter) {
            condition.severity = condition.severity === "mild" ? "serious" : "severe";
            condition.stageDay = day;
            log("condition", `${cat.name}'s ${definition.name.toLowerCase()} became ${condition.severity}.`);
        }
        return true;
    }

    function advanceDay(cats, day, log, rememberLimp) {
        const alreadyInfected = new Set(cats.filter(cat =>
            cat.conditions?.some(condition => condition.id === "greencough")
        ));
        for (const cat of cats) {
            cat.conditions = (cat.conditions ?? []).filter(condition =>
                cat.alive === false || progress(cat, condition, day, log, rememberLimp)
            );
            const exposures = Object.values(cat.greencoughExposure ?? {});
            delete cat.greencoughExposure;
            if (cat.alive === false || alreadyInfected.has(cat) || !exposures.length) continue;
            const escapeChance = exposures.reduce((probability, risk) => probability * (1 - risk), 1);
            if (Math.random() < 1 - escapeChance) add(cat, "greencough", day, log, 2);
        }

        // An occasional first case gives outbreaks a way to start in an otherwise healthy clan.
        const living = cats.filter(cat => cat.alive !== false);
        if (day >= 3 && living.length && !alreadyInfected.size && Math.random() < .04) {
            const cat = living[Math.floor(Math.random() * living.length)];
            add(cat, "greencough", day, log, 2);
        }
    }

    function describe(cat, day) {
        const active = (cat.conditions ?? []).filter(condition => condition.stageDay <= day).map(condition => {
            const name = definitions[condition.id].name;
            const status = condition.recoveryDay === null ? "needs care" : "recovering";
            return `${name} · ${condition.severity} · ${status}`;
        });
        return active.concat((cat.permanentEffects ?? []).map(effect => `${lastingEffects[effect].name} · permanent`));
    }

    return { add, advanceDay, describe, recordContact, skill, patientsNeedingTreatment, treat };
})();
