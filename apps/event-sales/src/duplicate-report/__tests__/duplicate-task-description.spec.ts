import { DUPLICATE_RECIPIENT_ROLE } from '../constants/duplicate-report.const';
import { classifyClient } from '../lib/duplicate-classify';
import { actionText, joinRu, plural } from '../lib/duplicate-report-texts';
import {
    buildDuplicateTaskDescription,
    duplicateFileName,
    duplicateTaskTitle,
} from '../lib/duplicate-task-description';
import {
    ClassifiedClient,
    DuplicateRecipientReport,
    DuplicateReportPeriod,
} from '../types/duplicate-report.types';
import {
    CLASSIFY_OPTIONS,
    DAY,
    DOMAIN,
    makeClientInput,
    makeDeal,
    NAMES,
    NOW,
} from './fixtures/duplicate-report.fixture';

const PERIOD: DuplicateReportPeriod = {
    from: new Date(NOW - 7 * DAY),
    to: new Date(NOW),
    label: '28.09–04.10',
};

const joinClient = (
    id: number,
    title = `ООО «Клиент ${id}»`,
): ClassifiedClient =>
    classifyClient(
        makeClientInput(
            [
                makeDeal(id * 10, { companyId: id, stageOrder: 6 }),
                makeDeal(id * 10 + 1, { companyId: id, assignedById: 99 }),
            ],
            { title },
        ),
        CLASSIFY_OPTIONS,
    );

const decideClient = classifyClient(
    makeClientInput(
        [
            makeDeal(500, { companyId: 50, assignedById: 11, openTasks: 1 }),
            makeDeal(501, {
                companyId: 50,
                assignedById: 12,
                openTasks: 2,
                createdAt: NOW - DAY,
            }),
        ],
        { title: 'МКУ [ГО и ЧС]' },
    ),
    CLASSIFY_OPTIONS,
);

const report = (clients: ClassifiedClient[]): DuplicateRecipientReport => ({
    userId: 11,
    roles: [DUPLICATE_RECIPIENT_ROLE.head],
    clients,
});

const describeFor = (clients: ClassifiedClient[], fileAttached = true) =>
    buildDuplicateTaskDescription({
        domain: DOMAIN,
        period: PERIOD,
        report: report(clients),
        userNames: NAMES,
        fileAttached,
    });

describe('задача-отчёт по дублям: название и описание', () => {
    it('название и имя файла — с периодом недели', () => {
        expect(duplicateTaskTitle(PERIOD)).toBe(
            'Дубли сделок: отчёт за неделю 28.09–04.10',
        );
        expect(duplicateFileName(PERIOD)).toBe('Дубли сделок 28.09-04.10.xlsx');
        // С получателем; запрещённые в именах файлов символы — прочь.
        expect(duplicateFileName(PERIOD, 'Иван "Петров" / РОП')).toBe(
            'Дубли сделок 28.09-04.10 — Иван Петров РОП.xlsx',
        );
    });

    it('цифры отчёта, таблица со ссылками, основная жирным, «не работает»', () => {
        const text = describeFor([decideClient, joinClient(1)]);
        expect(text).toContain(
            'Клиентов — 2, открытых сделок у них — 4. Решить руководителю — 1, ' +
                'присоединить к основной — 1, новых за неделю — 1.',
        );
        expect(text).toContain('в отчёте клиенты ваших сотрудников');
        expect(text).toContain('[TABLE]');
        expect(text).toContain(
            `[URL=https://${DOMAIN}/crm/company/details/1/]ООО «Клиент 1»[/URL]`,
        );
        expect(text).toContain(
            `[B][URL=https://${DOMAIN}/crm/deal/details/10/]10[/URL][/B] Иван Петров`,
        );
        expect(text).toContain(
            `[URL=https://${DOMAIN}/crm/deal/details/11/]11[/URL] Пётр Уволенный (не работает)`,
        );
        expect(text).toContain('присоединить к 10');
        expect(text).toContain('решить руководителю');
    });

    it('квадратные скобки из названия клиента не ломают BB-код', () => {
        const text = describeFor([decideClient]);
        expect(text).toContain('МКУ (ГО и ЧС)');
        expect(text).not.toContain('[ГО и ЧС]');
        expect(text).toContain(' · новое');
    });

    it('предупреждает, что «Объединить» в Битриксе необратимо, и ведёт в «Работу клиента»', () => {
        const text = describeFor([joinClient(1)]);
        expect(text).toContain(
            '[B]Не нажимайте «Объединить» в Битриксе: эта кнопка сливает ' +
                'сделки-дубли в одну карточку и удаляет их — отменить нельзя.',
        );
        expect(text).toContain('в блоке «Работа клиента»');
        expect(text).not.toContain('Возможные пересечения');
    });

    it('разные ИНН — своя строка «проверить ИНН», до проверки не присоединять', () => {
        const innClient = classifyClient(
            makeClientInput([
                makeDeal(600, { companyId: 60, inn: '3666000001' }),
                makeDeal(601, { companyId: 60, inn: '3666000002' }),
            ]),
            CLASSIFY_OPTIONS,
        );
        const text = describeFor([innClient]);
        expect(text).toContain('[TD]проверить ИНН[/TD]');
        expect(text).toContain('До проверки не присоединяйте');
    });

    it('в таблице первые 10, остальные — в файле', () => {
        const clients = Array.from({ length: 12 }, (_, index) =>
            joinClient(index + 1),
        );
        const text = describeFor(clients);
        expect(text.match(/\[TR\]/g)).toHaveLength(11);
        expect(text).toContain('Первые 10 из 12');
        expect(text).toContain('Остальные 2 и подробности');
    });

    it('файл не приложился — описание просит обратиться к разработчику', () => {
        expect(describeFor([joinClient(1)], false)).toContain(
            'Файл Excel приложить не удалось — попросите разработчика',
        );
    });

    it('«что сделать»: решить — с именами работающих, присоединить — с номерами', () => {
        // Основная (больше открытых задач) — у Сидоровой, она первой.
        expect(actionText(decideClient, NAMES)).toContain(
            'работают Анна Сидорова и Иван Петров',
        );
        expect(actionText(joinClient(1), NAMES)).toBe(
            'Присоединить 11 к 10 (Иван Петров).',
        );
    });

    it('склонения и перечисления по-русски', () => {
        expect(plural(1, 'клиент', 'клиента', 'клиентов')).toBe('клиент');
        expect(plural(3, 'клиент', 'клиента', 'клиентов')).toBe('клиента');
        expect(plural(11, 'клиент', 'клиента', 'клиентов')).toBe('клиентов');
        expect(joinRu(['А', 'Б', 'В'])).toBe('А, Б и В');
    });
});
