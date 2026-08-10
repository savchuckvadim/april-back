import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LibreOfficeConfig } from '../config/libre-office.config';
import {
    LibreOfficeCancelledError,
    LibreOfficeConvertError,
    LibreOfficeTimeoutError,
} from '../errors/libre-office.errors';
import { LibreOfficeEndpointPool } from '../services/libre-office-endpoint-pool.service';
import { LibreOfficeHttpConverter } from '../services/libre-office-http.converter';
import {
    libreOfficeConfig,
    sleep,
    stubResolver,
} from './libre-office.fixtures';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

/** Аргументы, с которыми конвертер зовёт fetch — типизируем, чтобы читать body без any. */
type FetchArgs = [string, { body: FormData; signal: AbortSignal }];
type FetchMock = jest.Mock<Promise<Response>, FetchArgs>;

function requestedUrls(mock: FetchMock): string[] {
    return mock.mock.calls.map(call => call[0]);
}

function sentForm(mock: FetchMock, callIndex = 0): FormData {
    return mock.mock.calls[callIndex][1].body;
}

function build(overrides: Partial<LibreOfficeConfig> = {}): {
    converter: LibreOfficeHttpConverter;
    pool: LibreOfficeEndpointPool;
} {
    const config = libreOfficeConfig(overrides);
    const pool = new LibreOfficeEndpointPool(
        config,
        stubResolver(() => Promise.resolve(config.endpoints)),
    );
    return { converter: new LibreOfficeHttpConverter(config, pool), pool };
}

function buildConverter(
    overrides: Partial<LibreOfficeConfig> = {},
): LibreOfficeHttpConverter {
    return build(overrides).converter;
}

