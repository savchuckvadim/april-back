import type { SiteMediaUsage } from './site-media-library.types';

/** Тексты ошибок медиатеки — для админки, по-русски и без кодов. */
export const SITE_MEDIA_LIBRARY_MESSAGES = {
    notFound: 'Медиа не найдено в медиатеке — возможно, его уже удалили',
    fileRequired: 'Нужен файл: картинка PNG, JPG, WebP или ролик MP4',
    embedUnknown:
        'Ссылка не распознана. Подходят ролики YouTube, Rutube и VK Видео — ссылка на сам ролик, а не на канал или плейлист',
    embedOnlyForVideo:
        'Внешняя ссылка бывает только у видео: у картинки её нет',
    embedRequired:
        'У внешнего видео ссылка обязательна: чтобы убрать ролик, удалите медиа целиком',
    noFileForEmbed:
        'У внешнего видео нет файла на сервере: загрузите ролик отдельным медиа',
    kindChanged:
        'Вид медиа не меняется: картинку заменяют картинкой, ролик — роликом. Для другого вида загрузите новое медиа',
    darkOnlyForImage: 'Тёмный вариант бывает только у картинки',
    darkMissing: 'У этой картинки нет тёмного варианта',
    darkNotImage: 'Тёмный вариант — это картинка PNG, JPG или WebP',
    posterOnlyForVideo: 'Постер бывает только у видео',
    posterMissing: 'У этого ролика нет постера',
    videoMetaForImage:
        'Размеры и длительность задаются только ролику: у картинки их читает сервер',
    imageUnreadable:
        'Картинку не удалось прочитать — файл повреждён. Пересохраните его в PNG, JPG или WebP',
    imageTooWide: 'Сторона картинки больше 65 535 точек — уменьшите её',
    inUseRace:
        'Медиа стоит в статье — сначала уберите его оттуда, затем удалите',
} as const;

const usageLabel = (usage: SiteMediaUsage): string => {
    const where = `${usage.section}/${usage.slug}`;
    return usage.title ? `«${usage.title}» (${where})` : where;
};

/** «стоит в статьях: …» — сколько угодно статей, но не больше пяти по имени. */
export function siteMediaInUseMessage(
    usages: readonly SiteMediaUsage[],
): string {
    const labels = [...new Set(usages.map(usageLabel))];
    const shown = labels.slice(0, 5).join(', ');
    const rest = labels.length > 5 ? ` и ещё ${labels.length - 5}` : '';
    return `Медиа нельзя удалить — стоит в статьях: ${shown}${rest}. Сначала уберите его оттуда`;
}
