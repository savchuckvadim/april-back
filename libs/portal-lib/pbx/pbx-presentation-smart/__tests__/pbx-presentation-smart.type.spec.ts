import {
    buildPresentationItemFieldName,
    buildPresentationUfName,
    PRESENTATION_APPROVE_STAGE_ITEMS,
    PRESENTATION_FAIL_REASON_ITEMS,
    PRESENTATION_OPEN_STAGE_CODES,
    PRESENTATION_RESULT_ITEMS,
    PRESENTATION_SMART_CODE,
    PRESENTATION_SMART_FIELDS,
    PRESENTATION_SMART_STAGES,
    PRESENTATION_SMART_SURVEY_MIRROR,
    presentationFailReasonItemCode,
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

    it('воронка = sales_presentation + согласование: 8 стадий, явная семантика', () => {
        const categories = buildPresentationInstallCategories();
        expect(categories).toHaveLength(1);
        expect(categories[0].isDefault).toBe(true);
        expect(categories[0].stages.map(stage => stage.code)).toEqual([
            'pres_new',
            'pres_approve',
            'pres_plan',
            'pres_pending',
            'pres_success',
            'pres_rejected',
            'pres_noresult',
            'pres_fail',
        ]);

        const byCode = Object.fromEntries(
            categories[0].stages.map(stage => [stage.code, stage]),
        );
        // Открытые стадии — явная пустая семантика (эвристика не подключается).
        expect(byCode['pres_new'].semantics).toBe('');
        // Согласование — рабочая стадия: заявка ещё жива.
        expect(byCode['pres_approve'].semantics).toBe('');
        expect(byCode['pres_plan'].semantics).toBe('');
        // «Перенос» намеренно открытая: презентация ещё жива.
        expect(byCode['pres_pending'].semantics).toBe('');
        expect(byCode['pres_success'].semantics).toBe('S');
        // Отклонение заявки — провальный исход, но СВОЙ: «вернули на
        // доработку» не должно сливаться с «презентация не состоялась».
        expect(byCode['pres_rejected'].semantics).toBe('F');
        expect(byCode['pres_noresult'].semantics).toBe('F');
        expect(byCode['pres_fail'].semantics).toBe('F');
        // Первая стадия — стадия по умолчанию.
        expect(byCode['pres_new'].isDefault).toBe('Y');
        expect(byCode['pres_approve'].isDefault).toBe('N');
        expect(byCode['pres_plan'].isDefault).toBe('N');
    });

    it('порядок стадий: все промежуточные ДО закрывающих, sort растёт', () => {
        const stages = buildPresentationInstallCategories()[0].stages;
        const orders = stages.map(stage => stage.order);
        expect([...orders].sort((a, b) => a - b)).toEqual(orders);
        // Bitrix не любит «промежуточную после успешной» по SORT, поэтому
        // pres_rejected стоит в группе исходов, а не между approve и plan.
        const openOrders = stages
            .filter(stage => stage.semantics === '')
            .map(stage => stage.order);
        const closedOrders = stages
            .filter(stage => stage.semantics !== '')
            .map(stage => stage.order);
        expect(Math.max(...openOrders)).toBeLessThan(Math.min(...closedOrders));
    });

    it('открытые стадии выводятся из состава, а не перечисляются руками', () => {
        // Их использует findOpenElement: пропущенная стадия = спонтанные
        // дубли на каждый отчёт по ждущей согласования заявке.
        expect(PRESENTATION_OPEN_STAGE_CODES).toEqual([
            'pres_new',
            'pres_approve',
            'pres_plan',
            'pres_pending',
        ]);
    });

    it('коды стадий уникальны, суффиксы STATUS_ID и имена полей по канону', () => {
        expect(PRESENTATION_SMART_STAGES).toHaveLength(8);
        const codes = PRESENTATION_SMART_STAGES.map(stage => stage.code);
        expect(new Set(codes).size).toBe(codes.length);
        const suffixes = codes.map(presentationStageBitrixId);
        expect(new Set(suffixes).size).toBe(suffixes.length);
        expect(presentationStageBitrixId('pres_plan')).toBe('PLAN');
        expect(presentationStageBitrixId('pres_noresult')).toBe('NORESULT');
        expect(presentationStageBitrixId('pres_approve')).toBe('APPROVE');
        expect(presentationStageBitrixId('pres_rejected')).toBe('REJECTED');
        expect(buildPresentationUfName(8, 'PRES_BASE_DEAL')).toBe(
            'UF_CRM_8_PRES_BASE_DEAL',
        );
        expect(buildPresentationItemFieldName(8, 'PRES_BASE_DEAL')).toBe(
            'ufCrm8PresBaseDeal',
        );
    });

    it('контур заявки заведён целиком и с правильными типами', () => {
        const byCode = Object.fromEntries(
            PRESENTATION_SMART_FIELDS.map(field => [field.code, field]),
        );
        // Связь с ТМЦ-сделкой — crm-поле, привязка ОБЯЗАТЕЛЬНА (без неё
        // значения ['D_1'] молча теряются).
        expect(byCode['PRES_TMC_DEAL'].type).toBe('crm');
        expect(byCode['PRES_TMC_DEAL']).toHaveProperty('crmEntities', ['DEAL']);
        expect(byCode['PRES_TMC_RESPONSIBLE'].type).toBe('employee');
        expect(byCode['PRES_OWNER'].type).toBe('employee');
        expect(byCode['PRES_APPROVE_DATE'].type).toBe('datetime');
        expect(byCode['PRES_APPROVE_COMMENT'].type).toBe('string');
        // Три ветки комментариев согласующих — ОДНА лента, а не три поля.
        expect(byCode['PRES_REQUEST_COMMENT']).toMatchObject({
            type: 'string',
            isMultiple: true,
        });
        expect(byCode['PRES_MOVE_DATE'].type).toBe('datetime');
        expect(byCode['PRES_IS_NEED_EDU'].type).toBe('boolean');
        expect(byCode['PRES_NEED_EDU_DATE'].type).toBe('datetime');
        expect(byCode['PRES_IS_NEED_TECHNIC'].type).toBe('boolean');
        expect(byCode['PRES_NEED_TECHNIC_DATE'].type).toBe('datetime');
        expect(byCode['PRES_NEED_TECHNIC_COMMENT'].type).toBe('string');
    });

    it('справочники заявки и причин отказа уезжают в install-контракт', () => {
        const fields = buildPresentationInstallFields();
        const approve = fields.find(
            field => field.code === 'PRES_APPROVE_STAGE',
        );
        // Четыре ветки РПА — значениями, а не стадиями воронки.
        expect(approve?.list).toHaveLength(
            PRESENTATION_APPROVE_STAGE_ITEMS.length,
        );
        expect(approve?.list.map(item => item.CODE)).toEqual([
            'pres_appr_owner',
            'pres_appr_manager',
            'pres_appr_edu',
            'pres_appr_technic',
        ]);

        const failReason = fields.find(
            field => field.code === 'PRES_FAIL_REASON',
        );
        // Зеркало op_efield_fail_reason: 11 значений, коды уникальны.
        expect(failReason?.list).toHaveLength(11);
        const codes = (failReason?.list ?? []).map(item => item.CODE);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('код причины отказа переводится подстановкой префикса, мусор — null', () => {
        // Суффиксы совпадают с op_efield_fail_* — таблица соответствий не нужна.
        expect(presentationFailReasonItemCode('notime')).toBe(
            'pres_fail_notime',
        );
        expect(presentationFailReasonItemCode('c_price')).toBe(
            'pres_fail_c_price',
        );
        // Справочник правили руками — лучше без причины, чем с несуществующей.
        expect(presentationFailReasonItemCode('unknown_reason')).toBeNull();
        expect(presentationFailReasonItemCode(null)).toBeNull();
        expect(presentationFailReasonItemCode('')).toBeNull();
        // Все items покрываются переводом (иначе значение недостижимо).
        for (const item of PRESENTATION_FAIL_REASON_ITEMS) {
            const suffix = item.CODE.replace(/^pres_fail_/, '');
            expect(presentationFailReasonItemCode(suffix)).toBe(item.CODE);
        }
    });

    it('PRES_MHISTORY удалено: мёртвых объявлений в составе нет', () => {
        // Поле было объявлено, но не писалось ни одной строкой кода — в
        // карточке висел вечно пустой UF. Лента элемента — PRES_COMMENTS,
        // лента клиента — op_mhistory на сущностях.
        const codes = PRESENTATION_SMART_FIELDS.map(field => field.code);
        expect(codes).not.toContain('PRES_MHISTORY');
        expect(codes).toContain('PRES_COMMENTS');
    });

    it('карта анкеты ссылается на реальные поля реестра и поля смарта', () => {
        const registryCodes = new Set(
            PBX_SALES_EVENT_FIELDS.map(field => field.code),
        );
        const smartCodes = new Set(
            PRESENTATION_SMART_FIELDS.map(field => field.code),
        );
        // 23 ответа: 2 сводных («5К»/«Хвост») + 9 детальных «5К» +
        // 6 вопросов «Разговора» (op_talk_*, с лида) + 6 полей «Хвоста»
        // (deal-only op_xvost_*).
        expect(PRESENTATION_SMART_SURVEY_MIRROR).toHaveLength(23);
        for (const entry of PRESENTATION_SMART_SURVEY_MIRROR) {
            expect(registryCodes.has(entry.source)).toBe(true);
            expect(smartCodes.has(entry.target)).toBe(true);
        }
        // Анкету («5К» + «Разговор») фрейм пишет на ЛИД, поля «Хвоста»
        // (op_xvost_*) установлены только на сделке.
        const leadSources = PRESENTATION_SMART_SURVEY_MIRROR.filter(
            entry => entry.from === 'lead',
        );
        expect(leadSources).toHaveLength(17);
    });
});
