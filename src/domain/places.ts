import type {Anchor, PlaceMatch, VoiceIntent} from './types';

const PLACE_ALIASES: Record<string, string[]> = {
  Sm: ['sm', 'sm city', 'sm city bacolod', 'sm bacolod'],
  Ayala: ['ayala', 'ayala malls', 'ayala capitol central'],
  Lasalle: [
    'la salle',
    'lasalle',
    'usls',
    'university of saint la salle',
    'university of st la salle',
  ],
  'North Terminal': ['north terminal', 'bacolod north terminal'],
  'South Terminal': ['south terminal', 'bacolod south terminal'],
  'Burgos Market': ['burgos', 'burgos market', 'old central market'],
  Libertad: ['libertad', 'libertad market'],
  'Central Market': ['central market', 'bacolod central market'],
  Bgc: ['bgc', 'banago government center', 'government center'],
};

export function normalizePlaceText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(st\.?|saint)\b/g, 'saint')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(first: string, second: string): number {
  const previous = Array.from({length: second.length + 1}, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let diagonal = previous[0];
    previous[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const above = previous[secondIndex];
      previous[secondIndex] = Math.min(
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + 1,
        diagonal + (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[second.length];
}

function similarity(query: string, candidate: string): number {
  if (!query || !candidate) {
    return 0;
  }
  if (query === candidate) {
    return 1;
  }
  if (candidate.includes(query) || query.includes(candidate)) {
    return 0.92 - Math.abs(candidate.length - query.length) * 0.005;
  }
  const queryTokens = new Set(query.split(' '));
  const candidateTokens = new Set(candidate.split(' '));
  const intersection = [...queryTokens].filter(token => candidateTokens.has(token)).length;
  const union = new Set([...queryTokens, ...candidateTokens]).size;
  const tokenScore = union ? intersection / union : 0;
  const editScore =
    1 - levenshtein(query, candidate) / Math.max(query.length, candidate.length);
  return Math.max(tokenScore * 0.9, editScore * 0.8);
}

export function searchPlaces(
  landmarks: Anchor[],
  query: string,
  limit = 5,
): PlaceMatch[] {
  const normalizedQuery = normalizePlaceText(query);
  return landmarks
    .map(landmark => {
      const aliases = [landmark.name, ...(PLACE_ALIASES[landmark.name] ?? [])];
      const score = Math.max(
        ...aliases.map(alias => similarity(normalizedQuery, normalizePlaceText(alias))),
      );
      return {...landmark, aliases, score};
    })
    .filter(candidate => candidate.score >= 0.42)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

const politePrefix =
  /^(?:please\s+)?(?:can you\s+|could you\s+|show me\s+|tell me\s+|i want to\s+|i need to\s+)?/i;

export function parseVoiceIntent(transcript: string): VoiceIntent {
  const cleaned = transcript
    .trim()
    .replace(politePrefix, '')
    .replace(/^(?:directions?|route|navigate|take me|go|travel)\s+/i, '')
    .replace(/[?.!,]+$/g, '')
    .trim();

  const fromTo = cleaned.match(/^(?:from\s+)?(.+?)\s+(?:to|going to)\s+(.+)$/i);
  if (fromTo) {
    return {
      kind: 'route',
      originText: fromTo[1].replace(/^from\s+/i, '').trim(),
      destinationText: fromTo[2].trim(),
    };
  }

  const destinationOnly = cleaned.match(/^(?:to\s+)?(.+)$/);
  if (destinationOnly?.[1]) {
    return {
      kind: 'route',
      originText: null,
      destinationText: destinationOnly[1].trim(),
    };
  }

  return {
    kind: 'incomplete',
    message: 'Say “from Ayala to SM” or “take me to La Salle.”',
  };
}

export function chooseConfidentPlace(
  landmarks: Anchor[],
  query: string,
): PlaceMatch | null {
  const matches = searchPlaces(landmarks, query, 2);
  if (!matches.length || matches[0].score < 0.62) {
    return null;
  }
  if (matches[1] && matches[0].score - matches[1].score < 0.06) {
    return null;
  }
  return matches[0];
}
