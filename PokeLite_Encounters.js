/*:
 * @target MZ
 * @plugindesc PokeLite Encounters v0.3 — Encuentros por regiones + acepta NOMBRES de especie
 * @author Daniel + ChatGPT
 *
 * @param EncounterRegionIDs
 * @text Regiones de hierba
 * @type number[]
 * @default ["1"]
 *
 * @param BaseSteps
 * @text Pasos base entre encuentros
 * @type number
 * @min 1
 * @default 20
 *
 * @param Enabled
 * @text Activado por defecto
 * @type boolean
 * @on Sí
 * @off No
 * @default true
 *
 * @command EncountersEnabled
 * @text Activar/Desactivar encuentros
 * @arg enabled
 * @type boolean
 * @default true
 *
 * @command SetEncounterRegions
 * @text Fijar regiones de hierba
 * @arg regions
 * @type number[]
 * @default ["1"]
 *
 * @command SetBaseSteps
 * @text Fijar pasos base
 * @arg steps
 * @type number
 * @default 20
 */
var PokeLiteEnc = PokeLiteEnc || {};
(() => {
  "use strict";
  const PL = (window.PokeLite || {});
  const PLE = (PokeLiteEnc = PokeLiteEnc || {});
  const params = PluginManager.parameters("PokeLite_Encounters");
  let EncounterRegionIDs = JSON.parse(params["EncounterRegionIDs"]||"[]").map(Number);
  let BaseSteps = Number(params["BaseSteps"] || 20);
  let Enabled = (params["Enabled"] === "true");

  // Plugin commands
  PluginManager.registerCommand("PokeLite_Encounters", "EncountersEnabled", args => {
    Enabled = (args.enabled === "true");
  });
  PluginManager.registerCommand("PokeLite_Encounters", "SetEncounterRegions", args => {
    EncounterRegionIDs = JSON.parse(args.regions||"[]").map(Number);
  });
  PluginManager.registerCommand("PokeLite_Encounters", "SetBaseSteps", args => {
    BaseSteps = Math.max(1, Number(args.steps||20));
  });

  // Utils
  function isGrassRegion(x,y) {
    const rid = $gameMap.regionId(x,y);
    return EncounterRegionIDs.includes(rid);
  }

  function resolveSpeciesId(idOrName) {
    if (!idOrName) return null;
    const s = String(idOrName).trim();
    if (/^\d+$/.test(s)) return s; // ya es ID
    // resolver por nombre (minúsculas)
    const key = s.toLowerCase();
    const idx = PL.SpeciesIndex?.byName || {};
    const found = idx[key];
    return found || null;
  }

  function parseEncounterTableFromMap(map) {
    const note = (map && map.note) || "";
    const rx = /<EncounterTable>([\s\S]*?)<\/EncounterTable>/i;
    const m = note.match(rx);
    if (!m) return null;
    const lines = m[1].split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith("#") && !s.startsWith("//"));
    const entries = [];
    for (const ln of lines) {
      const parts = ln.split(",").map(s=>s.trim()).filter(s=>s.length>0);
      if (parts.length < 3) continue;
      const resolvedId = resolveSpeciesId(parts[0]);
      if (!resolvedId) {
        $gameMessage.add(`[Encuentros] No se reconoce la especie "${parts[0]}". Verifica nombre/ID.`);
        continue;
      }
      const minL = Number(parts[1]);
      const maxL = Number(parts[2]);
      const weight = (parts[3]!==undefined) ? Number(parts[3]) : 1;
      if (minL>0 && maxL>=minL) {
        entries.push({id: resolvedId, minL, maxL, weight: Math.max(1, weight)});
      }
    }
    return entries.length ? entries : null;
  }

  function weightedPick(entries) {
    const total = entries.reduce((a,e)=>a+e.weight,0);
    let r = Math.random()*total;
    for (const e of entries) {
      if ((r -= e.weight) <= 0) return e;
    }
    return entries[entries.length-1];
  }

  class EncounterState {
    constructor() { this.reset(); }
    reset() {
      this.stepCounter = 0;
      this.rollTarget = this.rollNextTarget();
    }
    rollNextTarget() {
      const min = Math.max(1, Math.floor(BaseSteps*0.5));
      const max = Math.max(min, Math.floor(BaseSteps*1.5));
      return Math.floor(Math.random()*(max-min+1)) + min;
    }
  }
  PLE._state = new EncounterState();

  const _Game_Player_moveStraight = Game_Player.prototype.moveStraight;
  Game_Player.prototype.moveStraight = function(d) {
    _Game_Player_moveStraight.call(this,d);
    if (!Enabled) return;
    if (!$gameMap || !$dataMap) return;
    if (!PL || !PL.loadAll) return;
    if (this.isMovementSucceeded()) {
      const x = this.x, y = this.y;
      if (isGrassRegion(x,y)) {
        PLE._state.stepCounter++;
        if (PLE._state.stepCounter >= PLE._state.rollTarget) {
          PL.loadAll().then(()=>{
            const entries = parseEncounterTableFromMap($dataMap);
            if (entries && entries.length) {
              const pick = weightedPick(entries);
              const level = Math.floor(Math.random()*(pick.maxL - pick.minL + 1)) + pick.minL;
              const species = (PL.getSpecies && PL.getSpecies(pick.id)) || (PL.DB?.species?.species?.[pick.id]);
              if (!species) {
                $gameMessage.add(`[Encuentros] Especie ${pick.id} no existe en species.json`);
              } else {
                const wild = { name: species.name, level: level, types: species.types, baseStats: species.baseStats };
                const hero = {
                  name: $gameActors.actor(1)?.name() || "Héroe",
                  level: $gameActors.actor(1)?.level || 5,
                  types: ["Normal"],
                  baseStats: {hp:45, atk:49, def:49, spa:45, spd:45, spe:45}
                };
                const heroDmg = (PL.demoTurnDamage ? PL.demoTurnDamage(hero, wild, 1) : 0);
                const wildMoveId = species.learnset?.[1]?.[1] ?? 1;
                const wildDmg = (PL.demoTurnDamage ? PL.demoTurnDamage(wild, hero, wildMoveId) : 0);

                $gameMessage.add(`¡Un ${wild.name} salvaje (Nv.${level}) apareció!`);
                $gameMessage.add(`${hero.name} usa Placaje → ${heroDmg} de daño.`);
                $gameMessage.add(`${wild.name} responde → ${wildDmg} de daño.`);
                $gameMessage.add(`(Encuentro demo por NOMBRE) STAB y tipos aplicados.`);
              }
              PLE._state.reset();
            } else {
              PLE._state.reset();
            }
          }).catch(e=>{
            console.error(e);
            $gameMessage.add(`[Encuentros] Error al cargar datos: ${e.message}`);
            PLE._state.reset();
          });
        }
      }
    }
  };

  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function() {
    _Scene_Map_onMapLoaded.call(this);
    PLE._state.reset();
    if ($dataMap && DataManager.extractMetadata) {
      DataManager.extractMetadata($dataMap);
    }
  };
})();
