/*:
 * @target MZ
 * @plugindesc PokeLite v0.1 — Base de datos Pokémon-like + daño y encuentro demo
 * @author Daniel + ChatGPT
 *
 * @command StartWildEncounter
 * @text Iniciar encuentro salvaje (demo)
 * @desc Abre un "encuentro" de prueba contra una especie por ID.
 * @arg speciesId
 * @type number
 * @default 1
 * @arg level
 * @type number
 * @default 3
 */
var PokeLite = PokeLite || {};
(() => {
  "use strict";
  const PL = (PokeLite = PokeLite || {});
  PL.DB = { types:null, moves:null, species:null, ready:false };

  function loadJSON(path) {
    return fetch(path).then(r=>{
      if (!r.ok) throw new Error(`No se pudo cargar ${path}`);
      return r.json();
    });
  }

  PL.loadAll = async function() {
    if (PL.DB.ready) return;
    const base = "data/pkmn/";
    const [types, moves, species] = await Promise.all([
      loadJSON(base + "types.json"),
      loadJSON(base + "moves.json"),
      loadJSON(base + "species.json")
    ]);
    PL.DB.types = types;
    PL.DB.moves = moves;
    PL.DB.species = species;
    PL.DB.ready = true;
    console.info("[PokeLite] Datos cargados.");
  };

  PL.typeEffect = function(attType, defType) {
    const chart = PL.DB.types?.chart || {};
    return (chart[attType] && chart[attType][defType]) || 1;
  };

  PL.calcDamage = function(params) {
    // params: {level, power, atk, def, attType, defTypes:[], stab:true/false, critChance}
    const L = params.level ?? 5;
    const P = params.power ?? 40;
    const A = Math.max(1, params.atk ?? 10);
    const D = Math.max(1, params.def ?? 10);

    let base = Math.floor(Math.floor((2*L)/5 + 2) * P * (A/D) / 50) + 2;

    if (params.stab) base = Math.floor(base * 1.5);

    let mult = 1;
    for (const dt of (params.defTypes || [])) {
      mult *= PL.typeEffect(params.attType, dt);
    }

    const crit = (Math.random() < (params.critChance ?? 0.0625)) ? 1.5 : 1;
    const variance = (85 + Math.floor(Math.random()*16)) / 100;

    return Math.max(1, Math.floor(base * mult * crit * variance));
  };

  PL.getSpecies = function(id) {
    return PL.DB.species?.species?.[String(id)] || null;
  };

  PL.getMove = function(id) {
    return PL.DB.moves?.moves?.[String(id)] || null;
  };

  // --- Utilidad demo: simular "turno" simple con un movimiento  ---
  PL.demoTurnDamage = function(attacker, defender, moveId) {
    const move = PL.getMove(moveId);
    if (!move) return 0;
    const stab = attacker.types.includes(move.type);
    // Elegimos stats simples: atk/def para físico, spa/spd para especial
    const isPhysical = (move.category === "Físico");
    const atk = isPhysical ? attacker.baseStats.atk : attacker.baseStats.spa;
    const deff = isPhysical ? defender.baseStats.def : defender.baseStats.spd;

    return PL.calcDamage({
      level: attacker.level ?? 5,
      power: move.power,
      atk: atk,
      def: deff,
      attType: move.type,
      defTypes: defender.types,
      stab: stab,
      critChance: 0.0625
    });
  };

  // --- Comando de Plugin: Encuentro salvaje de demo ---
  PluginManager.registerCommand("PokeLite", "StartWildEncounter", async args => {
    try {
      await PL.loadAll();
      const speciesId = Number(args.speciesId || 1);
      const level = Number(args.level || 3);
      const species = PL.getSpecies(speciesId);
      if (!species) {
        $gameMessage.add(`No existe la especie con ID ${speciesId}.`);
        return;
      }
      const wild = {
        name: species.name,
        level: level,
        types: species.types,
        baseStats: species.baseStats
      };
      const hero = {
        name: $gameActors.actor(1)?.name() || "Héroe",
        level: $gameActors.actor(1)?.level || 5,
        types: ["Normal"],
        baseStats: {hp:45, atk:49, def:49, spa:45, spd:45, spe:45}
      };

      // Demostración: héroe usa Placaje (1) contra salvaje, y salvaje usa Ascuas (2) de vuelta si puede.
      const heroDmg = PL.demoTurnDamage(hero, wild, 1);
      const wildMoveId = species.learnset?.[1]?.[1] ?? 1; // segundo movimiento aprendido si existe
      const wildDmg = PL.demoTurnDamage(wild, hero, wildMoveId);

      $gameMessage.add(`¡Un ${wild.name} salvaje (Nv.${level}) apareció!`);
      $gameMessage.add(`${hero.name} usa Placaje → ${heroDmg} de daño.`);
      $gameMessage.add(`${wild.name} responde → ${wildDmg} de daño.`);
      $gameMessage.add(`(Demo) Multiplicadores de tipo y STAB aplicados.`);

    } catch (e) {
      console.error(e);
      $gameMessage.add(`[PokeLite] Error: ${e.message}`);
    }
  });

})();
