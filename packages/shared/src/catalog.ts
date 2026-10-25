// Contratos del catálogo definidos en docs/API_INTEGRATION.md (ADR-007).
// Solo tipos y constantes: sin lógica de servidor, sin dependencias.

export const MEDIA_SOURCE = 'tmdb';

export type MediaSource = typeof MEDIA_SOURCE;
export type MediaType = 'movie' | 'tv';

/** Referencia estable a un contenido. El id numérico no identifica un título sin `type`. */
export interface MediaIdentity {
  source: MediaSource;
  type: MediaType;
  tmdbId: number;
}

export const SEARCH_TYPES = ['movie', 'tv', 'all'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export const SEARCH_DEFAULT_TYPE: SearchType = 'all';
export const SEARCH_QUERY_MIN_LENGTH = 1;
export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_PAGE_MIN = 1;
export const SEARCH_PAGE_MAX = 500;

export interface Paginated<T> {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

/** Datos comunes a búsqueda y detalle. Los datos ausentes se representan con `null`. */
export interface MediaSummary extends MediaIdentity {
  title: string;
  originalTitle: string;
  year: number | null;
  overview: string | null;
  posterUrl: string | null;
  voteAverage: number | null;
  voteCount: number | null;
}

export type MediaSearchResult = MediaSummary;
export type MediaSearchResponse = Paginated<MediaSearchResult>;

export interface MediaGenre {
  id: number;
  name: string;
}

export interface MediaCastMember {
  tmdbId: number;
  name: string;
  character: string | null;
  profileUrl: string | null;
  order: number | null;
}

export interface MediaCrewMember {
  tmdbId: number;
  name: string;
  job: 'Director' | 'Creator';
  profileUrl: string | null;
}

/** Solo proveedores y claves validados; el reproductor se carga tras una acción del usuario. */
export interface MediaVideo {
  id: string;
  name: string;
  site: 'YouTube' | 'Vimeo';
  key: string;
  type: 'Trailer' | 'Teaser' | 'Clip' | 'Featurette' | 'Behind the Scenes' | 'Bloopers';
  official: boolean;
  language: string | null;
  url: string;
  embedUrl: string;
}

export interface MediaWatchProvider {
  tmdbId: number;
  name: string;
  logoUrl: string | null;
}

/** Información de España, sin precios. Listas vacías significan disponibilidad no disponible. */
export interface MediaWatchProviders {
  region: 'ES';
  attribution: 'JustWatch';
  link: string | null;
  subscription: MediaWatchProvider[];
  rent: MediaWatchProvider[];
  buy: MediaWatchProvider[];
}

export interface MovieDetail extends MediaSummary {
  type: 'movie';
  cast: MediaCastMember[];
  directors: MediaCrewMember[];
  videos: MediaVideo[];
  trailer: MediaVideo | null;
  watchProviders: MediaWatchProviders;
  releaseDate: string | null;
  runtime: number | null;
  genres: MediaGenre[];
  status: string | null;
  backdropUrl: string | null;
  tagline: string | null;
}

export interface TvSeason {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
  posterUrl: string | null;
  /** `true` solo para la temporada 0 (especiales). */
  isSpecial: boolean;
}

export interface TvDetail extends MediaSummary {
  type: 'tv';
  cast: MediaCastMember[];
  creators: MediaCrewMember[];
  videos: MediaVideo[];
  trailer: MediaVideo | null;
  watchProviders: MediaWatchProviders;
  firstAirDate: string | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  status: string | null;
  genres: MediaGenre[];
  backdropUrl: string | null;
  seasons: TvSeason[];
}

export type MediaDetail = MovieDetail | TvDetail;

/** Códigos HTTP de error previstos para las rutas del catálogo. */
export const CATALOG_ERROR_STATUS_CODES = [400, 401, 404, 429, 502, 503, 504] as const;
export type CatalogErrorStatusCode = (typeof CATALOG_ERROR_STATUS_CODES)[number];

/** Cuerpo público de error: mensaje genérico, sin detalles internos ni de TMDB. */
export interface ApiErrorBody {
  error: string;
}
