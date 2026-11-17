import {
    SITE_MEDIA_LIBRARY_LIMITS,
    type SiteMediaEmbedProvider,
} from './site-media-library.const';
import type { SiteMediaEmbedRef } from './site-media-library.types';

/**
 * Ссылка на внешнее видео → поставщик и id ролика. Чистая функция.
 *
 * В базу попадают только поставщик и id из белого списка: адрес плеера сайт
 * собирает сам, поэтому произвольный iframe или чужой домен на страницу не
 * попадёт. Всё, что не узнано, отвергается (null).
 *
 * Узнаются:
 * - YouTube: youtube.com/watch?v=…, youtu.be/…, /shorts/…, /embed/…, /live/…;
 * - Rutube: rutube.ru/video/<id>/, /play/embed/<id>, /shorts/<id>;
 * - VK Видео: vk.com|vk.ru|vkvideo.ru — /video<владелец>_<ролик>, /clip…,
 *   ?z=video…, /video_ext.php?oid=…&id=….
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const RUTUBE_ID = /^[0-9a-f]{32}$/;
/** Владелец (у сообщества — с минусом) и номер ролика. */
const VK_VIDEO = /^(?:video|clip)(-?\d{1,19})_(\d{1,19})(?:$|[/?&])/;
const VK_NUMBER = /^-?\d{1,19}$/;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com']);
const YOUTUBE_PATH_KINDS = new Set(['shorts', 'embed', 'live', 'v']);
const VK_HOSTS = new Set(['vk.com', 'vk.ru', 'vkvideo.ru']);

/** Сырой iframe, пробелы и угловые скобки — это не ссылка. */
const NOT_A_LINK = /[\s<>"']/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const ref = (
    provider: SiteMediaEmbedProvider,
    id: string | null | undefined,
    pattern: RegExp,
): SiteMediaEmbedRef | null =>
    id && pattern.test(id) ? { provider, id } : null;

/** Хост без www. и m. — у поставщиков это зеркала одного сайта. */
const bareHost = (host: string): string =>
    host.toLowerCase().replace(/^(?:www\.|m\.)/, '');

const segmentsOf = (url: URL): string[] =>
    url.pathname.split('/').filter(segment => segment.length > 0);

function parseYoutube(url: URL, host: string): SiteMediaEmbedRef | null {
    const segments = segmentsOf(url);
    if (host === 'youtu.be') return ref('youtube', segments[0], YOUTUBE_ID);
    if (!YOUTUBE_HOSTS.has(host)) return null;
    if (segments.length === 1 && segments[0] === 'watch') {
        return ref('youtube', url.searchParams.get('v'), YOUTUBE_ID);
    }
    if (segments.length >= 2 && YOUTUBE_PATH_KINDS.has(segments[0])) {
        return ref('youtube', segments[1], YOUTUBE_ID);
    }
    return null;
}

function parseRutube(url: URL): SiteMediaEmbedRef | null {
    const [first, second, third] = segmentsOf(url);
    const id =
        first === 'play' && second === 'embed'
            ? third
            : first === 'video' || first === 'shorts'
              ? second
              : undefined;
    return ref('rutube', id?.toLowerCase(), RUTUBE_ID);
}

const vkRef = (owner: string, video: string): SiteMediaEmbedRef | null =>
    VK_NUMBER.test(owner) && VK_NUMBER.test(video) && !video.startsWith('-')
        ? { provider: 'vk', id: `${owner}_${video}` }
        : null;

function parseVk(url: URL): SiteMediaEmbedRef | null {
    const [first] = segmentsOf(url);
    if (first === 'video_ext.php') {
        const owner = url.searchParams.get('oid');
        const video = url.searchParams.get('id');
        return owner && video ? vkRef(owner, video) : null;
    }
    for (const candidate of [first, url.searchParams.get('z')]) {
        const match = candidate ? VK_VIDEO.exec(candidate) : null;
        if (match) return vkRef(match[1], match[2]);
    }
    return null;
}

export function parseEmbedUrl(raw: string): SiteMediaEmbedRef | null {
    const text = raw.trim();
    if (
        text.length === 0 ||
        text.length > SITE_MEDIA_LIBRARY_LIMITS.embedUrl ||
        NOT_A_LINK.test(text)
    ) {
        return null;
    }
    let url: URL;
    try {
        url = new URL(HAS_SCHEME.test(text) ? text : `https://${text}`);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password || url.port) return null;

    const host = bareHost(url.hostname);
    if (host === 'rutube.ru') return parseRutube(url);
    if (VK_HOSTS.has(host)) return parseVk(url);
    return parseYoutube(url, host);
}
