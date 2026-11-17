import { ConfigService } from '@nestjs/config';
import { AiEntityDto } from '../../ai/dto/ai-entity.dto';
import { AiService } from '../../ai/services/ai.service';
import { CallPageLinkService } from '../call-page-link.service';
import { CALL_PAGE_LINK_TYPE } from '../call-page-link.util';

type AiStub = Pick<AiService, 'findByTranscriptionIds' | 'create'>;

interface Harness {
    service: CallPageLinkService;
    records: AiEntityDto[];
    find: jest.Mock;
    create: jest.Mock;
}

const recordOf = (fields: Partial<AiEntityDto>): AiEntityDto =>
    fields as AiEntityDto;

function harness(
    env: Record<string, string | undefined>,
    settings?: Record<string, string | null>,
): Harness {
    const records: AiEntityDto[] = [];
    const find = jest.fn(() => Promise.resolve(records));
    const create = jest.fn((dto: Partial<AiEntityDto>) => {
        const created = recordOf({ ...dto, id: String(100 + records.length) });
        records.push(created);
        return Promise.resolve(created);
    });
    const ai: AiStub = {
        findByTranscriptionIds: find,
        create,
    };
    const config = { get: (key: string) => env[key] } as ConfigService;
    return {
        service: new CallPageLinkService(
            config,
            ai as AiService,
            settings && {
                get: key => Promise.resolve(settings[key] ?? null),
                getMany: () => Promise.resolve({}),
            },
        ),
        records,
        find,
        create,
    };
}

describe('CallPageLinkService', () => {
    it('выпущенная ссылка открывает свой звонок', async () => {
        const { service, records } = harness({ AUTH_JWT_SECRET: 'secret' });
        records.push(recordOf({ id: '1', type: 'agent-analysis' }));
        const token = await service.issue('2437933');
        expect(token).not.toBeNull();
        const resolved = await service.resolve(token ?? '');
        expect(resolved?.transcriptionId).toBe('2437933');
        expect(resolved?.records).toHaveLength(1);
    });

    it('чужой формат ссылки не доходит до базы', async () => {
        const { service, find } = harness({ AUTH_JWT_SECRET: 'secret' });
        expect(await service.resolve('мусор')).toBeNull();
        expect(find).not.toHaveBeenCalled();
    });

    it('ссылка с чужой подписью не открывается', async () => {
        const { service } = harness({ AUTH_JWT_SECRET: 'secret' });
        const other = harness({ AUTH_JWT_SECRET: 'другой секрет' });
        const foreign = await other.service.issue('77');
        expect(await service.resolve(foreign ?? '')).toBeNull();
    });

    it('отзыв: старая ссылка перестаёт открываться, новая открывается', async () => {
        const { service, create } = harness({ AUTH_JWT_SECRET: 'secret' });
        const before = await service.issue('42');
        const after = await service.revoke('42', 'portal.bitrix24.ru');
        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: CALL_PAGE_LINK_TYPE,
                domain: 'portal.bitrix24.ru',
                transcription_id: '42',
            }),
        );
        expect(after).not.toBe(before);
        expect(await service.resolve(before ?? '')).toBeNull();
        expect((await service.resolve(after ?? ''))?.transcriptionId).toBe(
            '42',
        );
        expect(await service.issue('42')).toBe(after);
    });

    it('адрес страницы: по умолчанию — сайт, где «Отчёт» открывается сейчас', async () => {
        const { service } = harness({ AUTH_JWT_SECRET: 'secret' });
        const token = await service.issue('42');
        expect(await service.urlFor('42')).toBe(
            `https://next.april-app.ru/call/${token}`,
        );
    });

    it('адрес виджета «Отчёта» на адрес страницы не влияет: это будущий домен', async () => {
        const { service } = harness(
            { AUTH_JWT_SECRET: 'secret' },
            {
                MARKETPLACE_WIDGET_URL_REPORT_SALES:
                    'https://kpi-sales.april-app.ru/',
            },
        );
        expect(await service.urlFor('42')).toMatch(
            /^https:\/\/next\.april-app\.ru\/call\//,
        );
    });

    it('адрес страницы: сайт из настройки, путь сайта сохраняется', async () => {
        const { service } = harness(
            { AUTH_JWT_SECRET: 'secret' },
            { REPORT_SALES_PUBLIC_URL: 'https://report.example.ru/kpi/?x=1' },
        );
        expect(await service.urlFor('42')).toMatch(
            /^https:\/\/report\.example\.ru\/kpi\/call\/[0-9a-z]+-[\w-]{32}$/,
        );
    });

    it('адрес страницы: битая настройка сайта — адрес по умолчанию; нет секрета — ссылки нет', async () => {
        const broken = harness(
            { AUTH_JWT_SECRET: 'secret' },
            { REPORT_SALES_PUBLIC_URL: 'не адрес' },
        );
        expect(await broken.service.urlFor('42')).toMatch(
            /^https:\/\/next\.april-app\.ru\/call\//,
        );
        expect(await harness({}).service.urlFor('42')).toBeNull();
    });

    it('секрет не задан — ссылки не выпускаются и не открываются', async () => {
        const { service, find, create } = harness({});
        expect(await service.issue('42')).toBeNull();
        expect(service.tokenFor('42', [])).toBeNull();
        expect(await service.revoke('42', 'portal.bitrix24.ru')).toBeNull();
        expect(await service.resolve(`16-${'A'.repeat(32)}`)).toBeNull();
        expect(find).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });
});
