import {
    buildPresentationItemFieldName,
    buildPresentationUfName,
    PRESENTATION_RESULT_ITEMS,
    PRESENTATION_SMART_CODE,
    PRESENTATION_SMART_FIELDS,
    PRESENTATION_SMART_STAGES,
    PRESENTATION_SMART_SURVEY_MIRROR,
    presentationStageBitrixId,
} from '../type/pbx-presentation-smart.type';
import {
    buildPresentationInstallCategories,
    buildPresentationInstallFields,
} from '../type/pbx-presentation-smart-field.type';
import { PRESENTATION_SMART_DESCRIPTOR } from '../type/pbx-presentation-smart.descriptor';
import { PBX_SALES_EVENT_FIELDS } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/**
 * Константы смарта «Презентации»: уникальность кодов, обязательные
 * crmEntities у crm-полей, форма воронки sales_presentation и корректность
 * карты переноса анкеты (коды-источники обязаны существовать в реестре pbx).
 */
describe('константы смарта «Презентации»', () => {
    it('код смарта — pres_sales (не занимает имя Excel-шаблона presentation)', () => {
        expect(PRESENTATION_SMART_CODE).toBe('pres_sales');
        expect(PRESENTATION_SMART_DESCRIPTOR.type).toBe('pres');
        expect(PRESENTATION_SMART_DESCRIPTOR.kind).toBe('presentation');
    });

    it('коды полей уникальны, у каждого crm-поля есть привязка', () => {
        const codes = PRESENTATION_SMART_FIELDS.map(field => field.code);
        expect(new Set(codes).size).toBe(codes.length);

        for (const field of PRESENTATION_SMART_FIELDS) {
            if (field.type === 'crm') {
                // Без settings crm-поле создаётся «пустым»: ['D_1'] теряются.
                expect(field.crmEntities?.length).toBeGreaterThan(0);
            }
        }
    });

    it('descriptor.fieldsCount совпадает с install-адаптером', () => {
        expect(PRESENTATION_SMART_DESCRIPTOR.fieldsCount).toBe(
            PRESENTATION_SMART_FIELDS.length,
        );
        expect(buildPresentationInstallFields()).toHaveLength(
            PRESENTATION_SMART_FIELDS.length,
        );
    });

    it('enum-поле результата уезжает в install-контракт со всеми items', () => {
        const result = buildPresentationInstallFields().find(
            field => field.code === 'PRES_RESULT',
        );
        expect(result?.list).toHaveLength(PRESENTATION_RESULT_ITEMS.length);
        expect(result?.list[0]).toMatchObject({
            CODE: 'pres_res_done',
            XML_ID: 'pres_res_done',
            DEL: 'N',
        });
    });

    it('воронка зеркалит sales_presentation: 6 стадий, явная семантика', () => {
        const categories = buildPresentationInstallCategories();
        expect(categories).toHaveLength(1);
        expect(categories[0].isDefault).toBe(true);
        expect(categories[0].stages.map(stage => stage.code)).toEqual([
            'pres_new',
            'pres_plan',
            'pres_pending',
            'pres_success',
            'pres_noresult',
            'pres_fail',
        ]);

        const byCode = Object.fromEntries(
            categories[0].stages.map(stage => [stage.code, stage]),
        );
        // Открытые стадии — явная пустая семантика (эвристика не подключается).
        expect(byCode['pres_new'].semantics).toBe('');
        expect(byCode['pres_plan'].semantics).toBe('');
        // «Перенос» намеренно открытая: презентация ещё жива.
        expect(byCode['pres_pending'].semantics).toBe('');
        expect(byCode['pres_success'].semantics).toBe('S');
        expect(byCode['pres_noresult'].semantics).toBe('F');
        expect(byCode['pres_fail'].semantics).toBe('F');
        // Первая стадия — стадия по умолчанию.
        expect(byCode['pres_new'].isDefault).toBe('Y');
        expect(byCode['pres_plan'].isDefault).toBe('N');
    });

    it('суффиксы STATUS_ID и имена полей строятся по канону смартов', () => {
        expect(PRESENTATION_SMART_STAGES).toHaveLength(6);
        expect(presentationStageBitrixId('pres_plan')).toBe('PLAN');
        expect(presentationStageBitrixId('pres_noresult')).toBe('NORESULT');
        expect(buildPresentationUfName(8, 'PRES_BASE_DEAL')).toBe(
            'UF_CRM_8_PRES_BASE_DEAL',
        );
        expect(buildPresentationItemFieldName(8, 'PRES_BASE_DEAL')).toBe(
            'ufCrm8PresBaseDeal',
        );
    });

    it('карта анкеты ссылается на реальные поля реестра и поля смарта', () => {
        const registryCodes = new Set(
            PBX_SALES_EVENT_FIELDS.map(field => field.code),
        );
        const smartCodes = new Set(
            PRESENTATION_SMART_FIELDS.map(field => field.code),
        );
        // 17 ответов: 2 сводных («5К»/«Хвост») + 9 детальных «5К» +
        // 6 вопросов «Разговора» (deal-only op_xvost_*).
        expect(PRESENTATION_SMART_SURVEY_MIRROR).toHaveLength(17);
        for (const entry of PRESENTATION_SMART_SURVEY_MIRROR) {
            expect(registryCodes.has(entry.source)).toBe(true);
            expect(smartCodes.has(entry.target)).toBe(true);
        }
        // Детальные «5К» живут ТОЛЬКО на лиде, вопросы «Разговора» — на сделке.
        const leadSources = PRESENTATION_SMART_SURVEY_MIRROR.filter(
            entry => entry.from === 'lead',
        );
        expect(leadSources).toHaveLength(11);
    });
});
