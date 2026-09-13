import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    buildColdCallMissingNote,
    resolveColdCallData,
} from '../lib/cold-call-intent';
import { IColdCallData } from '../type/cold-hook-silence.interface';
import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../dto/cold.dto';

/**
 * Отличие от lead-to-work: здесь НЕТ round-robin, поэтому нехватка «кому»
 * обязана останавливать постановку с объяснением, а не уходить в тихий
 * дефолт — иначе холодный звонок уедет случайному человеку.
 */
const FIELD_BY_CODE: Record<string, string> = {
    xo_responsible: 'XO_RESPONSIBLE',
    xo_created: 'XO_CREATED',
    xo_name: 'XO_NAME',
    xo_date: 'XO_DATE',
    department_string: 'DEPARTMENT_STRING',
    op_xo_is_force: 'OP_XO_IS_FORCE',
    op_xo_is_xo: 'OP_XO_IS_XO',
    op_xo_lead_stage_mode: 'OP_XO_LEAD_STAGE_MODE',
};

const portal = () =>
    ({
        getEntityFieldByCode: (_e: string, code: string) => {
            const bitrixId = FIELD_BY_CODE[code];
            return bitrixId ? { bitrixId, items: [] } : undefined;
        },
        getFieldBitrixId: (f: { bitrixId: string }) => `UF_CRM_${f.bitrixId}`,
        getTimezone: () => 'Europe/Moscow',
    }) as unknown as PortalModel;

const HOOK: IColdCallData = {
    entityType: EnumColdCallEntityType.COMPANY,
    entityId: '77',
    isTmc: EnumColdCallIsTmc.N,
    // force НЕ задаём: базовый хук «ничего не сказал», иначе запрос
    // всегда выигрывал бы и ветку чтения поля было бы не проверить.
};

const CARD = {
    UF_CRM_XO_RESPONSIBLE: '15',
    UF_CRM_XO_CREATED: '7',
    UF_CRM_XO_NAME: 'ООО Ромашка',
    UF_CRM_XO_DATE: '13.09.2026 16:16:12',
};

const resolve = (
    hook: Partial<IColdCallData> = {},
    entityRow: Record<string, unknown> | null = CARD,
) =>
    resolveColdCallData({
        hook: { ...HOOK, ...hook },
        entityRow,
        entityType: 'company',
        portal: portal(),
    });

describe('resolveColdCallData', () => {
    it('запрос перебивает карточку', () => {
        const { data } = resolve({
            responsible: 'user_99',
            created: 'user_88',
            name: 'Из запроса',
            deadline: '01.10.2026 09:00:00',
        });

        expect(data).toMatchObject({
            responsible: 'user_99',
            created: 'user_88',
            name: 'Из запроса',
            deadline: '01.10.2026 09:00:00',
        });
    });

    it('пустой запрос — всё читается из карточки', () => {
        const { data } = resolve();

        expect(data).toMatchObject({
            responsible: '15',
            created: '7',
            name: 'ООО Ромашка',
            deadline: '13.09.2026 16:16:12',
        });
    });

    it('ISO со смещением из поля нормализуется в формат CRM', () => {
        const { data } = resolve(
            {},
            { ...CARD, UF_CRM_XO_DATE: '2026-09-13T16:16:12+03:00' },
        );
        expect(data?.deadline).toBe('13.09.2026 16:16:12');
    });

    describe('нехватка данных останавливает постановку', () => {
        it('нет ответственного нигде → data=null с указанием поля', () => {
            const { data, missing } = resolve(
                {},
                { ...CARD, UF_CRM_XO_RESPONSIBLE: '' },
            );

            expect(data).toBeNull();
            expect(missing).toHaveLength(1);
            expect(missing[0]).toMatchObject({
                fieldCode: 'xo_responsible',
                queryParam: 'responsible',
            });
        });

        it('нет даты нигде → data=null', () => {
            const { data, missing } = resolve(
                {},
                { ...CARD, UF_CRM_XO_DATE: '' },
            );

            expect(data).toBeNull();
            expect(missing[0].fieldCode).toBe('xo_date');
        });

        it('карточка не прочитана и запрос пуст → перечислено всё', () => {
            const { data, missing } = resolve({}, null);

            expect(data).toBeNull();
            expect(missing.map(m => m.fieldCode)).toEqual([
                'xo_responsible',
                'xo_date',
            ]);
        });
    });

    describe('необязательные поля имеют фолбэк, а не блокируют', () => {
        it('без постановщика автором становится ответственный', () => {
            const { data } = resolve({}, { ...CARD, UF_CRM_XO_CREATED: '' });
            expect(data?.created).toBe('15');
        });

        it('без названия — пусто (ниже подставится название сущности)', () => {
            const { data } = resolve({}, { ...CARD, UF_CRM_XO_NAME: '' });
            expect(data?.name).toBe('');
        });
    });

    describe('force из поля op_xo_is_force', () => {
        it('поле поднято → Y', () => {
            const { data } = resolve(
                {},
                { ...CARD, UF_CRM_OP_XO_IS_FORCE: '1' },
            );
            expect(data?.force).toBe(EnumColdCallForce.Y);
        });

        it('запрос главнее поля', () => {
            const { data } = resolve(
                { force: EnumColdCallForce.N },
                { ...CARD, UF_CRM_OP_XO_IS_FORCE: '1' },
            );
            expect(data?.force).toBe(EnumColdCallForce.N);
        });
    });
});

describe('buildColdCallMissingNote', () => {
    it('называет и поле карточки, и параметр хука', () => {
        const note = buildColdCallMissingNote([
            {
                label: 'ответственный за звонок',
                fieldCode: 'xo_responsible',
                queryParam: 'responsible',
            },
        ]);

        expect(note).toContain('ответственный за звонок');
        expect(note).toContain('xo_responsible');
        expect(note).toContain('responsible');
        expect(note).toContain('снова');
    });

    it('перенос строки — batch-символ, а не \n (комментарий уезжает в URL)', () => {
        const note = buildColdCallMissingNote([
            {
                label: 'дата звонка',
                fieldCode: 'xo_date',
                queryParam: 'deadline',
            },
        ]);

        expect(note).toContain('%0A');
        expect(note).not.toContain('\n');
    });
});
