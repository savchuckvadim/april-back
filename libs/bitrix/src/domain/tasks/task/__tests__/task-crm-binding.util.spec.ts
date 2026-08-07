import {
    mergeTaskCrmBindings,
    parseTaskCrmBinding,
    taskCrmBinding,
} from '../lib/task-crm-binding.util';

describe('taskCrmBinding', () => {
    it('собирает привязки всех четырёх сущностей', () => {
        expect(taskCrmBinding('LEAD', 12)).toBe('L_12');
        expect(taskCrmBinding('DEAL', 34)).toBe('D_34');
        expect(taskCrmBinding('CONTACT', 56)).toBe('C_56');
        expect(taskCrmBinding('COMPANY', 78)).toBe('CO_78');
    });

    it('принимает $result-токен batch-команды как id', () => {
        expect(taskCrmBinding('DEAL', '$result[new_deal]')).toBe(
            'D_$result[new_deal]',
        );
    });
});

describe('parseTaskCrmBinding', () => {
    it('разбирает все четыре префикса', () => {
        expect(parseTaskCrmBinding('L_12')).toEqual({
            entity: 'LEAD',
            id: '12',
        });
        expect(parseTaskCrmBinding('D_34')).toEqual({
            entity: 'DEAL',
            id: '34',
        });
        expect(parseTaskCrmBinding('C_56')).toEqual({
            entity: 'CONTACT',
            id: '56',
        });
        expect(parseTaskCrmBinding('CO_78')).toEqual({
            entity: 'COMPANY',
            id: '78',
        });
    });

    it('CO_ не путается с C_ (компания против контакта)', () => {
        expect(parseTaskCrmBinding('CO_1')?.entity).toBe('COMPANY');
        expect(parseTaskCrmBinding('C_1')?.entity).toBe('CONTACT');
    });

    it('неизвестный формат (смарт-процесс) возвращает null, а не ошибку', () => {
        expect(parseTaskCrmBinding('T4b_99')).toBeNull();
        expect(parseTaskCrmBinding('')).toBeNull();
        expect(parseTaskCrmBinding('DEAL')).toBeNull();
    });
});

describe('mergeTaskCrmBindings', () => {
    it('объединяет наборы без дублей, сохраняя порядок первого вхождения', () => {
        expect(
            mergeTaskCrmBindings(['CO_1', 'D_2'], ['D_2', 'L_3'], undefined, [
                'CO_1',
                'T4b_99',
            ]),
        ).toEqual(['CO_1', 'D_2', 'L_3', 'T4b_99']);
    });

    it('пустой вход даёт пустой массив', () => {
        expect(mergeTaskCrmBindings()).toEqual([]);
        expect(mergeTaskCrmBindings(undefined, [])).toEqual([]);
    });
});
