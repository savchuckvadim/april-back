/**
 * Кадры MP3 для резки длинных звонков на куски — без перекодирования и без
 * ffmpeg (19.11.2026: длинный звонок целиком не укладывается в срок ответа
 * бесплатного распознавателя, кусками — да). Резка — mp3-split.util.
 *
 * Поток MPEG-1/2/2.5 Layer III — цепочка кадров: заголовок в 4 байта
 * говорит длину кадра, частоту и сколько сэмплов в нём, поэтому время
 * каждого кадра известно без декодирования. Первые миллисекунды куска
 * декодер может отдать тишиной (кадр ссылается на «резервуар» предыдущего,
 * которого в куске нет) — это перекрывает нахлёст соседних кусков.
 *
 * Чистые функции: без DI и сети.
 */
import { id3v2Size } from '../lib/mp3-channels.util';

type MpegVersion = 'mpeg1' | 'mpeg2' | 'mpeg25';

export interface Mp3FrameHeader {
    version: MpegVersion;
    sampleRate: number;
    /** Сэмплов в кадре: 1152 у MPEG-1, 576 у MPEG-2 и 2.5. */
    samplesPerFrame: number;
    /** Длина кадра в байтах вместе с заголовком. */
    length: number;
    mono: boolean;
    /** За заголовком два байта CRC. */
    crc: boolean;
}

/** Аудиокадры потока: кадр Xing/Info/VBRI сюда не входит. */
export interface Mp3FrameMap {
    offsets: number[];
    lengths: number[];
    /** Длительность одного кадра, секунд (частота в потоке одна). */
    frameSec: number;
}

/** Версия по двум битам заголовка; 01 — зарезервировано. */
const VERSIONS: readonly (MpegVersion | null)[] = [
    'mpeg25',
    null,
    'mpeg2',
    'mpeg1',
];
/** Биты слоя у Layer III. */
const LAYER_III = 1;
const BITRATES_KBPS_MPEG1 = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const BITRATES_KBPS_MPEG2 = [
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const SAMPLE_RATES: Record<MpegVersion, readonly number[]> = {
    mpeg1: [44100, 48000, 32000],
    mpeg2: [22050, 24000, 16000],
    mpeg25: [11025, 12000, 8000],
};

/** Сколько байт от начала ищем первый кадр: тег с обложкой бывает крупным. */
const SYNC_SCAN_LIMIT = 1024 * 1024;
/** Столько кадров подряд — признак, что найден поток, а не случайные байты. */
const CONFIRM_FRAMES = 3;

/** Заголовок кадра Layer III по смещению; null — здесь не кадр. */
export function parseMp3FrameHeader(
    buffer: Buffer,
    offset: number,
): Mp3FrameHeader | null {
    if (offset < 0 || offset + 4 > buffer.length) return null;
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
        return null;
    }
    const second = buffer[offset + 1];
    const third = buffer[offset + 2];
    const version = VERSIONS[(second >> 3) & 0x03];
    const bitrateIndex = third >> 4;
    const rateIndex = (third >> 2) & 0x03;
    if (
        !version ||
        ((second >> 1) & 0x03) !== LAYER_III ||
        bitrateIndex === 0 ||
        bitrateIndex === 0x0f ||
        rateIndex === 3
    ) {
        return null;
    }
    const isMpeg1 = version === 'mpeg1';
    const bitrate =
        (isMpeg1 ? BITRATES_KBPS_MPEG1 : BITRATES_KBPS_MPEG2)[bitrateIndex] *
        1000;
    const sampleRate = SAMPLE_RATES[version][rateIndex];
    const padding = (third >> 1) & 0x01;
    return {
        version,
        sampleRate,
        samplesPerFrame: isMpeg1 ? 1152 : 576,
        length:
            Math.floor(((isMpeg1 ? 144 : 72) * bitrate) / sampleRate) + padding,
        mono: buffer[offset + 3] >> 6 === 3,
        crc: (second & 0x01) === 0,
    };
}

