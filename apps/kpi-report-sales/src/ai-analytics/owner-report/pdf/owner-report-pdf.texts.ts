import type { OwnerReportTone } from '@lib/sales-ai-analytics';

/**
 * Подписи PDF отчёта собственнику: разделы, колонки, подвал. Сам текст
 * отчёта приходит из снапшота готовыми фразами. Без стрелок: в шрифте PDF
 * их нет (рисовался апостроф — PDF 07.11.2026).
 */
export const OWNER_PDF_TEXT = {
    sections: {
        attention: 'На что обратить внимание',
        summary: 'Коротко для собственника',
        glossary: 'Как читать отчёт',
        overview: 'Общая картина',
        outcomes: 'Чем заканчиваются разговоры',
        typeGroups: 'По видам разговоров',
        weeks: 'По неделям',
        funnel: 'Воронка и конверсии',
        crmFunnel: 'Воронка по CRM',
        presentations: 'Презентации',
        presentationRows: 'Что видно в показах',
        presentationSections: 'Оценки разделов показа',
        leaks: 'Где теряем продажи',
        management: 'Как управляется отдел',
        objections: 'Возражения и где клиенты остывают',
        issues: 'Сбои не по вине разговора',
        metrics: 'Что держать под контролем',
        managers: 'Сотрудники',
        managersResult: 'Результат',
        managersTalk: 'Как ведут разговор',
        managerCards: 'Выводы по сотрудникам',
        methodology: 'Как считали и что не учтено',
    },
    attentionKind: {
        bad: 'Утечка',
        warn: 'Управление',
        good: 'Хорошо',
        neutral: 'Данные',
    } satisfies Record<OwnerReportTone, string>,
    attentionAction: 'Что сделать: ',
    columns: {
        outcome: 'Исход',
        calls: 'Разговоров',
        share: 'Доля',
        typeGroup: 'Вид разговора',
        advanced: 'Шаг вперёд',
        callbackDated: 'Перезвон с датой',
        postponed: 'Отложено',
        refused: 'Отказ',
        noContact: 'Без контакта',
        unmarked: 'Не размечено',
        stage: 'Этап',
        undecided: 'Без решения',
        invoiceAgreed: 'Согласие на счёт',
        indicator: 'Показатель',
        previous: 'Прошлый период',
        week: 'Неделя',
        cold: 'Холодных',
        coldAdvanced: 'Холодные: шаг вперёд',
        contacted: 'С ЛПР',
        contactedAdvanced: 'С ЛПР: шаг вперёд',
        note: 'Пометка',
        sign: 'Признак',
        verdict: 'Вердикт',
        detail: 'Что видно в разговорах',
        topic: 'Возражение',
        handled: 'Отработано',
        advancedAfter: 'Шаг вперёд после',
        issue: 'Сбой',
        metric: 'Показатель',
        value: 'За период',
        lastWeek: 'Последняя неделя',
        why: 'Почему важно',
        ifIgnored: 'Если не заниматься',
        employee: 'Сотрудник',
    },
    leak: {
        scale: 'Масштаб',
        money: 'Деньги',
        noMoney: 'не считаются',
        nature: 'Природа',
        action: 'Что сделать',
    },
    manager: {
        strengths: 'Сильные стороны',
        risks: 'Риски',
        conclusion: 'Вывод для собственника',
    },
    /**
     * Таблицы сотрудников в PDF — две, чтобы ячейки «12 из 13 (92 %)»
     * помещались в строку: результат и то, как ведут разговор.
     */
    managerResultColumns: [
        ['calls', 'Разговоров (доля)'],
        ['coldAdvanced', 'Холодные: шаг вперёд'],
        ['contactedAdvanced', 'С ЛПР: шаг вперёд'],
        ['advancedShareOfTeam', 'Доля в шагах вперёд отдела'],
        ['upsellShareOfTeam', 'Доля в допродажах'],
        ['crm', 'CRM: сделки / счета / показы'],
    ],
    managerTalkColumns: [
        ['needsFound', 'Выяснил задачи'],
        ['presentationByNeeds', 'Показ под задачи'],
        ['closingAttempted', 'Попытка закрытия'],
        ['nextStepDated', 'Шаг с датой'],
        ['objectionsHandled', 'Отработал возражения'],
        ['postponedWithDate', 'Отложено с датой'],
        ['conflict', 'Конфликтный тон'],
        ['evasive', 'Ушёл от ответа'],
    ],
    funnel: {
        afterOfferTitle: 'Где застревают деньги',
    },
    presentations: {
        comparisonTitle: 'Что работает',
    },
    footer: {
        brand: 'April · AI-аналитика отдела продаж',
    },
    writtenBy: {
        model: 'выводы написаны моделью по посчитанным фактам',
        template: 'текст собран по посчитанным фактам',
    },
    generatedAt: (date: string) => `собран ${date}`,
    glossaryHint:
        'Термины объяснены в разделе «Как читать отчёт» после краткого резюме.',
} as const;
