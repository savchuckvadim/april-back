import {
    CONST_SMART_REGISTRY,
    findConstSmartByTypeGroup,
} from '../../const-smart-registry/const-smart-registry';
import {
    EVENT_TYPE_REGISTRY,
    EVENT_TYPES_WITH_SMART,
    EnumEventSmartFlow,
    findEventType,
    findEventTypesBySmartKind,
    findSmartBindingByTypeGroup,
    findSmartKindByFlow,
} from '../event-type-registry';

/**
 * Реестр типов события — данные, из которых выводится всё остальное:
 * справочники условий каталога анкет, выключатель анкет в настройках и
 * маршрутизация ответов смарт-анкеты в поток. Поэтому спека пиннит две
 * вещи: СОСТАВ (зеркало фронтового union `EventTaskEventType`) и то, что
 * объявленный смарт действительно существует в CONST_SMART_REGISTRY —
 * иначе связь «тип события → смарт» указывала бы в никуда, и это
 * выяснилось бы уже на портале.
 */

/** Зеркало union `EventTaskEventType` фрейма event-sales, по порядку. */
const FRONT_EVENT_TYPES = [
    'xo',
    'xoRequest',
    'xoLead',
    'warm',
    'presentation',
    'refine',
    'hot',
    'moneyAwait',
    'supply',
    'ss',
];

/** Зеркало PLAN_CALL_TYPES фрейма: что менеджеру реально предлагают. */
const FRONT_PLAN_TYPES = [
    'warm',
    'presentation',
    'refine',
    'hot',
    'moneyAwait',
    'supply',
];

describe('EVENT_TYPE_REGISTRY', () => {
    it('состав и порядок — зеркало фронтового EventTaskEventType', () => {
        expect(EVENT_TYPE_REGISTRY.map(item => item.code)).toEqual(
            FRONT_EVENT_TYPES,
        );
    });

    it('планируемые типы — зеркало PLAN_CALL_TYPES (без кода cold)', () => {
        const plannable = EVENT_TYPE_REGISTRY.filter(
            item => item.isPlannable,
        ).map(item => item.code);
        expect(plannable).toEqual(FRONT_PLAN_TYPES);
    });

    it('у каждого типа есть код и русская подпись, коды уникальны', () => {
        const codes = EVENT_TYPE_REGISTRY.map(item => item.code);
        expect(new Set(codes).size).toBe(codes.length);
        for (const item of EVENT_TYPE_REGISTRY) {
            expect(`${item.code}:${item.name.length > 0}`).toBe(
                `${item.code}:true`,
            );
        }
    });

    it('объявленный смарт существует в CONST_SMART_REGISTRY', () => {
        for (const item of EVENT_TYPES_WITH_SMART) {
            const smart = item.smart;
            if (!smart) continue;
            const descriptor = findConstSmartByTypeGroup(
                smart.type,
                smart.group,
            );
            expect(`${item.code}:${descriptor?.kind ?? 'нет смарта'}`).toBe(
                `${item.code}:${smart.kind}`,
            );
        }
    });

    it('смарты типов события сегодня ровно два: презентация и решение', () => {
        expect(EVENT_TYPES_WITH_SMART.map(item => item.code)).toEqual([
            'presentation',
            'hot',
        ]);
        expect(EVENT_TYPES_WITH_SMART.map(item => item.smart?.flow)).toEqual([
            EnumEventSmartFlow.presentation,
            EnumEventSmartFlow.zpr,
        ]);
    });

    it('один смарт — один тип события: элемент чужого типа искать негде', () => {
        for (const descriptor of CONST_SMART_REGISTRY) {
            const types = findEventTypesBySmartKind(descriptor.kind);
            expect(`${descriptor.kind}:${types.length <= 1}`).toBe(
                `${descriptor.kind}:true`,
            );
        }
    });

    it('поиск типов по kind смарта отдаёт код типа события, а не смарта', () => {
        expect(findEventTypesBySmartKind('presentation')).toEqual([
            'presentation',
        ]);
        expect(findEventTypesBySmartKind('zpr')).toEqual(['hot']);
        // Смарт без типа события (aicall) ответов анкеты не принимает.
        expect(findEventTypesBySmartKind('aicall')).toEqual([]);
    });

    it('строка smarts (type, group) находит привязку', () => {
        expect(findSmartBindingByTypeGroup('pres', 'sales')?.kind).toBe(
            'presentation',
        );
        expect(findSmartBindingByTypeGroup('zpr', 'sales')?.kind).toBe('zpr');
        // Смарт СКАП стоит на порталах, но потока событий у него нет.
        expect(findSmartBindingByTypeGroup('skap', 'sales')).toBeUndefined();
    });

    it('неизвестный код типа — undefined, а не догадка', () => {
        expect(findEventType('presentation')?.name).toBe('Презентация');
        expect(findEventType('cold')).toBeUndefined();
        expect(findEventType('')).toBeUndefined();
    });

    it('поток находит СВОЙ смарт: по нему джоб отбирает свои ответы', () => {
        // Сайд-очередь знает, какая она очередь, а не какой у неё смарт:
        // связь «поток → смарт» живёт здесь, а не строкой в use-case.
        expect(findSmartKindByFlow(EnumEventSmartFlow.presentation)).toBe(
            'presentation',
        );
        expect(findSmartKindByFlow(EnumEventSmartFlow.zpr)).toBe('zpr');
    });
});
