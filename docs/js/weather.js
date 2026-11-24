window.ClanWeather = (() => {
    const DAYS_PER_SEASON = 10;
    const SPELLS = {
        rain: { label: "Heavy rain", warning: "Heavy rain is coming tomorrow. Glassriver Bend may be harder to cross.", floodChance: .15 },
        thunderstorm: {
            label: "Severe thunderstorm",
            warning: "A severe thunderstorm is coming tomorrow. The river might flood its banks.",
            floodChance: .55
        },
        heat: { label: "Heat spell", warning: "A heat spell is coming tomorrow. Exposed routes will be tiring." },
        frost: { label: "Early frost", warning: "Frost is coming tomorrow. This is a good day to gather herbs." },
        snow: { label: "Heavy snow", warning: "Snow is coming tomorrow. Exposed routes will be tiring and prey will be scarce." }
    };
    const SEASON_SPELLS = { Newleaf: "rain", Greenleaf: "heat", "Leaf-fall": "frost", "Leaf-bare": "snow" };
    const STORM_ODDS = { Newleaf: 35, Greenleaf: 25 };
    const EXPOSED = new Set(["river", "ridge", "ruins"]);

    function advance(state, season, rand, log) {
        const day = state.day;
        const seasonStart = day - (day - 1) % DAYS_PER_SEASON;
        const seasonEnd = seasonStart + DAYS_PER_SEASON - 1;
        if (state.weather?.seasonStart !== seasonStart) {
            state.weather = {
                seasonStart,
                forecastDay: Math.max(day, seasonStart + rand(1, 4)),
                spell: null
            };
        }
        const weather = state.weather;
        if (!weather.spell && day >= weather.forecastDay && day <= seasonEnd - 2) {
            const stormOdds = STORM_ODDS[season];
            const id = stormOdds && rand(1, 100) <= stormOdds ? "thunderstorm" : SEASON_SPELLS[season];
            weather.spell = {
                id, startsDay: day + 1,
                endsDay: Math.min(seasonEnd, day + rand(2, 4)),
                sceneResolved: false
            };
            log("weather", SPELLS[id].warning);
        } else if (weather.spell?.startsDay === day) {
            log("weather", SPELLS[weather.spell.id].label + " settled over the territory.");
        } else if (weather.spell?.endsDay === day - 1) {
            log("weather", "The " + SPELLS[weather.spell.id].label.toLowerCase() + " passed.");
        }
    }

    function active(state) {
        const spell = state.weather?.spell;
        return spell && state.day >= spell.startsDay && state.day <= spell.endsDay ? spell.id : null;
    }

    function status(state) {
        const spell = state.weather?.spell;
        if (spell?.startsDay > state.day) return SPELLS[spell.id].warning;
        if (active(state)) return SPELLS[spell.id].label + " · Through Day " + spell.endsDay;
        return "Fair weather";
    }

    function floodChance(spell) {
        return SPELLS[spell?.id]?.floodChance ?? 0;
    }

    function patrolEffects(state, season, location) {
        const weather = active(state);
        const exposed = EXPOSED.has(location.id);
        const burnedUntil = state.burnedTerritories?.[location.id] ?? 0;
        const burned = burnedUntil >= state.day;
        const weatherRisk = location.id === "river" ? weather === "thunderstorm" ? 2 : weather === "rain" ? 1 : 0 : 0;
        const seasonalPrey = season === "Leaf-bare" && exposed ? -1 : season === "Greenleaf" && !weather ? 1 : 0;
        return {
            energy: (exposed && ["heat", "snow", "thunderstorm"].includes(weather) ? 4 : 0) + (burned ? 4 : 0),
            risk: weatherRisk + (burned ? 1 : 0),
            weatherRisk,
            heatExhaustionRisk: weather === "heat" ? (exposed ? .12 : .04) : 0,
            prey: location.prey[1] === 0 ? 0 : seasonalPrey - (burned ? 2 : 0),
            burnedUntil: burned ? burnedUntil : null
        };
    }

    function herbModifier(state, season, location) {
        const weather = active(state);
        const seasonal = weather === "frost" || weather === "snow" ? -1 : season === "Newleaf" ? 1 : 0;
        const burned = location && (state.burnedTerritories?.[location.id] ?? 0) >= state.day;
        return seasonal - (burned ? 1 : 0);
    }

    function exposureMultiplier(state) {
        return active(state) === "snow" && (state.nurseryShelterUntil ?? 0) < state.day ? 1.25 : 1;
    }

    return { DAYS_PER_SEASON, advance, active, status, floodChance, patrolEffects, herbModifier, exposureMultiplier };
})();
