/** Тексты ошибок картинок и видео сайта — для админки, по-русски. */
export const SITE_MEDIA_MESSAGES = {
    nothingUploaded: 'Нужен файл кадра или постер',
    unsupported:
        'Подходят картинки PNG, JPG, WebP и видео MP4 (H.264). Фото с iPhone (HEIC) и ролики MOV пересохраните в эти форматы',
    imageTooLarge: 'Картинка больше 10 МБ — сохраните в WebP или JPG',
    videoTooLarge:
        'Видео больше 80 МБ — сожмите (например, HandBrake: 1080p, H.264)',
    posterNotImage: 'Постер — это картинка PNG, JPG или WebP',
    posterForImage: 'Постер бывает только у видео',
    posterWithoutVideo: 'Постер ставится к видео: сначала загрузите ролик',
    slotEmpty: 'На этом месте ничего не загружено',
    posterMissing: 'У этого места нет постера',
    badKey: 'Раздел и место кадра — латиница в нижнем регистре, цифры и дефисы',
} as const;
