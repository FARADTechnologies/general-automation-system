// Simulated market data. Deterministic, fictional prices; never presented as live.
export const MARKET_LABEL = 'Simulated market data';

export interface Instrument { sym: string; nm: string; sctr: 'technology' | 'robotics' | 'energy' | 'healthcare' | 'finance'; px_minor: number; ccy: 'USD'; chg_1d: number; chg_1w: number; chg_1m: number }

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const NAMES: [string, string, Instrument['sctr']][] = [
  ['NOVX', 'Novexa Systems', 'technology'], ['QBTL', 'Qubitline', 'technology'], ['CLDR', 'Cloudrift', 'technology'], ['SEMX', 'Semixa Chips', 'technology'],
  ['DATN', 'Datanest', 'technology'], ['VRTX', 'Vertexon Software', 'technology'], ['LUMN', 'Luminar Networks', 'technology'], ['BYTF', 'Bytefield', 'technology'],
  ['ROBO', 'Robotica Works', 'robotics'], ['ARMX', 'Armex Automation', 'robotics'], ['SERV', 'Servox Dynamics', 'robotics'], ['MECH', 'Mechanica', 'robotics'],
  ['DRNE', 'Dronetic', 'robotics'], ['AUTM', 'Automind', 'robotics'], ['KINE', 'Kinetica Robotics', 'robotics'], ['GRPX', 'Gripworks', 'robotics'],
  ['SOLR', 'Solaris Grid', 'energy'], ['WNDX', 'Windex Power', 'energy'], ['CASP', 'Caspian Offshore', 'energy'], ['HYDR', 'Hydrogenix', 'energy'],
  ['BTRY', 'Batteryon', 'energy'], ['GRID', 'Gridline Utilities', 'energy'], ['NUCL', 'Nuclea', 'energy'], ['PIPE', 'Pipeway', 'energy'],
  ['GENX', 'Genexis Bio', 'healthcare'], ['MEDL', 'Medlane', 'healthcare'], ['CURA', 'Curative Labs', 'healthcare'], ['VITA', 'Vitalis Health', 'healthcare'],
  ['NEUR', 'Neuronix', 'healthcare'], ['PHRM', 'Pharmaxis', 'healthcare'], ['ORTH', 'Orthogen', 'healthcare'], ['DIAG', 'Diagnova', 'healthcare'],
  ['BNKX', 'Bankex Group', 'finance'], ['PAYF', 'Payflow', 'finance'], ['INSR', 'Insurion', 'finance'], ['LEDG', 'Ledgerline', 'finance'],
  ['CRDT', 'Creditas', 'finance'], ['TRDE', 'Tradewell', 'finance'], ['ASST', 'Assetra', 'finance'], ['FINX', 'Finexa', 'finance'],
];

export function marketData(): Instrument[] {
  const r = rng(1109);
  const round1 = (x: number) => Math.round(x * 10) / 10;
  return NAMES.map(([sym, nm, sctr]) => ({
    sym, nm, sctr, ccy: 'USD' as const,
    px_minor: Math.round((20 + r() * 380) * 100),
    chg_1d: round1((r() - 0.45) * 8), chg_1w: round1((r() - 0.45) * 14), chg_1m: round1((r() - 0.4) * 24),
  }));
}

export interface Holding { sym: string; qty: number; avg_px_minor: number }
export const seedPortfolio = (): Holding[] => [
  { sym: 'NOVX', qty: 4, avg_px_minor: 15000 },
  { sym: 'SOLR', qty: 10, avg_px_minor: 6200 },
  { sym: 'GENX', qty: 3, avg_px_minor: 21000 },
];
