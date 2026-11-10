import { MusicSource } from './types';
import itunes from './itunes';
import audius from './audius';
import netease from './netease';
import kuwo from './kuwo';
import kugou from './kugou';

export const SOURCE_REGISTRY: ReadonlyMap<string, MusicSource> = new Map([
  ['itunes', itunes],
  ['audius', audius],
  ['netease', netease],
  ['kuwo', kuwo],
  ['kugou', kugou],
]);