const sameStream = (a: Mp3FrameHeader, b: Mp3FrameHeader): boolean =>
    a.version === b.version && a.sampleRate === b.sampleRate;

/** Кадр того же потока по смещению; null — не кадр или чужой поток. */
const frameAt = (
    buffer: Buffer,
    offset: number,
    stream: Mp3FrameHeader,
): Mp3FrameHeader | null => {
    const header = parseMp3FrameHeader(buffer, offset);
    return header && sameStream(header, stream) ? header : null;
};

/** С этого смещения идут `count` кадров одного потока подряд. */
function isFrameRun(buffer: Buffer, offset: number, count: number): boolean {
    const first = parseMp3FrameHeader(buffer, offset);
    if (!first) return false;
    let position = offset + first.length;
    for (let index = 1; index < count; index++) {
        const header = frameAt(buffer, position, first);
        if (!header) return false;
        position += header.length;
    }
    return true;
}

/**
 * После мусора внутри потока — следующий кадр, за которым стоит ещё один
 * (или конец файла): одиночный «заголовок» в мусоре кадром не считается.
 */
function resync(
    buffer: Buffer,
    from: number,
    stream: Mp3FrameHeader,
): number | null {
    for (let offset = from; offset + 4 <= buffer.length; offset++) {
        const header = frameAt(buffer, offset, stream);
        if (!header) continue;
        const next = offset + header.length;
        if (next === buffer.length || frameAt(buffer, next, stream)) {
            return offset;
        }
    }
    return null;
}

/** Кадр-заголовок VBR (Xing/Info у LAME, VBRI у Fraunhofer): звука в нём нет. */
function isVbrHeaderFrame(
    buffer: Buffer,
    offset: number,
    header: Mp3FrameHeader,
): boolean {
    const sideInfo =
        header.version === 'mpeg1'
            ? header.mono
                ? 17
                : 32
            : header.mono
              ? 9
              : 17;
    const xingAt = offset + 4 + (header.crc ? 2 : 0) + sideInfo;
    const tag = buffer.toString('latin1', xingAt, xingAt + 4);
    return (
        tag === 'Xing' ||
        tag === 'Info' ||
        buffer.toString('latin1', offset + 36, offset + 40) === 'VBRI'
    );
}

/**
 * Аудиокадры записи: тег ID3v2 в начале пропускается, начало потока —
 * первые три кадра подряд, мусор внутри — пересинхронизация, обрезанный
 * последний кадр и хвостовые теги отбрасываются. null — не MP3 Layer III
 * или битый поток.
 */
export function scanMp3Frames(buffer: Buffer): Mp3FrameMap | null {
    const from = id3v2Size(buffer);
    const scanEnd = Math.min(buffer.length - 4, from + SYNC_SCAN_LIMIT);
    let start = -1;
    for (let offset = from; offset <= scanEnd; offset++) {
        if (isFrameRun(buffer, offset, CONFIRM_FRAMES)) {
            start = offset;
            break;
        }
    }
    const stream = start < 0 ? null : parseMp3FrameHeader(buffer, start);
    if (!stream) return null;

    const offsets: number[] = [];
    const lengths: number[] = [];
    let position: number | null = start;
    while (position !== null && position + 4 <= buffer.length) {
        const header = frameAt(buffer, position, stream);
        if (!header) {
            position = resync(buffer, position + 1, stream);
            continue;
        }
        if (position + header.length > buffer.length) break;
        offsets.push(position);
        lengths.push(header.length);
        position += header.length;
    }
    if (isVbrHeaderFrame(buffer, start, stream)) {
        offsets.shift();
        lengths.shift();
    }
    if (offsets.length === 0) return null;
    return {
        offsets,
        lengths,
        frameSec: stream.samplesPerFrame / stream.sampleRate,
    };
}
