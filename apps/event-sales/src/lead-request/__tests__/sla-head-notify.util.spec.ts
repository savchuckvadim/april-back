import {
    notAcceptedHeadMessage,
    notifyHeads,
} from '../sla/sla-head-notify.util';

describe('sla-head-notify.util', () => {
    describe('notifyHeads', () => {
        it('сбой одного руководителя не отменяет остальных — он возвращается списком', async () => {
            const systemAdd = jest
                .fn()
                .mockResolvedValueOnce(true)
                .mockRejectedValueOnce(new Error('нет доступа'))
                .mockResolvedValueOnce(true);

            const failures = await notifyHeads(
                { imNotify: { systemAdd } },
                [11, 12, 13],
                'текст',
            );

            expect(systemAdd).toHaveBeenCalledTimes(3);
            expect(systemAdd).toHaveBeenLastCalledWith({
                USER_ID: 13,
                MESSAGE: 'текст',
            });
            expect(failures).toEqual([
                { headUserId: 12, error: 'нет доступа' },
            ]);
        });

        it('без руководителей — ни одного вызова', async () => {
            const systemAdd = jest.fn();

            expect(
                await notifyHeads({ imNotify: { systemAdd } }, [], 'текст'),
            ).toEqual([]);
            expect(systemAdd).not.toHaveBeenCalled();
        });
    });

    describe('notAcceptedHeadMessage', () => {
        const base = {
            domain: 'garant.bitrix24.ru',
            leadId: 42,
            minutes: 60,
        };

        it('имя непринявшего и ссылка на лид', () => {
            expect(
                notAcceptedHeadMessage({
                    ...base,
                    lead: { TITLE: 'Ромашка' },
                    responsible: 'Вадим Савчук',
                }),
            ).toBe(
                'Заявка «Ромашка» не принята сотрудником за 60 мин ' +
                    '(ответственный: Вадим Савчук) — передана другому. ' +
                    '[URL=https://garant.bitrix24.ru/crm/lead/details/42/]Открыть лид[/URL]',
            );
        });

        it('без названия и ответственного — «Лид N» и без скобок', () => {
            expect(
                notAcceptedHeadMessage({
                    ...base,
                    lead: {},
                    responsible: null,
                }),
            ).toBe(
                'Заявка «Лид 42» не принята сотрудником за 60 мин — передана другому. ' +
                    '[URL=https://garant.bitrix24.ru/crm/lead/details/42/]Открыть лид[/URL]',
            );
        });
    });
});
