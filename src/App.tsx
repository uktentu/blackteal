import { INITIAL_SNAPSHOT } from './domain/snapshot';
import { TOPOLOGY } from './domain/topology';

/**
 * Scaffold placeholder. The data pack is transcribed and under test in src/domain/;
 * the simulator, rule engine, diagram, detail drawer and alarm console are next.
 * See CLAUDE.md §1 for the build order.
 */
export default function App() {
  const assetCount = TOPOLOGY.assets.length;
  const alarmCount = Object.values(INITIAL_SNAPSHOT.assets).reduce(
    (n, a) => n + a.alarms.length,
    0,
  );

  return (
    <main>
      <h1>BlackTeal — Interactive Live Site Diagram</h1>
      <p>
        Scaffold ready. Topology loaded: {assetCount} assets, {TOPOLOGY.links.length} links,{' '}
        {alarmCount} alarms in the initial frame.
      </p>
      <p>Not yet implemented — see CLAUDE.md for the build order.</p>
    </main>
  );
}
