import { parseEmbedUrl } from '../domain/site-media-embed.parse';

const YT = 'dQw4w9WgXcQ';
const RUTUBE = '0123456789abcdef0123456789abcdef';

describe('разбор ссылки на внешнее видео', () => {
    it.each([
        `https://www.youtube.com/watch?v=${YT}`,
        `https://youtube.com/watch?v=${YT}&t=42s&list=PL1`,
        `https://m.youtube.com/watch?v=${YT}`,
        `https://youtu.be/${YT}?si=abc`,
        `https://www.youtube.com/shorts/${YT}`,
        `https://www.youtube.com/embed/${YT}`,
        `https://www.youtube.com/live/${YT}?feature=share`,
        `https://www.youtube-nocookie.com/embed/${YT}`,
        `youtube.com/watch?v=${YT}`,
        `  http://youtu.be/${YT}  `,
    ])('YouTube: %s', url => {
        expect(parseEmbedUrl(url)).toEqual({ provider: 'youtube', id: YT });
    });

    it.each([
        `https://rutube.ru/video/${RUTUBE}/`,
        `https://rutube.ru/video/${RUTUBE}/?r=wd`,
        `https://rutube.ru/play/embed/${RUTUBE}`,
        `https://rutube.ru/shorts/${RUTUBE}`,
        `https://rutube.ru/video/${RUTUBE.toUpperCase()}/`,
    ])('Rutube: %s', url => {
        expect(parseEmbedUrl(url)).toEqual({ provider: 'rutube', id: RUTUBE });
    });

    it.each([
        ['https://vk.com/video-22822305_456242110', '-22822305_456242110'],
        ['https://vkvideo.ru/video-22822305_456242110', '-22822305_456242110'],
        ['https://vk.ru/video123_456', '123_456'],
        ['https://m.vk.com/clip-1_2', '-1_2'],
        [
            'https://vk.com/videos-1?z=video-22822305_456242110%2Fpl_cat_trends',
            '-22822305_456242110',
        ],
        [
            'https://vk.com/video_ext.php?oid=-22822305&id=456242110&hash=abc',
            '-22822305_456242110',
        ],
    ])('VK: %s', (url, id) => {
        expect(parseEmbedUrl(url)).toEqual({ provider: 'vk', id });
    });

    it.each([
        ['пусто', ''],
        [
            'сырой iframe',
            `<iframe src="https://www.youtube.com/embed/${YT}"></iframe>`,
        ],
        ['javascript:', `javascript:alert(1)//youtu.be/${YT}`],
        ['чужой домен', `https://evil.example/watch?v=${YT}`],
        ['похожий домен', `https://youtube.com.evil.ru/watch?v=${YT}`],
        ['логин в адресе', `https://youtube.com@evil.ru/watch?v=${YT}`],
        ['порт', `https://youtube.com:8443/watch?v=${YT}`],
        ['канал вместо ролика', 'https://www.youtube.com/@april'],
        ['плейлист', 'https://www.youtube.com/playlist?list=PL123'],
        ['короткий id YouTube', 'https://youtu.be/abc'],
        ['id YouTube с чужими знаками', 'https://youtu.be/dQw4w9WgXc$'],
        ['Rutube без id', 'https://rutube.ru/channel/123/'],
        [
            'закрытый ролик Rutube',
            `https://rutube.ru/video/private/${RUTUBE}/?p=key`,
        ],
        ['VK без ролика', 'https://vk.com/april'],
        [
            'VK с отрицательным номером ролика',
            'https://vk.com/video_ext.php?oid=1&id=-2',
        ],
        ['ftp', `ftp://youtu.be/${YT}`],
        ['слишком длинная', `https://youtu.be/${YT}?x=${'a'.repeat(600)}`],
    ])('отвергается: %s', (_name, url) => {
        expect(parseEmbedUrl(url)).toBeNull();
    });
});
