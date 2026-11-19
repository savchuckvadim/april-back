/**
 * Синтетический MP3 для спек резки: кадры с настоящими заголовками и
 * номером кадра в теле — тест узнаёт, какие кадры попали в кусок.
 */

/**
 * «Телефонный» кадр: MPEG-2.5 Layer III, 8 кбит/с, 8 кГц, моно, без CRC —
 * 72 байта и 576 сэмплов, то есть 72 мс.
 */
export const PHONE_FRAME_BYTES = 72;
export const PHONE_FRAME_SEC = 0.072;
const PHONE_HEADER = [0xff, 0xe3, 0x18, 0xc0];

/** Смещение номера кадра в теле (до места тега Xing — 13-й байт). */
const INDEX_OFFSET = 4;

export function phoneFrame(index: number): Buffer {
    const frame = Buffer.alloc(PHONE_FRAME_BYTES, 0);
    Buffer.from(PHONE_HEADER).copy(frame, 0);
    frame.writeUInt32BE(index, INDEX_OFFSET);
    return frame;
}

/** Запись из `count` телефонных кадров с номерами 0..count-1. */
export function phoneMp3(count: number): Buffer {
    return Buffer.concat(
        Array.from({ length: count }, (_value, index) => phoneFrame(index)),
    );
}

/** Кадр-заголовок LAME (Info) того же потока: звука в нём нет. */
export function phoneInfoFrame(): Buffer {
    const frame = phoneFrame(0xffff);
    frame.write('Info', 4 + 9, 'latin1');
    return frame;
}

/** Номер кадра, с которого начинается буфер (или по смещению). */
export const frameIndexAt = (buffer: Buffer, offset = 0): number =>
    buffer.readUInt32BE(offset + INDEX_OFFSET);

/** Номера всех кадров буфера из телефонных кадров. */
export function frameIndexes(buffer: Buffer): number[] {
    const indexes: number[] = [];
    for (let offset = 0; offset < buffer.length; offset += PHONE_FRAME_BYTES) {
        indexes.push(frameIndexAt(buffer, offset));
    }
    return indexes;
}

/** Тег ID3v2.3 без флагов с телом в `bodySize` байт (до 127). */
export const id3Tag = (bodySize: number): Buffer =>
    Buffer.concat([
        Buffer.from('ID3', 'latin1'),
        Buffer.from([0x03, 0x00, 0x00, 0, 0, 0, bodySize]),
        Buffer.alloc(bodySize, 0x41),
    ]);

/** Кадр MPEG-1 Layer III, 128 кбит/с, 44,1 кГц; с padding на байт длиннее. */
export function mpeg1Frame(padding: boolean): Buffer {
    const frame = Buffer.alloc(padding ? 418 : 417, 0);
    Buffer.from([0xff, 0xfb, padding ? 0x92 : 0x90, 0x00]).copy(frame, 0);
    return frame;
}
