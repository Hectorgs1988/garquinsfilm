import { describe, expect, it } from 'vitest';
import { normalizeMediaDetail } from './catalog.detail.normalize.js';
import { TmdbInvalidResponseError } from './tmdb.errors.js';

const person = { id: 7, name: 'Persona', profile_path: '/profile.jpg' };
const provider = { provider_id: 8, provider_name: 'Plataforma', logo_path: '/logo.png', price: 99 };
const video = {
  id: 'video-1',
  name: 'Tráiler',
  site: 'YouTube',
  key: 'abcdefghijk',
  type: 'Trailer',
  official: true,
  iso_639_1: 'es',
};

function detail(type: 'movie' | 'tv', extra: Record<string, unknown> = {}) {
  return normalizeMediaDetail({ id: 10, title: 'Película', name: 'Serie', ...extra }, type, 10);
}

describe.each(['movie', 'tv'] as const)('ficha enriquecida %s', (type) => {
  it('expone reparto válido ordenado y sin duplicados, con fotos seguras', () => {
    const result = detail(type, {
      credits: {
        cast: [
          { ...person, id: 9, order: 3, character: 'Secundario' },
          { ...person, order: 0, profile_path: '//evil.test/photo.jpg' },
          { ...person, order: 1 },
          null,
          'persona',
          {},
          { ...person, id: 0 },
          { ...person, id: 1.5 },
          { ...person, id: Number.MAX_SAFE_INTEGER + 1 },
          { ...person, id: '11' },
          { ...person, id: 12, name: ' ' },
        ],
      },
    });
    expect(result.cast).toEqual([
      { tmdbId: 7, name: 'Persona', character: null, profileUrl: null, order: 0 },
      {
        tmdbId: 9,
        name: 'Persona',
        character: 'Secundario',
        profileUrl: 'https://image.tmdb.org/t/p/w185/profile.jpg',
        order: 3,
      },
    ]);
  });

  it.each([undefined, null, [], 'incorrecto', {}, { cast: {} }])(
    'tolera créditos ausentes o malformados: %j',
    (credits) => {
      expect(detail(type, { credits }).cast).toEqual([]);
    },
  );

  it('extrae únicamente España y conserva el proveedor en distintas modalidades, sin precios', () => {
    const result = detail(type, {
      'watch/providers': {
        id: 10,
        results: {
          US: { flatrate: [{ ...provider, provider_id: 90 }] },
          ES: {
            link: `https://www.themoviedb.org/${type}/10/watch?locale=ES`,
            flatrate: [
              provider,
              provider,
              null,
              { ...provider, provider_id: -1 },
              { ...provider, provider_name: '' },
            ],
            rent: [{ ...provider, logo_path: 'https://evil.test/x.jpg' }],
            buy: [provider],
            free: [provider],
            ads: [provider],
          },
        },
      },
    });
    expect(result.watchProviders).toEqual({
      region: 'ES',
      attribution: 'JustWatch',
      link: `https://www.themoviedb.org/${type}/10/watch?locale=ES`,
      subscription: [
        { tmdbId: 8, name: 'Plataforma', logoUrl: 'https://image.tmdb.org/t/p/w92/logo.png' },
      ],
      rent: [{ tmdbId: 8, name: 'Plataforma', logoUrl: null }],
      buy: [{ tmdbId: 8, name: 'Plataforma', logoUrl: 'https://image.tmdb.org/t/p/w92/logo.png' }],
    });
    expect(JSON.stringify(result)).not.toContain('price');
  });

  it('conserva enlaces TMDB con slug sin confundir IDs', () => {
    const link = `https://www.themoviedb.org/${type}/10-titulo-original/watch?locale=ES`;
    expect(
      detail(type, { 'watch/providers': { results: { ES: { link } } } }).watchProviders.link,
    ).toBe(link);
    const wrong = `https://www.themoviedb.org/${type}/100-titulo-original/watch?locale=ES`;
    expect(
      detail(type, { 'watch/providers': { results: { ES: { link: wrong } } } }).watchProviders.link,
    ).toBeNull();
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { results: null },
    { results: { US: { flatrate: [provider] } } },
    { results: { ES: { rent: {}, buy: 'malformed' } } },
  ])('representa disponibilidad no disponible sin inferir ausencia de ofertas: %j', (providers) => {
    expect(detail(type, { 'watch/providers': providers }).watchProviders).toEqual({
      region: 'ES',
      attribution: 'JustWatch',
      link: null,
      subscription: [],
      rent: [],
      buy: [],
    });
  });

  it.each([
    'http://www.themoviedb.org/movie/10/watch?locale=ES',
    'https://evil.test/',
    'javascript:alert(1)',
    'https://www.themoviedb.org.evil.test/movie/10/watch?locale=ES',
    'https://user@www.themoviedb.org/movie/10/watch?locale=ES',
    'https://www.themoviedb.org/movie/11/watch?locale=ES',
    'https://www.themoviedb.org/movie/10/watch?locale=US',
    'https://www.themoviedb.org/movie/10/watch?locale=ES&redirect=evil',
    'invalid',
  ])('descarta enlaces ajenos al título o inseguros: %s', (link) => {
    expect(
      detail(type, { 'watch/providers': { results: { ES: { link } } } }).watchProviders.link,
    ).toBeNull();
  });

  it('elige tráiler oficial, conserva otros vídeos compatibles y construye URLs sin autoplay', () => {
    const result = detail(type, {
      videos: {
        results: [
          { ...video, id: 'teaser', key: 'teaser12345', type: 'Teaser' },
          { ...video, id: 'fan', key: 'fanabcdefgh', official: false },
          video,
          video,
          { ...video, id: 'vimeo', key: '12345678', site: 'Vimeo', type: 'Clip', iso_639_1: null },
        ],
      },
    });
    expect(result.videos.map((item) => item.id)).toEqual(['video-1', 'fan', 'teaser', 'vimeo']);
    expect(result.trailer).toMatchObject({
      id: 'video-1',
      official: true,
      language: 'es',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      embedUrl: 'https://www.youtube-nocookie.com/embed/abcdefghijk',
    });
    expect(result.videos[3]?.embedUrl).toBe('https://player.vimeo.com/video/12345678');
    expect(JSON.stringify(result.videos)).not.toContain('autoplay');
  });

  it.each([
    { site: 'evil' },
    { key: '../abcdefgh' },
    { key: 'abc?x=12345' },
    { key: 'https://evil.test' },
    { key: '' },
    { key: '123', site: 'YouTube' },
    { site: 'Vimeo', key: 'abc' },
    { type: 'Unknown' },
    { name: '' },
    { id: '' },
  ])('descarta vídeo incompatible: %j', (invalid) => {
    const result = detail(type, { videos: { results: [{ ...video, ...invalid }, null] } });
    expect(result.videos).toEqual([]);
    expect(result.trailer).toBeNull();
  });

  it('usa teaser si no hay tráiler y no convierte clips en tráiler', () => {
    expect(
      detail(type, { videos: { results: [{ ...video, type: 'Teaser' }] } }).trailer?.type,
    ).toBe('Teaser');
    expect(detail(type, { videos: { results: [{ ...video, type: 'Clip' }] } }).trailer).toBeNull();
    expect(detail(type, { videos: null }).videos).toEqual([]);
  });

  it.each([0, -1, 1.5, '10', Number.MAX_SAFE_INTEGER + 1, 11, null])(
    'rechaza ID principal inválido o distinto: %j',
    (id) => {
      expect(() => detail(type, { id })).toThrow(TmdbInvalidResponseError);
    },
  );

  it.each(['credits', 'videos', 'watch/providers'])('rechaza ID discordante en %s', (resource) => {
    expect(() => detail(type, { [resource]: { id: 11 } })).toThrow(TmdbInvalidResponseError);
    expect(() => detail(type, { [resource]: { id: '10' } })).toThrow(TmdbInvalidResponseError);
  });

  it('descarta datos internos y no mezcla identidades movie/tv', () => {
    const result = detail(type, {
      api_key: 'private-fixture',
      status_message: 'private-fixture',
      credits: { cast: [{ ...person, email: 'private-fixture' }] },
    });
    expect(JSON.stringify(result)).not.toContain('private-fixture');
    expect(result).not.toHaveProperty(type === 'movie' ? 'creators' : 'directors');
  });
});

it('extrae solo directores de película y creadores de serie con IDs válidos y sin duplicados', () => {
  const credits = {
    crew: [
      { ...person, job: 'Director' },
      { ...person, job: 'Director' },
      { ...person, id: 8, job: 'Producer' },
      { ...person, id: 0, job: 'Director' },
      null,
    ],
  };
  const movie = detail('movie', { credits });
  const tv = detail('tv', { credits, created_by: [person, person, null, { ...person, id: -1 }] });
  if (movie.type !== 'movie' || tv.type !== 'tv') throw new Error('Wrong detail type');
  expect(movie.directors).toEqual([
    {
      tmdbId: 7,
      name: 'Persona',
      job: 'Director',
      profileUrl: 'https://image.tmdb.org/t/p/w185/profile.jpg',
    },
  ]);
  expect(tv.creators).toEqual([
    {
      tmdbId: 7,
      name: 'Persona',
      job: 'Creator',
      profileUrl: 'https://image.tmdb.org/t/p/w185/profile.jpg',
    },
  ]);
});

it('representa duración desconocida o cero como null', () => {
  expect(detail('movie', { runtime: 0 })).toHaveProperty('runtime', null);
});
