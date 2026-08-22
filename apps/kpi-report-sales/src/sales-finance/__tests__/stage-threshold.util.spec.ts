import {
    IPCategory,
    IStage,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { resolveStageIdsFromThreshold } from '../domain/calc/stage-threshold.util';

function stage(code: string, bitrixId: string, name: string): IStage {
    return {
        id: 0,
        created_at: '',
        updated_at: '',
        btx_category_id: 0,
        name,
        title: name,
        code,
        bitrixId,
        color: '',
        isActive: 1,
    };
}

function category(stages: IStage[]): IPCategory {
    return {
        id: 0,
        type: 'deal',
        group: 'sales',
        name: 'ОП Основная',
        title: 'ОП Основная',
        bitrixId: '7',
        bitrixCamelId: '',
        code: 'sales_base',
        isActive: 1,
        entity_id: 0,
        entity_type: '',
        parent_type: '',
        stages,
    };
}

const FULL_LADDER = category([
    stage('sales_new', 'NEW', 'Новая'),
    stage('sales_pres', 'PRESENTATION', 'Презентация'),
    stage('sales_refine', 'REFINE', 'Доработка'),
    stage('sales_offer_create', 'OFFER_CREATE', 'Документы'),
    stage('sales_document_send', 'DOCUMENT_SEND', 'Отправлены'),
    stage('sales_in_progress', 'IN_PROSRESS', 'В решении'),
    stage('sales_money_await', 'MONEY_AWAIT', 'В оплате'),
    stage('sales_supply', 'SUPPLY_INIT', 'Поставка'),
    stage('sales_success', 'WON', 'Успех'),
    stage('sales_fail', 'LOSE', 'Отказ'),
    stage('sales_double', 'APOLOGY', 'Не состоялась'),
    stage('sales_not_ca', 'NOT_CA', 'Не ЦА'),
]);

describe('resolveStageIdsFromThreshold', () => {
    it("'document' даёт стадии order 5..9 без WON, формат C{cat}:{stage}", () => {
        const { stageIds } = resolveStageIdsFromThreshold(
            FULL_LADDER,
            'document',
        );
        expect(stageIds).toEqual([
            'C7:OFFER_CREATE',
            'C7:DOCUMENT_SEND',
            'C7:IN_PROSRESS',
            'C7:MONEY_AWAIT',
            'C7:SUPPLY_INIT',
        ]);
    });

    it("'presentation' добавляет стадии Презентация (4) и Доработка (5)", () => {
        const { stageIds } = resolveStageIdsFromThreshold(
            FULL_LADDER,
            'presentation',
        );
        expect(stageIds[0]).toBe('C7:PRESENTATION');
        expect(stageIds[1]).toBe('C7:REFINE');
        expect(stageIds).toHaveLength(7);
        expect(stageIds).not.toContain('C7:WON');
    });

    /*
     * «Доработка» стоит ДО документов (order 5 < 6), поэтому в порог
     * «от документов» она НЕ входит: клиента ещё дорабатывают, документов
     * нет. Раньше стадия стояла после «Отправлены» и в этот порог попадала.
     */
    it("'document' не включает «Доработку» — она ниже документов", () => {
        const { stageIds } = resolveStageIdsFromThreshold(
            FULL_LADDER,
            'document',
        );
        expect(stageIds).not.toContain('C7:REFINE');
    });

    /* Закрытые стадии (order > WON) в «горячие» не попадают ни при каком пороге. */
    it('отказные финалы не попадают в горячие стадии', () => {
        const { stageIds } = resolveStageIdsFromThreshold(
            FULL_LADDER,
            'presentation',
        );
        expect(stageIds).not.toContain('C7:LOSE');
        expect(stageIds).not.toContain('C7:APOLOGY');
        expect(stageIds).not.toContain('C7:NOT_CA');
    });

    it('отсутствующие на портале стадии пропускаются', () => {
        const partial = category([
            stage('sales_offer_create', 'OFFER_CREATE', 'Документы'),
            stage('sales_money_await', 'MONEY_AWAIT', 'В оплате'),
        ]);
        const { stageIds } = resolveStageIdsFromThreshold(partial, 'document');
        expect(stageIds).toEqual(['C7:OFFER_CREATE', 'C7:MONEY_AWAIT']);
    });

    it('маппинг STAGE_ID → код и имя стадии заполняется', () => {
        const { stageByStageId } = resolveStageIdsFromThreshold(
            FULL_LADDER,
            'document',
        );
        expect(stageByStageId.get('C7:OFFER_CREATE')).toEqual({
            code: 'sales_offer_create',
            name: 'Документы',
        });
    });
});
