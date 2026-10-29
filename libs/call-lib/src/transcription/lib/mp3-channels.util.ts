/**
 * Число каналов MP3 по заголовку первого кадра. Яндекс SpeechKit требует
 * точного audioChannelCount и отвергает стерео-запись при «Audio has 2
 * channels, but 1 requested in specification» — телефония части порталов
 * отдаёт стерео, и все длинные звонки падали (gsr 29.10.2026). Чистая
 * функция, читает только начало файла.
 */
export type Mp3ChannelCount = 1 | 2;

/** Сколько байт просматриваем в поисках кадра: тег ID3 с обложкой бывает крупным. */
const SCAN_LIMIT = 1024 * 1024;

/** null — валидный кадр MP3 в начале файла не найден (не MP3 или битый). */
export function mp3ChannelCount(buffer: Buffer): Mp3ChannelCount | null {
    let offset = id3v2Size(buffer);
    const end = Math.min(buffer.length - 4, offset + SCAN_LIMIT);
    for (; offset <= end; offset++) {
        if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
            continue;
        }
        const second = buffer[offset + 1];
        const third = buffer[offset + 2];
        const version = (second >> 3) & 0x03; // 01 — зарезервировано
        const layer = (second >> 1) & 0x03; // 00 — зарезервировано
        const bitrate = third >> 4; // 1111 — недопустимо, 0000 — free
        const sampleRate = (third >> 2) & 0x03; // 11 — зарезервировано
        if (
            version === 1 ||
            layer === 0 ||
            bitrate === 0x0f ||
            bitrate === 0 ||
            sampleRate === 3
        ) {
            continue;
        }
        const mode = buffer[offset + 3] >> 6; // 11 — моно, иначе стерео
        return mode === 3 ? 1 : 2;
    }
    return null;
}

/** Размер тега ID3v2 в начале файла вместе с заголовком и footer; 0 — тега нет. */
function id3v2Size(buffer: Buffer): number {
    if (buffer.length < 10 || buffer.toString('latin1', 0, 3) !== 'ID3') {
        return 0;
    }
    const flags = buffer[5];
    const size =
        ((buffer[6] & 0x7f) << 21) |
        ((buffer[7] & 0x7f) << 14) |
        ((buffer[8] & 0x7f) << 7) |
        (buffer[9] & 0x7f);
    return 10 + size + (flags & 0x10 ? 10 : 0);
}
