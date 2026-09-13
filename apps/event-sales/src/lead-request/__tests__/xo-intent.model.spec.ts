import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { XoIntentModel } from '../intake/xo-intent.model';

/**
 * Намерение хука читается из полей, которые заполняет робот Битрикса.
 * Цена ошибки: не распознали `op_xo_lead_stage_mode` → сделка уезжает не в
 * ту стадию; спутали «не заполнено» с «снято» → крон-подстраховка досылает
 * элемент не с тем сценарием, который задумывал робот.
 */
const FIELD_BY_CODE: Record<string, string> = {
    op_xo_lead_stage_mode: 'OP_XO_LEAD_STAGE_MODE',
    op_xo_is_xo: 'OP_XO_IS_XO',
    op_xo_is_force: 'OP_XO_IS_FORCE',
};

const makeModel = (installed: string[] = Object.keys(FIELD_BY_CODE)) => {
    const portal = {
        getEntityFieldByCode: (_entity: string, code: string) => {
            if (!installed.includes(code)) return undefined;
            const bitrixId = FIELD_BY_CODE[code];
            return bitrixId ? { bitrixId, items: [] } : undefined;
        },
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
    } as unknown as PortalModel;
    return new XoIntentModel(portal, 'lead');
};

describe('XoIntentModel', () => {
    it('читает полный набор полей намерения', () => {
        const intent = makeModel().read({
            UF_CRM_OP_XO_LEAD_STAGE_MODE: 'new',
            UF_CRM_OP_XO_IS_XO: '1',
            UF_CRM_OP_XO_IS_FORCE: '0',
        });

        expect(intent).toEqual({
            stageMode: 'new',
            isXo: true,
            isForce: false,
        });
    });

    describe('op_xo_lead_stage_mode', () => {
        it.each([
            ['new', 'new'],
            ['cold', 'cold'],
            ['NEW (регистр не важен)', 'new'],
        ])('%s → %s', (_case, expected) => {
            const value = _case.startsWith('NEW') ? 'NEW' : _case;
            expect(
                makeModel().read({ UF_CRM_OP_XO_LEAD_STAGE_MODE: value })
                    .stageMode,
            ).toBe(expected);
        });

        /*
         * Модель НЕ подставляет дефолт: «робот не сказал» обязано
         * отличаться от «робот сказал cold», иначе политике
         * resolveXoStageMode нечего решать (см. xo-stage-mode.spec).
         */
        it.each([
            ['пусто', ''],
            ['пробелы', '   '],
            ['мусор от робота', 'from_lead'],
            ['поля нет в ответе', undefined],
        ])('%s → null («робот не сказал»)', (_case, raw) => {
            expect(
                makeModel().read({ UF_CRM_OP_XO_LEAD_STAGE_MODE: raw })
                    .stageMode,
            ).toBeNull();
        });

        it('поле не установлено на портале → null', () => {
            expect(makeModel([]).read({}).stageMode).toBeNull();
        });

        it('явный cold читается как cold, а не как «не сказал»', () => {
            expect(
                makeModel().read({ UF_CRM_OP_XO_LEAD_STAGE_MODE: 'cold' })
                    .stageMode,
            ).toBe('cold');
        });
    });

    describe('флаги: «не заполнено» отличается от «снято»', () => {
        it('пустое поле → null, вызывающий применит свой дефолт', () => {
            const intent = makeModel().read({
                UF_CRM_OP_XO_IS_XO: '',
                UF_CRM_OP_XO_IS_FORCE: '',
            });
            expect(intent.isXo).toBeNull();
            expect(intent.isForce).toBeNull();
        });

        it('снятая галка → false, а не null', () => {
            expect(makeModel().read({ UF_CRM_OP_XO_IS_XO: '0' }).isXo).toBe(
                false,
            );
            expect(makeModel().read({ UF_CRM_OP_XO_IS_XO: 'N' }).isXo).toBe(
                false,
            );
        });

        it.each([
            ['1', true],
            ['Y', true],
            [true, true],
            [['1'], true],
        ])('поставленная галка %s → true', (raw, expected) => {
            expect(makeModel().read({ UF_CRM_OP_XO_IS_XO: raw }).isXo).toBe(
                expected,
            );
        });
    });

    describe('missingIntentFields — диагностика установки полей', () => {
        it('все установлены → пусто', () => {
            expect(makeModel().missingIntentFields()).toEqual([]);
        });

        it('ничего не установлено → перечислены все коды', () => {
            expect(makeModel([]).missingIntentFields()).toEqual([
                'op_xo_lead_stage_mode',
                'op_xo_is_xo',
                'op_xo_is_force',
            ]);
        });

        it('установлено частично → только отсутствующие', () => {
            expect(makeModel(['op_xo_is_xo']).missingIntentFields()).toEqual([
                'op_xo_lead_stage_mode',
                'op_xo_is_force',
            ]);
        });
    });
});
