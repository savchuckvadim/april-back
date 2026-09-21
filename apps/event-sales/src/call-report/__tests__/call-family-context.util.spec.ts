import {
    callTypeOfRecords,
    familyResolveArgsOf,
} from '../services/call-family-context.util';

const STARTED_AT = new Date('2026-08-01T15:00:00Z');

const row = { userId: '222', callStartedAt: STARTED_AT };

describe('familyResolveArgsOf: контекст раскладки по паспорту и строке', () => {
    it('звонок по сделке: сделка-владелец, клиент, момент, владелец и тип', () => {
        expect(
            familyResolveArgsOf(
                {
                    entityType: 'deal',
                    entityId: 555,
                    crmCompanyId: 33,
                    crmContactId: 44,
                },
                row,
                'presentation',
            ),
        ).toEqual({
            dealId: 555,
            context: {
                companyId: 33,
                contactId: 44,
                callStartedAt: STARTED_AT,
                leadId: undefined,
                callerId: '222',
                callType: 'presentation',
            },
        });
    });

    it('звонок по лиду: сделки нет, лид-владелец уходит в контекст (шаг 0 «ОП История»)', () => {
        const args = familyResolveArgsOf(
            {
                entityType: 'lead',
                entityId: 77,
                crmCompanyId: null,
                crmContactId: null,
            },
            row,
        );
        expect(args.dealId).toBeUndefined();
        expect(args.context).toEqual({
            companyId: undefined,
            contactId: undefined,
            callStartedAt: STARTED_AT,
            leadId: 77,
            callerId: '222',
            callType: undefined,
        });
    });

    it('без строки и без привязки — контекст пустой, ничего не выдумывается', () => {
        const args = familyResolveArgsOf(
            {
                entityType: null,
                entityId: null,
                crmCompanyId: null,
                crmContactId: null,
            },
            null,
        );
        expect(args.dealId).toBeUndefined();
        expect(args.context.leadId).toBeUndefined();
        expect(args.context.callStartedAt).toBeUndefined();
        expect(args.context.callerId).toBeUndefined();
    });
});

describe('callTypeOfRecords: тип звонка по ais-записям строки', () => {
    it('итог глубокого разбора старше классификатора', () => {
        expect(
            callTypeOfRecords(
                [
                    {
                        transcription_id: '2',
                        type: 'call-classify',
                        result: 'cold',
                    },
                    {
                        transcription_id: '2',
                        type: 'agent-analysis',
                        user_result: { callType: 'presentation' },
                    },
                ],
                '2',
            ),
        ).toBe('presentation');
    });

    it('без разбора — тип классификатора (result, иначе user_result.callType)', () => {
        expect(
            callTypeOfRecords(
                [
                    {
                        transcription_id: 7,
                        type: 'call-classify',
                        result: 'refine',
                    },
                ],
                '7',
            ),
        ).toBe('refine');
        expect(
            callTypeOfRecords(
                [
                    {
                        transcription_id: '7',
                        type: 'call-classify',
                        result: '',
                        user_result: { callType: 'decision' },
                    },
                ],
                '7',
            ),
        ).toBe('decision');
    });

    it('чужие строки и записи без типа не учитываются', () => {
        expect(
            callTypeOfRecords(
                [
                    {
                        transcription_id: '1',
                        type: 'call-classify',
                        result: 'cold',
                    },
                    {
                        transcription_id: '2',
                        type: 'call-resume',
                        result: 'резюме',
                    },
                    {
                        transcription_id: '2',
                        type: 'agent-analysis',
                        user_result: {},
                    },
                ],
                '2',
            ),
        ).toBeNull();
        expect(callTypeOfRecords([], '2')).toBeNull();
    });
});
