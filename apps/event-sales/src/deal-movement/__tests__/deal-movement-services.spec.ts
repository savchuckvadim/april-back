import { AGENT_ANALYSIS_TYPE } from '@lib/call-lib';
import { EnumPortalAppCode } from '@lib/portal-lib/store/app-settings';
import { indexOpenDeals } from '../lib/deal-movement-calls.link';
import { DealMovementCallsLoader } from '../services/deal-movement-calls.loader';
import {
    DealMovementSettingsService,
    toDealMovementOptions,
} from '../services/deal-movement-settings.service';
import { dealRow } from './deal-movement.fixture';

const DOMAIN = 'garant.bitrix24.ru';

/** Запись в ленту по умолчанию — выключена, запись журнала, 100 и 50. */
const NOTES_OFF = {
    dealMovementWriteNotes: false,
    dealMovementNoteKind: 'log_message',
    dealMovementMaxNotes: 100,
    dealMovementMaxTexts: 50,
};

describe('настройки движения сделок', () => {
    it('значения портала → пороги правил; мусор и ноль — по умолчанию', () => {
        expect(
            toDealMovementOptions({
                dealMovementWindowDays: 10,
                dealMovementStuckDays: 30,
                dealMovementAgreedStillDays: 0,
                dealMovementCallsLookbackDays: 45,
                dealMovementMaxDeals: Number.NaN,
                ...NOTES_OFF,
            }),
        ).toEqual({
            thresholds: {
                windowDays: 10,
                stuckDefaultDays: 30,
                agreedStillDays: 12,
                // Звонки и дела Битрикса — за тот же срок, что разборы.
                workLookbackDays: 45,
                chanceMin: null,
                amountMin: null,
                // Пояс по умолчанию; оценщик ставит пояс портала.
                timeZone: 'Europe/Moscow',
            },
            callsLookbackDays: 45,
            maxDeals: 10_000,
            notes: {
                write: false,
                kind: 'log_message',
                maxNotes: 100,
                maxTexts: 50,
            },
            // Настроек сводки нет — выключена, «только новые», понедельник, 15.
            digest: { enabled: false, mode: 'new_only', weekday: 1, top: 15 },
        });
    });

    it('сводка руководителям — только явное «да»; режим и число из настроек', () => {
        expect(
            toDealMovementOptions({
                dealMovementWindowDays: 14,
                dealMovementStuckDays: 21,
                dealMovementAgreedStillDays: 12,
                dealMovementCallsLookbackDays: 60,
                dealMovementMaxDeals: 500,
                ...NOTES_OFF,
                dealMovementDigestEnabled: true,
                dealMovementDigestMode: 'daily',
                dealMovementDigestTop: 5,
            }).digest,
        ).toEqual({ enabled: true, mode: 'daily', weekday: 1, top: 5 });
        expect(
            toDealMovementOptions({
                dealMovementWindowDays: 14,
                dealMovementStuckDays: 21,
                dealMovementAgreedStillDays: 12,
                dealMovementCallsLookbackDays: 60,
                dealMovementMaxDeals: 500,
                ...NOTES_OFF,
                dealMovementDigestEnabled: true,
                dealMovementDigestMode: 'biweekly',
                dealMovementDigestWeekday: 5,
            }).digest,
        ).toMatchObject({ mode: 'biweekly', weekday: 5 });
    });

    it('окно звонков не короче окна событий', () => {
        expect(
            toDealMovementOptions({
                dealMovementWindowDays: 30,
                dealMovementStuckDays: 21,
                dealMovementAgreedStillDays: 12,
                dealMovementCallsLookbackDays: 7,
                dealMovementMaxDeals: 500,
                ...NOTES_OFF,
            }).callsLookbackDays,
        ).toBe(30);
    });

    it('запись в ленту — только явное «да»; ноль записей можно, мусор — по умолчанию', () => {
        const base = {
            dealMovementWindowDays: 14,
            dealMovementStuckDays: 21,
            dealMovementAgreedStillDays: 12,
            dealMovementCallsLookbackDays: 60,
            dealMovementMaxDeals: 500,
        };
        expect(
            toDealMovementOptions({
                ...base,
                dealMovementWriteNotes: true,
                dealMovementNoteKind: 'log_message',
                dealMovementMaxNotes: 0,
                dealMovementMaxTexts: -3,
            }).notes,
        ).toEqual({
            write: true,
            kind: 'log_message',
            maxNotes: 0,
            maxTexts: 50,
        });
        // Сохранённый на портале комментарий остаётся комментарием.
        expect(
            toDealMovementOptions({
                ...base,
                ...NOTES_OFF,
                dealMovementNoteKind: 'comment',
            }).notes.kind,
        ).toBe('comment');
        expect(
            toDealMovementOptions({
                ...base,
                ...NOTES_OFF,
                dealMovementNoteKind: 'чат',
            }).notes.kind,
        ).toBe('log_message');
    });

    it('ростер крона — порталы с включённым флагом', async () => {
        const listByAppCode = jest.fn().mockResolvedValue([
            {
                domain: 'a.bitrix24.ru',
                settings: { deal_movement_enabled: true },
            },
            {
                domain: 'b.bitrix24.ru',
                settings: { deal_movement_enabled: false },
            },
            { domain: 'c.bitrix24.ru', settings: {} },
        ]);
        const service = new DealMovementSettingsService({
            listByAppCode,
        } as never);

        expect(await service.enabledDomains()).toEqual(['a.bitrix24.ru']);
        expect(listByAppCode).toHaveBeenCalledWith(
            EnumPortalAppCode.eventSales,
        );
    });
});

