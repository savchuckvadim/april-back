import { Readable } from 'node:stream';
import { NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { PBXService } from '@/modules/pbx';
import { CallPageAudioService } from '../call-page-audio.service';
import {
    CallPageCallResolver,
    type CallPageCall,
} from '../call-page-call.resolver';
import { CALL_PAGE_MESSAGES } from '../call-page.const';

jest.mock('axios');

const DOMAIN = 'portal.bitrix24.ru';
const FILE_URL = `https://${DOMAIN}/disk/downloadFile/10/?auth=secret`;

interface Upstream {
    status: number;
    headers: Record<string, string>;
    body: string;
}

const mockedAxios = axios as jest.Mocked<typeof axios>;

function answer(upstream: Upstream): void {
    mockedAxios.get.mockResolvedValueOnce({
        status: upstream.status,
        headers: upstream.headers,
        data: Readable.from([Buffer.from(upstream.body)]),
    });
}

async function textOf(stream: Readable | null): Promise<string> {
    if (stream === null) return '';
    const parts: Buffer[] = [];
    for await (const part of stream) parts.push(part as Buffer);
    return Buffer.concat(parts).toString();
}

function build(options: { activityId?: string | null; files?: number[] } = {}) {
    const call = {
        row: {
            id: '42',
            activityId:
                options.activityId === undefined ? '777' : options.activityId,
        },
        domain: DOMAIN,
        records: [],
    } as unknown as CallPageCall;
    const calls: Pick<CallPageCallResolver, 'resolve'> = {
        resolve: jest.fn(() => Promise.resolve(call)),
    };
    const getAllFresh = jest.fn(() =>
        Promise.resolve({
            activities: [
                { FILES: (options.files ?? [10]).map(id => ({ id })) },
            ],
        }),
    );
    const fileGet = jest.fn(() =>
        Promise.resolve({ result: { DOWNLOAD_URL: FILE_URL } }),
    );
    const pbx = {
        init: jest.fn(() =>
            Promise.resolve({
                bitrix: { activity: { getAllFresh }, file: { get: fileGet } },
            }),
        ),
    } as unknown as PBXService;
    return {
        service: new CallPageAudioService(calls as CallPageCallResolver, pbx),
        getAllFresh,
        fileGet,
    };
}

describe('CallPageAudioService', () => {
    beforeEach(() => mockedAxios.get.mockReset());

    it('без перемотки отдаёт запись целиком; адрес портала наружу не идёт', async () => {
        const { service, fileGet } = build();
        answer({
            status: 200,
            headers: { 'content-length': '10', 'content-type': 'audio/mpeg' },
            body: '0123456789',
        });
        const audio = await service.open('token', undefined);
        expect(audio.status).toBe(200);
        expect(audio.headers['Content-Length']).toBe('10');
        expect(JSON.stringify(audio.headers)).not.toContain(DOMAIN);
        expect(await textOf(audio.body)).toBe('0123456789');
        expect(fileGet).toHaveBeenCalledWith(10);
        expect(mockedAxios.get.mock.calls[0]).toEqual([
            FILE_URL,
            expect.objectContaining({ headers: {} }),
        ]);
    });

    it('портал не умеет отдавать кусок — вырезаем его сами', async () => {
        const { service } = build();
        answer({
            status: 200,
            headers: { 'content-length': '10' },
            body: '0123456789',
        });
        const audio = await service.open('token', 'bytes=3-6');
        expect(audio.status).toBe(206);
        expect(audio.headers['Content-Range']).toBe('bytes 3-6/10');
        expect(await textOf(audio.body)).toBe('3456');
        expect(mockedAxios.get.mock.calls[0]).toEqual([
            FILE_URL,
            expect.objectContaining({ headers: { Range: 'bytes=3-6' } }),
        ]);
    });

    it('адрес записи помнится: при перемотке портал за ним не спрашиваем', async () => {
        const { service, getAllFresh, fileGet } = build();
        answer({
            status: 200,
            headers: { 'content-length': '3' },
            body: 'abc',
        });
        answer({
            status: 200,
            headers: { 'content-length': '3' },
            body: 'abc',
        });
        await textOf((await service.open('token', undefined)).body);
        await textOf((await service.open('token', 'bytes=1-')).body);
        expect(getAllFresh).toHaveBeenCalledTimes(1);
        expect(fileGet).toHaveBeenCalledTimes(1);
    });

    it('портал отказал в файле — «запись недоступна», адрес забыт', async () => {
        const { service, fileGet } = build();
        answer({ status: 403, headers: {}, body: 'forbidden' });
        await expect(service.open('token', undefined)).rejects.toThrow(
            new NotFoundException(CALL_PAGE_MESSAGES.noAudio),
        );
        answer({
            status: 200,
            headers: { 'content-length': '3' },
            body: 'abc',
        });
        await textOf((await service.open('token', undefined)).body);
        expect(fileGet).toHaveBeenCalledTimes(2);
    });

    it('у звонка нет дела или файла — «запись недоступна», портал за файлом не дёргаем', async () => {
        const noActivity = build({ activityId: null });
        await expect(
            noActivity.service.open('token', undefined),
        ).rejects.toThrow(CALL_PAGE_MESSAGES.noAudio);
        expect(noActivity.getAllFresh).not.toHaveBeenCalled();

        const noFile = build({ files: [] });
        await expect(noFile.service.open('token', undefined)).rejects.toThrow(
            CALL_PAGE_MESSAGES.noAudio,
        );
        expect(noFile.fileGet).not.toHaveBeenCalled();
        expect(mockedAxios.get.mock.calls).toHaveLength(0);
    });

    it('кусок за концом файла — 416 без тела', async () => {
        const { service } = build();
        answer({
            status: 200,
            headers: { 'content-length': '3' },
            body: 'abc',
        });
        const audio = await service.open('token', 'bytes=10-');
        expect(audio.status).toBe(416);
        expect(audio.body).toBeNull();
    });
});
