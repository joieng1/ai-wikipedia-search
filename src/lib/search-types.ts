export interface SearchRequest {
  startWord: string;
  endWord: string;
  model: string;
}

export interface SearchStep {
  href: string;
  text: string;
  origin: string;
}

export interface SearchUpdate {
  direction?: 'forward' | 'backward';
  path?: SearchStep[];
  time?: number;
  finished?: boolean;
  error?: string;
  status?: string;
}

export interface WorkerMessage {
  kind: 'update' | 'done';
  update?: SearchUpdate;
}
