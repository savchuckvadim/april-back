import { NotFoundException } from '@nestjs/common';
import {
    AiEntityDto,
    CallPageLinkService,
    TranscriptionStoreService,
    type TranscriptionPipelineView,
} from '@lib/call-lib';
import { PbxAicallSmartService } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { CallPageCallResolver } from '../call-page-call.resolver';
import { CallPageManagerNameService } from '../call-page-manager-name.service';
import { CALL_PAGE_MESSAGES } from '../call-page.const';
import { CallPageUseCase, crmEntityUrl } from '../call-page.use-case';

const DOMAIN = 'portal.bitrix24.ru';

const rowOf = (
    fields: Partial<TranscriptionPipelineView> = {},
): TranscriptionPipelineView => ({
    id: '42',
    dedupKey: null,
    domain: DOMAIN,
    activityId: '777',
    callId: null,
    callStartedAt: new Date('2026-11-12T09:41:00.000Z'),
    provider: 'yandex',
    status: 'done',
    text: 'Добрый день. Слушаю вас.',
    segments: null,
    durationSec: '95',
    entityType: 'deal',
    entityId: '9041',
    userId: '15',
    createdAt: null,
    updatedAt: null,
    ...fields,
});

const record = (fields: Partial<AiEntityDto>): AiEntityDto =>
    fields as AiEntityDto;

interface Setup {
    records?: AiEntityDto[] | null;
    row?: TranscriptionPipelineView | null;
}

function build(setup: Setup = {}) {
    const records =
        setup.records === undefined
            ? [
                  record({
                      id: '10',
                      type: 'agent-analysis',
                      status: 'done',
                      report_item_id: '512',
                      user_result: { summary: 'Краткое содержание.', score: 7 },
                  }),
              ]
            : setup.records;
    const links: Pick<CallPageLinkService, 'resolve'> = {
        resolve: jest.fn(() =>
            Promise.resolve(
                records === null ? null : { transcriptionId: '42', records },
            ),
        ),
    };
    const row = setup.row === undefined ? rowOf() : setup.row;
    const transcriptions: Pick<TranscriptionStoreService, 'findPipelineById'> =
        {
            findPipelineById: jest.fn(() =>
                row === null
                    ? Promise.reject(
                          new NotFoundException('Transcription not found'),
                      )
                    : Promise.resolve(row),
            ),
        };
    const managers: Pick<CallPageManagerNameService, 'nameOf'> = {
        nameOf: jest.fn(() => Promise.resolve('Иванова Ирина')),
    };
    const smart: Pick<PbxAicallSmartService, 'resolveInfo'> = {
        resolveInfo: jest.fn(() =>
            Promise.resolve({ entityTypeId: 1040 } as Awaited<
                ReturnType<PbxAicallSmartService['resolveInfo']>
            >),
        ),
    };
    const useCase = new CallPageUseCase(
        new CallPageCallResolver(
            links as CallPageLinkService,
            transcriptions as TranscriptionStoreService,
        ),
        managers as CallPageManagerNameService,
        smart as PbxAicallSmartService,
    );
    return { useCase, managers };
}

describe('CallPageUseCase', () => {
    it('по верной ссылке отдаёт карточку звонка со ссылками в портал', async () => {
        const { useCase, managers } = build();
        const page = await useCase.load('token');
        expect(page.summary).toBe('Краткое содержание.');
        expect(page.score.score).toBe(7);
        expect(page.call).toMatchObject({
            managerName: 'Иванова Ирина',
            durationSec: 95,
            hasAudio: true,
            smartUrl: `https://${DOMAIN}/crm/type/1040/details/512/`,
            crmUrl: `https://${DOMAIN}/crm/deal/details/9041/`,
        });
        expect(managers.nameOf).toHaveBeenCalledWith(DOMAIN, '15');
    });

    it('ссылка не прошла проверку — «ссылка недействительна»', async () => {
        const { useCase } = build({ records: null });
        await expect(useCase.load('token')).rejects.toThrow(
            new NotFoundException(CALL_PAGE_MESSAGES.invalidLink),
        );
    });

    it('строки расшифровки нет — тот же ответ, что и на неверную ссылку', async () => {
        const { useCase } = build({ row: null });
        await expect(useCase.load('token')).rejects.toThrow(
            CALL_PAGE_MESSAGES.invalidLink,
        );
    });

    it('у звонка нет действующего разбора — «разбора ещё нет»', async () => {
        const superseded = build({
            records: [
                record({
                    id: '10',
                    type: 'agent-analysis',
                    status: 'superseded',
                    user_result: { summary: 'Старый разбор.' },
                }),
            ],
        });
        await expect(superseded.useCase.load('token')).rejects.toThrow(
            CALL_PAGE_MESSAGES.noAnalysis,
        );
        const empty = build({ records: [] });
        await expect(empty.useCase.load('token')).rejects.toThrow(
            CALL_PAGE_MESSAGES.noAnalysis,
        );
    });

    it('после переразбора показывается новый разбор, не замещённый', async () => {
        const { useCase } = build({
            records: [
                record({
                    id: '10',
                    type: 'agent-analysis',
                    status: 'superseded',
                    user_result: { summary: 'Старый.' },
                }),
                record({
                    id: '11',
                    type: 'agent-analysis',
                    status: 'done',
                    user_result: { summary: 'Новый.' },
                }),
            ],
        });
        const page = await useCase.load('token');
        expect(page.summary).toBe('Новый.');
        expect(page.call.smartUrl).toBeNull();
    });

    it('звонок без дела — записи нет; без привязки — ссылки на CRM нет', async () => {
        const { useCase } = build({
            row: rowOf({ activityId: null, entityType: null, entityId: null }),
        });
        const page = await useCase.load('token');
        expect(page.call.hasAudio).toBe(false);
        expect(page.call.crmUrl).toBeNull();
    });

    it('ссылка на CRM: сделка и лид; чужой тип или номер — нет', () => {
        expect(crmEntityUrl(DOMAIN, 'deal', '5')).toBe(
            `https://${DOMAIN}/crm/deal/details/5/`,
        );
        expect(crmEntityUrl(DOMAIN, 'LEAD', '7')).toBe(
            `https://${DOMAIN}/crm/lead/details/7/`,
        );
        expect(crmEntityUrl(DOMAIN, 'smart', '7')).toBeNull();
        expect(crmEntityUrl(DOMAIN, 'deal', 'abc')).toBeNull();
        expect(crmEntityUrl(DOMAIN, null, null)).toBeNull();
    });
});
