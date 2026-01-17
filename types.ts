export interface KanjiEntry {
  id: string;
  char: string;
  oldChar?: string; // e.g., (亞)
  on: string[]; // Katakana readings
  kun: string[]; // Hiragana readings
  examples: string[];
  note?: string;
}

export enum AppMode {
  HOME = 'HOME',
  QUIZ = 'QUIZ',
  REVIEW = 'REVIEW',
  STATS = 'STATS'
}

export interface ProgressState {
  masteredIds: string[];
  mistakeIds: string[];
  lastReviewDate: string | null;
}