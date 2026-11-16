// Headless check of the simulation: plays bot-only matches and prints how each round ended.
import { createSim, stepSim } from '../game/src/sim/game.js';

const seeds = process.argv.slice(2).map(Number);
for (const seed of seeds.length ? seeds : [1, 2, 3]) {
  const sim = createSim({ seed, autopilot: true });
  const tally = { shots: 0, hits: 0, kills: 0, heads: 0, nades: 0, plants: 0, defuses: 0, booms: 0, buys: 0 };
  const lines = [];
  const t0 = performance.now();
  let steps = 0;
  while (sim.round.phase !== 'matchover' && steps < 60 * 60 * 25) {
    stepSim(sim);
    steps++;
    sim.events.forEach((e) => {
      if (e.type === 'shot') tally.shots++;
      else if (e.type === 'hit') tally.hits++;
      else if (e.type === 'kill') { tally.kills++; if (e.n) tally.heads++; }
      else if (e.type === 'throw') tally.nades++;
      else if (e.type === 'planted') tally.plants++;
      else if (e.type === 'defused') tally.defuses++;
      else if (e.type === 'detonate') tally.booms++;
      else if (e.type === 'buy') tally.buys++;
      else if (e.type === 'roundEnd') {
        const atk = sim.match.attackSquad;
        lines.push(`r${sim.round.number} winner=squad${e.n}(${e.n === atk ? 'atk' : 'def'}) ${e.id} t=${sim.round.elapsed.toFixed(1)} score=${sim.match.scores.join('-')} plan=${sim.tactics[atk].plan?.name}`);
      }
    });
    sim.events.clear();
  }
  const ms = performance.now() - t0;
  console.log(`seed ${seed}: ${lines.length} rounds, ${(steps / 60).toFixed(0)} s game time in ${ms.toFixed(0)} ms (${(ms / steps * 1000).toFixed(1)} us/step)`);
  for (const l of lines) console.log('  ' + l);
  console.log('  ', JSON.stringify(tally));
  console.log('   K/D', sim.soldiers.map((s) => `${s.name}:${s.kills}/${s.deaths}`).join(' '));
}
