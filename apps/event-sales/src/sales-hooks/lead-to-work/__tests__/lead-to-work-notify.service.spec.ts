import {
    ILeadAssignNotifyInput,
    LeadToWorkNotifyService,
} from '../services/lead-to-work-notify.service';

const makeBitrix = () => {
    const systemAdd = jest.fn().mockResolvedValue(1);
    return { systemAdd, bitrix: { imNotify: { systemAdd } } };
};

const INPUT: ILeadAssignNotifyInput = {
    domain: 'd.b24.ru',
    leadId: 42,
    leadTitle: 'ООО Ромашка',
    responsibleId: 465,
    previousResponsibleId: 447,
    transferredById: null,
    requiresAccept: true,
};

/** Сообщение, ушедшее сотруднику `userId`. */
const messageTo = (systemAdd: jest.Mock, userId: number): string | undefined =>
    (systemAdd.mock.calls as [{ USER_ID: number; MESSAGE: string }][]).find(
        ([payload]) => payload.USER_ID === userId,
    )?.[0].MESSAGE;

describe('LeadToWorkNotifyService', () => {
    /*
     * Прежнему ответственному объясняем, кому ушла работа: «сотруднику
     * Иван Петров», а не «сотруднику 465» (16.09.2026 уходили голые id).
     */
    it('сам передал — прежнему имя нового ответственного', async () => {
        const { bitrix, systemAdd } = makeBitrix();
        const service = new LeadToWorkNotifyService(bitrix as never, {
            465: 'Иван Петров',
        });

        await service.notifyAssignment({ ...INPUT, transferredById: 447 });

        expect(messageTo(systemAdd, 447)).toContain(
            'Вы передали заявку [URL=https://d.b24.ru/crm/lead/details/42/]ООО Ромашка[/URL] сотруднику Иван Петров.',
        );
    });

    it('передали за него — прежнему «другому сотруднику (Имя)»', async () => {
        const { bitrix, systemAdd } = makeBitrix();
        const service = new LeadToWorkNotifyService(bitrix as never, {
            465: 'Иван Петров',
        });

        await service.notifyAssignment(INPUT);

        expect(messageTo(systemAdd, 447)).toContain(
            'передана другому сотруднику (Иван Петров).',
        );
        // Новому — «вам назначена» с требованием подтвердить.
        expect(messageTo(systemAdd, 465)).toContain('Вам назначена заявка');
    });

    it('имени нет — страховка: id', async () => {
        const { bitrix, systemAdd } = makeBitrix();
        const service = new LeadToWorkNotifyService(bitrix as never);

        await service.notifyAssignment(INPUT);

        expect(messageTo(systemAdd, 447)).toContain(
            'передана другому сотруднику (465).',
        );
    });

    it('первое назначение — прежнему ничего не уходит', async () => {
        const { bitrix, systemAdd } = makeBitrix();
        const service = new LeadToWorkNotifyService(bitrix as never, {
            465: 'Иван Петров',
        });

        await service.notifyAssignment({
            ...INPUT,
            previousResponsibleId: null,
        });

        expect(systemAdd).toHaveBeenCalledTimes(1);
        expect(messageTo(systemAdd, 465)).toContain('Вам назначена заявка');
    });

    it('сбой отправки не бросает — уходит в предупреждения', async () => {
        const { bitrix, systemAdd } = makeBitrix();
        systemAdd.mockRejectedValue(new Error('portal down'));
        const service = new LeadToWorkNotifyService(bitrix as never);

        const warnings = await service.notifyAssignment(INPUT);

        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toContain('portal down');
    });
});