describe('разобранные звонки из БД', () => {
    const lite = (id: string, entityType: string, entityId: string) => ({
        id,
        domain: DOMAIN,
        callStartedAt: new Date('2026-11-12T08:00:00.000Z'),
        durationSec: '120',
        entityType,
        entityId,
        userId: '7',
        createdAt: new Date('2026-11-12T08:05:00.000Z'),
    });

    it('разборы читаются порциями по 100 и только у звонков, похожих на открытые сделки', async () => {
        const rows = [
            ...Array.from({ length: 150 }, (_, index) =>
                lite(String(index + 1), 'deal', '100'),
            ),
            // Компания без открытых сделок — разбор не читаем.
            lite('900', 'company', '55'),
        ];
        const transcriptions = {
            findDoneInPeriodLite: jest.fn().mockResolvedValue(rows),
        };
        const aiService = {
            findByDomainTypeKeys: jest
                .fn()
                .mockImplementation(
                    (
                        _domain: string,
                        _type: string,
                        keys: { transcriptionIds: string[] },
                    ) =>
                        Promise.resolve(
                            keys.transcriptionIds.slice(0, 1).map(id => ({
                                id: `a${id}`,
                                type: AGENT_ANALYSIS_TYPE,
                                status: 'done',
                                transcription_id: id,
                                user_result: { dealProgress: { score: 2 } },
                            })),
                        ),
                ),
        };
        const loader = new DealMovementCallsLoader(
            transcriptions as never,
            aiService as never,
        );
        const from = new Date('2026-09-18T00:00:00.000Z');
        const to = new Date('2026-11-17T23:30:00.000Z');

        const calls = await loader.load(
            DOMAIN,
            from,
            to,
            indexOpenDeals([dealRow(100)]),
        );

        expect(transcriptions.findDoneInPeriodLite).toHaveBeenCalledWith(
            DOMAIN,
            from,
            to,
        );
        expect(aiService.findByDomainTypeKeys).toHaveBeenCalledTimes(2);
        const [, type, firstKeys] = aiService.findByDomainTypeKeys.mock
            .calls[0] as [string, string, { transcriptionIds: string[] }];
        expect(type).toBe(AGENT_ANALYSIS_TYPE);
        expect(firstKeys.transcriptionIds).toHaveLength(100);
        // По одному действующему разбору на порцию; id расшифровки остаётся.
        expect(calls.get(100)).toEqual([
            expect.objectContaining({
                transcriptionId: '1',
                call: {
                    at: '2026-11-12T08:00:00.000Z',
                    progress: 2,
                    nextStep: null,
                },
            }),
            expect.objectContaining({ transcriptionId: '101' }),
        ]);
    });
});
