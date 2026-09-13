import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { XoRoutingModel } from '../intake/xo-routing.model';

/**
 * Маршрутизация ХО читается из чужих по происхождению данных: значения
 * пишет робот Битрикса, а тот отдаёт «пусто» четырьмя разными способами.
 * Ошибка здесь стоит дорого в обе стороны: ложное «готов» уводит лид
 * round-robin'ом по случайному отделу, ложное «не готов» вешает его в
 * очереди навсегда.
 */
const FIELD_BY_CODE: Record<string, string> = {
    xo_responsible: 'XO_RESPONSIBLE',
    department_string: 'DEPARTMENT_STRING',
    xo_name: 'XO_NAME',
    xo_date: 'XO_DATE',
    xo_created: 'XO_CREATED',
};

const makeModel = (installed = true) => {
    const portal = {
        getEntityFieldByCode: (_entity: string, code: string) => {
            if (!installed) return undefined;
            const bitrixId = FIELD_BY_CODE[code];
            return bitrixId ? { bitrixId, items: [] } : undefined;
        },
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
    } as unknown as PortalModel;
    return new XoRoutingModel(portal, 'lead');
};

describe('XoRoutingModel', () => {
    it('читает полный набор полей робота', () => {
        const routing = makeModel().read({
            UF_CRM_XO_RESPONSIBLE: '15',
            UF_CRM_DEPARTMENT_STRING: 'Отдел продаж №2',
            UF_CRM_XO_NAME: 'Восстановление из Отказников',
            UF_CRM_XO_DATE: '20.09.2026 10:00:00',
            UF_CRM_XO_CREATED: '7',
        });

        expect(routing).toEqual({
            responsible: 15,
            department: 'Отдел продаж №2',
            name: 'Восстановление из Отказников',
            deadline: '20.09.2026 10:00:00',
            created: 7,
        });
    });

    it('постановщик необязателен — без него остальное читается как обычно', () => {
        const routing = makeModel().read({
            UF_CRM_XO_RESPONSIBLE: '15',
            UF_CRM_DEPARTMENT_STRING: 'Отдел продаж №2',
        });

        expect(routing.created).toBeNull();
        expect(routing.responsible).toBe(15);
    });

    /* Битрикс отдаёт незаполненное поле как '', false, '0' или []. */
    it.each([
        ['пустая строка', ''],
        ['false', false],
        ['нулевой сотрудник', '0'],
        ['пустой массив', []],
        ['пробелы', '   '],
        ['null', null],
        ['поля нет в ответе', undefined],
    ])('%s → не заполнено', (_case, raw) => {
        const routing = makeModel().read({
            UF_CRM_XO_RESPONSIBLE: raw,
            UF_CRM_DEPARTMENT_STRING: raw,
        });

        expect(routing.responsible).toBeNull();
        expect(routing.department).toBeNull();
        expect(makeModel().isReady(routing)).toBe(false);
    });

    /* Multiple-поле приходит массивом — берём первое значение. */
    it('из массива берёт первое значение', () => {
        const routing = makeModel().read({
            UF_CRM_DEPARTMENT_STRING: ['ОП Северный', 'ОП Южный'],
        });

        expect(routing.department).toBe('ОП Северный');
    });

    it('готов, если есть хотя бы ответственный', () => {
        const routing = makeModel().read({ UF_CRM_XO_RESPONSIBLE: '15' });

        expect(makeModel().isReady(routing)).toBe(true);
        expect(routing.department).toBeNull();
    });

    it('готов, если есть хотя бы отдел', () => {
        const routing = makeModel().read({ UF_CRM_DEPARTMENT_STRING: 'ОП' });

        expect(makeModel().isReady(routing)).toBe(true);
        expect(routing.responsible).toBeNull();
    });

    /*
     * Название и дата НЕ участвуют в готовности: у них есть дефолты в хуке,
     * иначе элемент завис бы в очереди из-за необязательного поля.
     */
    it('название и дата на готовность не влияют', () => {
        const routing = makeModel().read({
            UF_CRM_XO_NAME: 'Обзвон',
            UF_CRM_XO_DATE: '20.09.2026 10:00:00',
        });

        expect(makeModel().isReady(routing)).toBe(false);
    });

    it('нечисловой ответственный не считается сотрудником', () => {
        const routing = makeModel().read({
            UF_CRM_XO_RESPONSIBLE: 'user_15',
        });

        expect(routing.responsible).toBeNull();
    });

    it('поля не установлены на портале → всё пусто, не готов', () => {
        const model = makeModel(false);
        const routing = model.read({ UF_CRM_XO_RESPONSIBLE: '15' });

        expect(routing.responsible).toBeNull();
        expect(model.isReady(routing)).toBe(false);
    });
});
