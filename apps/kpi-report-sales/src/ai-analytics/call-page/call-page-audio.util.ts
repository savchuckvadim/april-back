/**
 * Отдача записи разговора с перемоткой. Браузер просит кусок файла
 * заголовком Range; Битрикс может его не поддержать и прислать файл
 * целиком — тогда нужный кусок вырезаем сами, на лету, не складывая файл
 * в память или на диск. Чистые функции и поток-«окно».
 */
import { Transform, type TransformCallback } from 'node:stream';

/** Запрошенный кусок файла: байты с `start` по `end` включительно. */
export interface ByteRange {
    start: number;
    /** null — до конца файла. */
    end: number | null;
}

/** Что ответил источник записи. */
export interface AudioUpstream {
    status: number;
    contentLength: number | null;
    contentRange: string | null;
    contentType: string | null;
}

/** Как отвечать браузеру. */
export interface AudioResponsePlan {
    status: 200 | 206 | 416;
    headers: Record<string, string>;
    /** Сколько байт источника пропустить перед отдачей. */
    skip: number;
    /** Сколько байт отдать; null — всё, что придёт. */
    take: number | null;
}

/**
 * Заголовок Range вида «bytes=100-» или «bytes=100-200». Несколько кусков и
 * «последние N байт» не поддерживаем — null, файл уйдёт целиком.
 */
export function parseRangeHeader(header: string | undefined): ByteRange | null {
    const match = /^bytes=(\d+)-(\d*)$/.exec(header?.trim() ?? '');
    if (!match) return null;
    const start = Number(match[1]);
    const end = match[2] === '' ? null : Number(match[2]);
    if (!Number.isSafeInteger(start)) return null;
    if (end !== null && (!Number.isSafeInteger(end) || end < start))
        return null;
    return { start, end };
}

/** Значение Range для запроса к источнику. */
export const rangeHeaderOf = (range: ByteRange): string =>
    `bytes=${range.start}-${range.end ?? ''}`;

const audioTypeOf = (contentType: string | null): string =>
    contentType?.toLowerCase().startsWith('audio/')
        ? contentType
        : 'audio/mpeg';

export function planAudioResponse(
    upstream: AudioUpstream,
    range: ByteRange | null,
): AudioResponsePlan {
    const headers: Record<string, string> = {
        'Content-Type': audioTypeOf(upstream.contentType),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
    };
    const total = upstream.contentLength;

    // Источник сам отдал нужный кусок.
    if (upstream.status === 206 && upstream.contentRange) {
        headers['Content-Range'] = upstream.contentRange;
        if (total !== null) headers['Content-Length'] = String(total);
        return { status: 206, headers, skip: 0, take: null };
    }

    // Кусок не просили или размер файла неизвестен — отдаём целиком.
    if (range === null || total === null) {
        if (total !== null) headers['Content-Length'] = String(total);
        return { status: 200, headers, skip: 0, take: null };
    }

    if (range.start >= total) {
        headers['Content-Range'] = `bytes */${total}`;
        return { status: 416, headers, skip: 0, take: 0 };
    }

    // Источник прислал файл целиком — вырезаем кусок сами.
    const end = Math.min(range.end ?? total - 1, total - 1);
    const length = end - range.start + 1;
    headers['Content-Range'] = `bytes ${range.start}-${end}/${total}`;
    headers['Content-Length'] = String(length);
    return { status: 206, headers, skip: range.start, take: length };
}

/** Поток-«окно»: пропускает первые `skip` байт, отдаёт `take` и закрывается. */
export class ByteWindow extends Transform {
    private done = false;

    constructor(
        private skipLeft: number,
        private takeLeft: number | null,
    ) {
        super();
    }

    _transform(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: TransformCallback,
    ): void {
        if (this.done) return callback();
        let data = chunk;
        if (this.skipLeft > 0) {
            const cut = Math.min(this.skipLeft, data.length);
            this.skipLeft -= cut;
            data = data.subarray(cut);
        }
        if (data.length === 0) return callback();
        if (this.takeLeft === null) return callback(null, data);
        const part = data.subarray(0, this.takeLeft);
        this.takeLeft -= part.length;
        this.push(part);
        if (this.takeLeft === 0) {
            this.done = true;
            this.push(null);
        }
        callback();
    }
}
