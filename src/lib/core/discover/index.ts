/** Public API of the Discover layer (cluster mining + scoring). */

export type {
  ClusterMember,
  RhymeCluster,
  ClusterCatalog
} from './types.js';

export { mineClusters, type MineOptions } from './miner.js';
