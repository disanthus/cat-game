window.ClanPatrols = (() => {
    const ROUTES = {
        pinewood: { goal: "hunting", safety: "agility", yieldSkill: "stealth", guide: "Undergrowth guide" },
        river: { goal: "hunting", safety: "swimming", yieldSkill: "swimming", guide: "Crossing guide" },
        ridge: { goal: "hunting", safety: "climbing", guide: "Ledge guide" },
        ruins: { goal: "curiosity", safety: "agility", guide: "Rubble guide" },
        moonpool: { goal: "intuition", safety: "stamina", guide: "Trail guide" },
        bramble: { goal: "hunting", safety: "agility", yieldSkill: "stealth", guide: "Thorn guide" }
    };
    const skill = (cat, name) => CatConditions.skill(cat, name);
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

    function role(cats, name) {
        const [lead, support] = [...cats].sort((a, b) => skill(b, name) - skill(a, name) || b.energy - a.energy);
        if (!lead) return null;
        const score = skill(lead, name) + (support ? skill(support, name) * .2 : 0);
        return { lead, name, score: clamp(score, 0, 10) };
    }

    function selectTeam(location, candidates, player, goalOverride, companionPreference) {
        const route = ROUTES[location.id];
        const goal = goalOverride ?? route.goal;
        const team = new Set([
            candidates.includes(player) ? player : null,
            role(candidates, goal)?.lead,
            role(candidates, route.safety)?.lead
        ].filter(Boolean));
        const supportSkill = route.yieldSkill ?? "stamina";
        const leaders = [...team];
        const score = cat => skill(cat, goal) + skill(cat, route.safety) + skill(cat, supportSkill) +
            (companionPreference?.(cat, leaders) ?? 0);
        const remaining = candidates.filter(cat => !team.has(cat)).sort((a, b) =>
            score(b) - score(a) || b.energy - a.energy);
        return [...team, ...remaining.slice(0, 3 - team.size)];
    }

    function plan(location, cats, weather, healer) {
        if (!cats.length) return null;
        const route = ROUTES[location.id];
        const goal = healer ? { lead: healer, name: "healing", score: skill(healer, "healing") } : role(cats, route.goal);
        const safety = role(cats, route.safety);
        const yieldRole = !healer && route.yieldSkill ? role(cats, route.yieldSkill) : null;
        const stamina = role(cats, "stamina");
        return {
            goal, safety, yieldRole, stamina, guide: route.guide,
            goalChance: clamp(.56 - location.risk * .035 + goal.score * .02, .25, .90),
            injuryChance: clamp(.09 + (location.risk + weather.risk) * .045 - safety.score * .015, .02, .55),
            bonusPrey: yieldRole ? Math.floor(yieldRole.score / 4) : 0,
            energySaved: Math.floor(stamina.score * .4)
        };
    }

    return { role, selectTeam, plan };
})();
