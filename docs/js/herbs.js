window.ClanHerbs = (() => {
    const herbs = [
        { id: "dock", name: "Dock leaves", treats: ["scrape"], routes: ["pinewood", "river", "bramble"] },
        { id: "catmint", name: "Catmint", treats: ["greencough"], routes: ["ruins", "bramble", "pinewood"] },
        { id: "comfrey", name: "Comfrey", treats: ["brokenLeg", "burn"], routes: ["ridge", "pinewood", "bramble"] },
        { id: "wetMoss", name: "Water-soaked moss", treats: ["heatExhaustion"], routes: ["river", "moonpool", "pinewood"] },
        { id: "honey", name: "Honey", treats: ["burn"], routes: ["pinewood", "ridge", "ruins"] },
        { id: "deathberries", name: "Deathberries", treats: [], routes: [], lethal: true }
    ];
    const medicinal = herbs.filter(herb => !herb.lethal);
    const get = id => herbs.find(herb => herb.id === id);
    const measure = count => Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const count = (stock, herb) => stock[herb.id] ?? 0;
    const total = stock => herbs.reduce((sum, herb) => sum + count(stock, herb), 0);
    const at = location => medicinal.filter(herb => herb.routes.includes(location.id));
    const remedies = patient => medicinal.filter(herb => herb.treats.includes(patient.condition.id));
    const affordable = (stock, patient) => remedies(patient).find(herb => count(stock, herb) >= patient.herbCost);
    function normalize(legacy, stock) {
        if (stock && typeof stock === "object") {
            return Object.fromEntries(herbs.map(herb => [herb.id, measure(stock[herb.id])]));
        }
        const amount = measure(legacy);
        return Object.fromEntries(medicinal.map((herb, index) => [
            herb.id, Math.floor(amount / medicinal.length) + Number(index < amount % medicinal.length)
        ]));
    }
    function gatherable(location, preferred, rand) {
        const available = at(location);
        if (available.includes(preferred)) return preferred;
        return available.length ? available[rand(0, available.length - 1)] : null;
    }
    function lose(stock, fraction) {
        const size = total(stock);
        const loss = Math.ceil(size * fraction);
        if (!loss) return 0;
        const portions = herbs.map(herb => {
            const exact = loss * count(stock, herb) / size;
            return { herb, amount: Math.floor(exact), remainder: exact % 1 };
        }).sort((a, b) => b.remainder - a.remainder);
        let remaining = loss - portions.reduce((sum, portion) => sum + portion.amount, 0);
        for (const portion of portions) {
            const extra = remaining > 0 && portion.remainder > 0 ? 1 : 0;
            remaining -= extra;
            stock[portion.herb.id] = count(stock, portion.herb) - portion.amount - extra;
        }
        return loss;
    }
    return { herbs, medicinal, get, count, total, at, remedies, affordable, normalize, gatherable, lose };
})();
