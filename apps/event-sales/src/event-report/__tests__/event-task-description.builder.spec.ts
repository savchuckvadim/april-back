import {
    buildEventTaskDescription,
    EventTaskDescriptionSource,
    EVENT_TASK_DESCRIPTION_STYLE,
    TASK_DESCRIPTION_PHONE_LIMIT,
} from '../services/task/event-task-description.builder';

/**
 * DESCRIPTION задачи обзвона (todo2508 §13): ссылки на карточки + телефоны
 * всех доступных сущностей. Проверяем состав блоков, лимит на сущность,
 * схлопывание дублей и то, что пустых заголовков не бывает.
 */
const DOMAIN = 'portal.bitrix24.ru';

const source = (
    over: Partial<EventTaskDescriptionSource> = {},
): EventTaskDescriptionSource => ({
    domain: DOMAIN,
    company: null,
    lead: null,
    contacts: [],
    baseDeal: null,
    comment: '',
    ...over,
});

const phones = (values: string[], type = 'WORK'): unknown =>
    values.map(VALUE => ({ VALUE, VALUE_TYPE: type }));

describe('buildEventTaskDescription — состав блоков', () => {
    it('ссылки на компанию, основную сделку, контакт и заявку', () => {
        const text = buildEventTaskDescription(
            source({
                company: { ID: 12, TITLE: 'ООО «Ромашка»' } as never,
                baseDeal: { id: 34, title: 'Продажа СПС' },
                contacts: [
                    { ID: 56, NAME: 'Иван', LAST_NAME: 'Иванов' } as never,
                ],
                lead: { ID: 78, TITLE: 'Заявка с сайта' } as never,
            }),
        );

        expect(text).toContain('Карточки клиента');
        expect(text).toContain(
            `[URL=https://${DOMAIN}/crm/company/details/12/]Компания: ООО «Ромашка»[/URL]`,
        );
        expect(text).toContain(
            `[URL=https://${DOMAIN}/crm/deal/details/34/]Основная сделка: Продажа СПС[/URL]`,
        );
        expect(text).toContain(
            `[URL=https://${DOMAIN}/crm/contact/details/56/]Контакт: Иванов Иван[/URL]`,
        );
        expect(text).toContain(
            `[URL=https://${DOMAIN}/crm/lead/details/78/]Заявка: Заявка с сайта[/URL]`,
        );
    });

    it('телефоны группируются по сущностям и подписываются типом', () => {
        const text = buildEventTaskDescription(
            source({
                company: {
                    ID: 12,
                    TITLE: 'ООО «Ромашка»',
                    PHONE: phones(['+7 900 000-00-01']),
                } as never,
                contacts: [
                    {
                        ID: 56,
                        NAME: 'Иван',
                        LAST_NAME: 'Иванов',
                        PHONE: [{ VALUE: '+7 900 000-00-02', TYPE: 'MOBILE' }],
                    } as never,
                ],
            }),
        );

        expect(text).toContain('Телефоны');
        expect(text).toContain('Компания: ООО «Ромашка»');
        expect(text).toContain('+7 900 000-00-01');
        expect(text).toContain('(Рабочий)');
        expect(text).toContain('Контакт: Иванов Иван');
        expect(text).toContain('+7 900 000-00-02');
        expect(text).toContain('(Мобильный)');
    });

    it('телефоны лида читаются, хотя интерфейс объявляет их строками', () => {
        const text = buildEventTaskDescription(
            source({
                lead: {
                    ID: 78,
                    TITLE: 'Заявка',
                    PHONE: phones(['+7 900 000-11-11'], 'MOBILE'),
                } as never,
            }),
        );

        expect(text).toContain('+7 900 000-11-11');
    });

    it('блоки без данных не рендерятся — пустых заголовков нет', () => {
        const onlyComment = buildEventTaskDescription(
            source({ comment: 'Договорились созвониться в среду' }),
        );

        expect(onlyComment).not.toContain('Карточки клиента');
        expect(onlyComment).not.toContain('Телефоны');
        expect(onlyComment).toContain('Договорились созвониться в среду');
    });

    it('нет данных вовсе — пустая строка (DESCRIPTION не отправляется)', () => {
        expect(buildEventTaskDescription(source())).toBe('');
    });

    it('сущность без телефонов не даёт своей группы', () => {
        const text = buildEventTaskDescription(
            source({
                company: { ID: 12, TITLE: 'ООО «Ромашка»' } as never,
            }),
        );

        expect(text).toContain('Карточки клиента');
        expect(text).not.toContain(EVENT_TASK_DESCRIPTION_STYLE.icons.phones);
    });
});

describe('buildEventTaskDescription — телефоны', () => {
    it(`с одной сущности уходит не больше ${TASK_DESCRIPTION_PHONE_LIMIT} номеров`, () => {
        const many = Array.from(
            { length: TASK_DESCRIPTION_PHONE_LIMIT + 10 },
            (_, index) => `+7 900 000-00-${String(index).padStart(2, '0')}`,
        );

        const text = buildEventTaskDescription(
            source({
                company: {
                    ID: 12,
                    TITLE: 'Компания',
                    PHONE: phones(many),
                } as never,
            }),
        );

        const rendered = many.filter(phone => text.includes(phone));
        expect(rendered).toHaveLength(TASK_DESCRIPTION_PHONE_LIMIT);
        // Берутся ПОСЛЕДНИЕ: свежие номера лежат в конце мультиполя.
        expect(text).toContain(many[many.length - 1]);
        expect(text).not.toContain(many[0]);
    });

    it('один и тот же номер у разных сущностей рендерится один раз', () => {
        const text = buildEventTaskDescription(
            source({
                company: {
                    ID: 12,
                    TITLE: 'Компания',
                    PHONE: phones(['+7 (900) 000-00-01']),
                } as never,
                contacts: [
                    {
                        ID: 56,
                        NAME: 'Иван',
                        // Тот же номер в другом написании — дубль по цифрам.
                        PHONE: [{ VALUE: '89000000001', TYPE: 'MOBILE' }],
                    } as never,
                ],
            }),
        );

        expect(text).toContain('+7 (900) 000-00-01');
        expect(text).not.toContain('89000000001');
    });

    it('один и тот же контакт в отчёте и плане не двоится', () => {
        const contact = {
            ID: 56,
            NAME: 'Иван',
            LAST_NAME: 'Иванов',
            PHONE: [{ VALUE: '+7 900 000-00-02', TYPE: 'WORK' }],
        } as never;

        const text = buildEventTaskDescription(
            source({ contacts: [contact, contact] }),
        );

        expect(text.split('Контакт: Иванов Иван')).toHaveLength(3); // ссылка + группа телефонов
        expect(text.split('+7 900 000-00-02')).toHaveLength(2);
    });

    it('номер без типа рендерится без подписи', () => {
        const text = buildEventTaskDescription(
            source({
                company: {
                    ID: 12,
                    TITLE: 'Компания',
                    PHONE: ['+7 900 000-00-03'],
                } as never,
            }),
        );

        expect(text).toContain('+7 900 000-00-03');
        expect(text).not.toContain('()');
    });
});