describe('LibreOfficeHttpConverter', () => {
    let dir: string;
    let docxPath: string;
    let fetchMock: FetchMock;
    const originalFetch = global.fetch;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'libre-office-test-'));
        docxPath = join(dir, 'offer-1.docx');
        await writeFile(docxPath, Buffer.from('docx-content'));
        fetchMock = jest.fn<Promise<Response>, FetchArgs>();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(async () => {
        global.fetch = originalFetch;
        await rm(dir, { recursive: true, force: true });
    });

    it('складывает PDF рядом с DOCX и возвращает его путь', async () => {
        fetchMock.mockResolvedValue(new Response(PDF_BYTES, { status: 200 }));

        const result = await buildConverter().convert(docxPath, dir);

        expect(result).toBe(join(dir, 'offer-1.pdf'));
        expect(await readFile(result)).toEqual(Buffer.from(PDF_BYTES));
        expect(requestedUrls(fetchMock)[0]).toMatch(
            /\/forms\/libreoffice\/convert$/,
        );
    });

    it('повторяет запрос после 503 и уходит на другой инстанс', async () => {
        fetchMock
            .mockResolvedValueOnce(
                new Response('The request exceeded the time limit', {
                    status: 503,
                }),
            )
            .mockResolvedValueOnce(new Response(PDF_BYTES, { status: 200 }));

        const result = await buildConverter().convert(docxPath, dir);

        expect(await readFile(result)).toEqual(Buffer.from(PDF_BYTES));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [first, second] = requestedUrls(fetchMock);
        expect(second).not.toBe(first);
    });

    it('отправляет подбитый инстанс в cooldown', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response('busy', { status: 503 }))
            .mockResolvedValueOnce(new Response(PDF_BYTES, { status: 200 }));
        const { converter, pool } = build();
        const penalize = jest.spyOn(pool, 'penalize');

        await converter.convert(docxPath, dir);

        expect(penalize).toHaveBeenCalledTimes(1);
        expect(pool.stats().cooling).toBe(1);
    });

    it('не наказывает инстанс за битый документ', async () => {
        fetchMock.mockResolvedValue(
            new Response('invalid docx', { status: 400 }),
        );
        const { converter, pool } = build();

        await expect(converter.convert(docxPath, dir)).rejects.toBeInstanceOf(
            LibreOfficeConvertError,
        );
        expect(pool.stats().cooling).toBe(0);
    });

    it('не повторяет запрос на 400 — документ не станет валидным', async () => {
        fetchMock.mockResolvedValue(
            new Response('invalid docx', { status: 400 }),
        );

        await expect(
            buildConverter().convert(docxPath, dir),
        ).rejects.toBeInstanceOf(LibreOfficeConvertError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('сдаётся после исчерпания попыток и отдаёт последний статус', async () => {
        fetchMock.mockImplementation(() =>
            Promise.resolve(new Response('busy', { status: 503 })),
        );

        await expect(
            buildConverter({ retries: 1 }).convert(docxPath, dir),
        ).rejects.toMatchObject({ status: 503 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('обрывает зависший запрос по своему таймауту и не ретраит его', async () => {
        fetchMock.mockImplementation(
            (_url, init) =>
                new Promise<Response>((_resolve, reject) => {
                    init.signal.addEventListener('abort', () =>
                        reject(new Error('aborted')),
                    );
                }),
        );

        await expect(
            buildConverter({ timeoutMs: 1_000 }).convert(docxPath, dir),
        ).rejects.toBeInstanceOf(LibreOfficeTimeoutError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('повторяет сетевую ошибку', async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(new Response(PDF_BYTES, { status: 200 }));

        await expect(
            buildConverter().convert(docxPath, dir),
        ).resolves.toContain('offer-1.pdf');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    describe('отмена операции', () => {
        it('не занимает слот, если операция уже отменена', async () => {
            const controller = new AbortController();
            controller.abort();

            await expect(
                buildConverter().convert(docxPath, dir, controller.signal),
            ).rejects.toBeInstanceOf(LibreOfficeCancelledError);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('прерывает запрос на полпути и отличает отмену от таймаута', async () => {
            const controller = new AbortController();
            fetchMock.mockImplementation(
                (_url, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        init.signal.addEventListener('abort', () =>
                            reject(new Error('aborted')),
                        );
                    }),
            );

            const conversion = buildConverter().convert(
                docxPath,
                dir,
                controller.signal,
            );
            await sleep(5);
            controller.abort();

            await expect(conversion).rejects.toBeInstanceOf(
                LibreOfficeCancelledError,
            );
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    it('не передаёт pdf-опции, пока они не включены', async () => {
        fetchMock.mockResolvedValue(new Response(PDF_BYTES, { status: 200 }));

        await buildConverter().convert(docxPath, dir);

        const form = sentForm(fetchMock);
        expect(form.get('files')).not.toBeNull();
        expect(form.get('reduceImageResolution')).toBeNull();
        expect(form.get('quality')).toBeNull();
    });

    it('передаёт включённые pdf-опции в Gotenberg', async () => {
        fetchMock.mockResolvedValue(new Response(PDF_BYTES, { status: 200 }));

        await buildConverter({
            pdf: {
                reduceImageResolution: true,
                maxImageResolution: 300,
                quality: 90,
            },
        }).convert(docxPath, dir);

        const form = sentForm(fetchMock);
        expect(form.get('reduceImageResolution')).toBe('true');
        expect(form.get('maxImageResolution')).toBe('300');
        expect(form.get('losslessImageCompression')).toBe('false');
        expect(form.get('quality')).toBe('90');
    });

    it('держит не больше одной конвертации на инстанс', async () => {
        let active = 0;
        let maxActive = 0;
        fetchMock.mockImplementation(async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await sleep(10);
            active--;
            return new Response(PDF_BYTES, { status: 200 });
        });
        const converter = buildConverter();

        await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
                writeFile(join(dir, `doc-${index}.docx`), 'x').then(() =>
                    converter.convert(join(dir, `doc-${index}.docx`), dir),
                ),
            ),
        );

        expect(maxActive).toBe(2);
    });
});
