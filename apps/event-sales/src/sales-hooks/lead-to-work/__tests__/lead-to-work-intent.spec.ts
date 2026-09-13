import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { resolveLeadToWorkIntent } from '../lib/lead-to-work-intent';
import { ILeadToWorkItem } from '../dto/lead-to-work.dto';

/**
 * Слияние «запрос + карточка». Цена ошибки в обе стороны высока:
 * поле, перебившее запрос, тихо изменит поведение работающего робота;
 * проигнорированное поле вернёт нас к обрезанному по `#` URL, где все
 * параметры терялись и хук молча уходил в дефолты.
 */
const FIELD_BY_CODE: Record<string, string> = {
    xo_responsible: 'XO_RESPONSIBLE',
    department_string: 'DEPARTMENT_STRING',
    xo_name: 'XO_NAME',
    xo_date: 'XO_DATE',
    xo_created: 'XO_CREATED',
    op_xo_lead_stage_mode: 'OP_XO_LEAD_STAGE_MODE',
    op_xo_is_xo: 'OP_XO_IS_XO',
    op_xo_is_force: 'OP_XO_IS_FORCE',
};

const portal = (installed = Object.keys(FIELD_BY_CODE)) =>
    ({
        getEntityFieldByCode: (_e: string, code: string) => {
            if (!installed.includes(code)) return undefined;
            const bitrixId = FIELD_BY_CODE[code];
            return bitrixId ? { bitrixId, items: [] } : undefined;
        },
        getFieldBitrixId: (f: { bitrixId: string }) => `UF_CRM_${f.bitrixId}`,
        getTimezone: () => 'Europe/Moscow',
    }) as unknown as PortalModel;

const resolve = (
    item: Partial<ILeadToWorkItem>,
    leadRow: Record<string, unknown> = {},
    isSiteRequest = false,
    installed?: string[],
) =>
    resolveLeadToWorkIntent({
        item: { leadId: 42, ...item } as ILeadToWorkItem,
        leadRow,
        portal: portal(installed),
        isSiteRequest,
    });

/** Карточка, заполненная роботом целиком. */
const FILLED_CARD = {
    UF_CRM_XO_RESPONSIBLE: '15',
    UF_CRM_DEPARTMENT_STRING: 'Отдел продаж №2',
    UF_CRM_XO_NAME: 'Лид #346955',
    UF_CRM_XO_DATE: '13.09.2026 16:16:12',
    UF_CRM_OP_XO_LEAD_STAGE_MODE: 'new',
    UF_CRM_OP_XO_IS_XO: '1',
};

describe('resolveLeadToWorkIntent', () => {
    describe('СОВМЕСТИМОСТЬ: запрос перебивает карточку', () => {
        it('робот прислал всё — поля не влияют ни на что', () => {
            const { item, intent } = resolve(
                {
                    responsible: 99,
                    department: 'Отдел из запроса',
                    name: 'Имя из запроса',
                    deadline: '01.10.2026 09:00:00',
                    stageMode: 'from_lead',
                    isXo: 'N',
                    createCompany: 'Y',
                    taskMode: 'none',
                },
                FILLED_CARD,
                true,
            );

            expect(item.responsible).toBe(99);
            expect(item.department).toBe('Отдел из запроса');
            expect(item.name).toBe('Имя из запроса');
            expect(item.deadline).toBe('01.10.2026 09:00:00');
            expect(intent).toEqual({
                stageMode: 'from_lead',
                isXo: 'N',
                createCompany: 'Y',
                taskMode: 'none',
            });
        });

        it('пустой запрос и пустая карточка → прежние дефолты хука', () => {
            const { intent } = resolve({});
            expect(intent).toEqual({
                stageMode: 'from_lead',
                isXo: 'N',
                createCompany: 'N',
                taskMode: 'move',
            });
        });
    });

    describe('ПОЧИНКА обрезанного по «#» URL: параметры берутся из карточки', () => {
        it('потерянные name/deadline/department/responsible восстанавливаются', () => {
            const { item } = resolve({}, FILLED_CARD);

            expect(item.name).toBe('Лид #346955');
            expect(item.department).toBe('Отдел продаж №2');
            expect(item.responsible).toBe(15);
            expect(item.deadline).toBe('13.09.2026 16:16:12');
        });

        it('потерянные isXo/stageMode восстанавливаются', () => {
            const { intent } = resolve({}, FILLED_CARD);
            expect(intent.isXo).toBe('Y');
            expect(intent.stageMode).toBe('new');
        });
    });

    describe('дата из карточки', () => {
        it('ISO со смещением нормализуется в формат CRM (не бросает)', () => {
            const { item } = resolve(
                {},
                { UF_CRM_XO_DATE: '2026-09-13T16:16:12+03:00' },
            );
            expect(item.deadline).toBe('13.09.2026 16:16:12');
        });

        it('мусор в поле → без дедлайна, с пояснением', () => {
            const { item, signals } = resolve(
                {},
                { UF_CRM_XO_DATE: 'когда-нибудь' },
            );
            expect(item.deadline).toBeUndefined();
            expect(signals.join(' ')).toContain('не распознано');
        });
    });

    describe('stageMode: «new» требует подтверждения', () => {
        it('поле робота главнее подтверждения', () => {
            expect(
                resolve({}, { UF_CRM_OP_XO_LEAD_STAGE_MODE: 'cold' }, true)
                    .intent.stageMode,
            ).toBe('cold');
        });

        it('поле пустое + подтверждённая заявка → new', () => {
            expect(resolve({}, {}, true).intent.stageMode).toBe('new');
        });

        it('поле пустое, заявка не подтверждена → дефолт хука from_lead', () => {
            expect(resolve({}, {}, false).intent.stageMode).toBe('from_lead');
        });
    });

    describe('isXo из карточки', () => {
        it.each([
            ['1', 'Y'],
            ['Y', 'Y'],
            ['0', 'N'],
            ['N', 'N'],
        ])('поле %s → isXo=%s', (raw, expected) => {
            expect(resolve({}, { UF_CRM_OP_XO_IS_XO: raw }).intent.isXo).toBe(
                expected,
            );
        });

        it('поле пустое → N (дефолт хука)', () => {
            expect(resolve({}, { UF_CRM_OP_XO_IS_XO: '' }).intent.isXo).toBe(
                'N',
            );
        });
    });

    describe('поля не установлены на портале', () => {
        it('хук работает на дефолтах, запрос не теряется', () => {
            const { item, intent } = resolve(
                { name: 'Из запроса', isXo: 'Y' },
                FILLED_CARD,
                false,
                [],
            );
            expect(item.name).toBe('Из запроса');
            expect(intent.isXo).toBe('Y');
            expect(intent.stageMode).toBe('from_lead');
        });
    });

    it('signals объясняют, откуда взято каждое значение', () => {
        const { signals } = resolve({ isXo: 'Y' }, FILLED_CARD);
        expect(signals.join('\n')).toContain('isXo=Y из запроса');
        expect(signals.join('\n')).toContain('из поля xo_name');
    });
});
