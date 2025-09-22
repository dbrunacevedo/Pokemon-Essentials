/*:
 * @target MZ
 * @plugindesc PokeLite NameIndex v0.3 — Índice nombre→ID para especies (case-insensitive)
 * @author Daniel + ChatGPT
 */
var PokeLite = PokeLite || {};
var PokeLiteNameIndex = PokeLiteNameIndex || {};
(() => {
  "use strict";
  const PL = (PokeLite = PokeLite || {});
  const NI = (PokeLiteNameIndex = PokeLiteNameIndex || {});

  // Construye y expone PL.SpeciesIndex: { byId:{}, byName:{lowerName: id} }
  PL.buildSpeciesIndex = function() {
    const sp = PL.DB?.species?.species || {};
    const byId = {};
    const byName = {};
    for (const key of Object.keys(sp)) {
      const entry = sp[key];
      const id = /^\d+$/.test(key) ? key : (entry.id && String(entry.id)) || null;
      const finalId = id || key; // si no hay id numérico, usemos la propia clave como fallback
      byId[finalId] = entry;

      // name visible
      if (entry.name) {
        byName[entry.name.toLowerCase()] = finalId;
      }
      // también mapea la clave en minúsculas (por si viene "BULBASAUR")
      byName[String(key).toLowerCase()] = finalId;
    }
    PL.SpeciesIndex = { byId, byName };
    console.info("[PokeLite] SpeciesIndex construido:", Object.keys(byId).length, "entradas");
  };

  // Hook a loadAll para construir índice tras cargar species.json
  const _PL_loadAll = PL.loadAll;
  PL.loadAll = async function() {
    await _PL_loadAll();
    PL.buildSpeciesIndex();
  };
})();
