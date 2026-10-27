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

/*
 * Перехват клиента холодным обзвоном (27.10.2026). Прежний ответственный
 * видел только «заявка передана другому сотруднику» и не понимал, что
 * потерял клиента, сделку и прогресс по ней — это и привело к вопросу
 * клиента «сотрудники работу друг другу не передавали».
 */
describe('LeadToWorkNotifyService — перехват холодным обзвоном', () => {
    const TAKEOVER = {
        ...INPUT,
        takeover: {
            dealId: 31545,
            clientTitle: 'ОГБУЗ «Старооскольская окружная детская больница»',
            previousStageName: 'Переговоры',
        },
    };

    it('прежнему — клиент, сделка, стадия и что делать при ошибке', async () => {
        const { bitrix, systemAdd } = makeBitrix();
        const service = new LeadToWorkNotifyService(bitrix as never, {
            465: 'Яна Сова',
        });

        await service.notifyAssignment(TAKEOVER);

        const message = messageTo(systemAdd, 447) ?? '';
        expect(message).toContain(
            'По клиенту ОГБУЗ «Старооскольская окружная детская больница» запущен холодный обзвон',
        );
        expect(message).toContain('работа перешла к Яна Сова');
        expect(message).toContain('была на стадии «Переговоры»');
        expect(message).toContain('вернулась в «Холодные»');
        expect(message).toContain('Компания и контакты теперь за новым');
        expect(message).toContain('/crm/deal/details/31545/');
        expect(message).toContain('напишите руководителю');
    });

    it('новому — что взял клиента с историей, а не пустую заявку', async () => {
        const { bitrix, systemAdd } = makeBitrix();
        const service = new LeadToWorkNotifyService(bitrix as never, {
            447: 'Елена Мережкина',
            465: 'Яна Сова',
        });

        await service.notifyAssignment(TAKEOVER);

        const message = messageTo(systemAdd, 465) ?? '';
        expect(message).toContain('Вам передан клиент ОГБУЗ');
        expect(message).toContain('Раньше по нему работал(а) Елена Мережкина');
        expect(message).toContain('сделка была на стадии «Переговоры»');
        expect(message).toContain('/crm/deal/details/31545/');
        expect(message).toContain('Подтвердите принятие');
    });

    // Стадию не определили — текст короче, но про сделку сказать обязаны.
    it('без названия стадии — сообщение всё равно про сделку', async () => {
        const { bitrix, systemAdd } = makeBitrix();
        const service = new LeadToWorkNotifyService(bitrix as never, {
            465: 'Яна Сова',
        });

        await service.notifyAssignment({
            ...TAKEOVER,
            takeover: { ...TAKEOVER.takeover, previousStageName: null },
        });

        const message = messageTo(systemAdd, 447) ?? '';
        expect(message).toContain('вернулась в «Холодные»');
        expect(message).not.toContain('на стадии');
    });

    // Перехвата нет — тексты назначения заявки не меняются.
    it('обычное назначение — прежние тексты', async () => {
        const { bitrix, systemAdd } = makeBitrix();
        const service = new LeadToWorkNotifyService(bitrix as never, {
            465: 'Иван Петров',
        });

        await service.notifyAssignment({ ...INPUT, takeover: null });

        expect(messageTo(systemAdd, 447)).toContain(
            'передана другому сотруднику (Иван Петров).',
        );
        expect(messageTo(systemAdd, 465)).toContain('Вам назначена заявка');
    });
});
