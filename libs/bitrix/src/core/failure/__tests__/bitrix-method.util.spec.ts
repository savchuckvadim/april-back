import {
    bitrixEntityLabel,
    bitrixWriteMark,
    isBitrixWriteMethod,
} from '../bitrix-method.util';

describe('isBitrixWriteMethod — чтение или запись по имени метода', () => {
    it.each([
        'crm.deal.get',
        'crm.deal.list',
        'crm.item.fields',
        'crm.deal.userfield.list',
        'tasks.task.list',
        'tasks.task.getFields',
        'tasks.task.history.list',
        'lists.element.get',
        'crm.duplicate.findbycomm',
        'crm.activity.binding.list',
        'disk.folder.getchildren',
        'user.get',
        'user.current',
        'department.get',
        'profile',
        'server.time',
        'bizproc.workflow.instances',
        'crm.item.productrow.list',
    ])('%s — чтение', method => {
        expect(isBitrixWriteMethod(method)).toBe(false);
    });

    it.each([
        'crm.deal.add',
        'crm.deal.update',
        'crm.item.delete',
        'crm.item.productrow.set',
        'tasks.task.complete',
        'crm.activity.binding.add',
        'disk.folder.uploadfile',
        'bizproc.workflow.start',
        'im.notify.system.add',
        'im.message.add',
        'crm.timeline.comment.add',
        'lists.element.update',
    ])('%s — запись', method => {
        expect(isBitrixWriteMethod(method)).toBe(true);
    });

    it('незнакомый метод — запись (консервативно)', () => {
        expect(isBitrixWriteMethod('crm.deal.merge')).toBe(true);
        expect(isBitrixWriteMethod('some.unknown.thing')).toBe(true);
    });

    it('регистр и пробелы не важны', () => {
        expect(isBitrixWriteMethod(' TASKS.TASK.GETLIST ')).toBe(false);
    });
});

describe('bitrixEntityLabel — человеческое имя сущности', () => {
    it.each([
        ['crm.deal.update', 'сделка'],
        ['crm.company.get', 'компания'],
        ['crm.contact.add', 'контакт'],
        ['crm.lead.list', 'лид'],
        ['crm.item.update', 'элемент смарт-процесса'],
        ['crm.item.productrow.set', 'товарная строка'],
        ['crm.activity.binding.add', 'дело'],
        ['crm.timeline.comment.add', 'комментарий'],
        ['tasks.task.add', 'задача'],
        ['lists.element.add', 'строка списка'],
        ['im.notify.system.add', 'уведомление'],
        ['im.notify', 'уведомление'],
        ['im.message.add', 'сообщение'],
        ['bizproc.workflow.start', 'бизнес-процесс'],
        ['user.get', 'user.get'],
        ['crm.dealcategory.list', 'crm.dealcategory.list'],
    ])('%s → %s', (method, label) => {
        expect(bitrixEntityLabel(method)).toBe(label);
    });

    it('пометка для людей', () => {
        expect(bitrixWriteMark(true)).toBe('запись');
        expect(bitrixWriteMark(false)).toBe('чтение');
    });
});
