/**
 * Опубликованная база знаний «Отдел Продаж. Внедрение Апрель»
 * (Bitrix «База знаний 2.0» на портале вендора). Исходники статей —
 * `ai/tasks/kb-garant/articles/*.md`, дерево — `kb-structure.content.js`.
 *
 * Идентификаторы документов СВЕРЕНЫ со слепком последней выкладки
 * (`published.json`, 15.10.2026): для каждой статьи и корня markdown,
 * собранный `kb-structure.content.js` с этой картой ссылок, даёт ровно
 * тот хэш, что записан в слепке (37 статей + корень, 38 из 38). Порядок
 * НЕ совпадает с текущим порядком дерева: h12, h14, h13 добавлялись
 * позже и получили последние номера. Номера подтверждаются и ссылками
 * в `ai/tasks/2026-10-01-day-plan.md` (#21, #43, #55, #67, #69, #71, #73, #81).
 *
 * Документы пересоздали или добавили новые — проверить дерево с номерами:
 * `node ai/tasks/kb-garant/kb-structure.run.js --check`.
 */

export const KB_DOMAIN = 'garantservisvoronezh.bitrix24.ru';

export const KB_DOCS = {
    gm: { id: 13, title: 'Менеджеру: работа в «Звонках»' },
    m1: { id: 15, title: 'Где открыть «Звонки» и что на экране' },
    m2: { id: 17, title: 'Мои дела: список и три кнопки' },
    m3: { id: 19, title: 'Новая заявка: взять в работу или передать' },
    m4: { id: 21, title: 'Клиент обратился повторно' },
    m5: { id: 23, title: 'Отчёт о звонке: как заполнить' },
    m6: { id: 25, title: 'Следующий шаг: запланировать или перенести' },
    m7: { id: 27, title: 'Презентация: от договорённости до итогов' },
    m8: { id: 29, title: 'Звонки по решению: клиент думает' },
    m9: {
        id: 31,
        title: 'Продажа, отказ, «не наш клиент»: как закрыть работу',
    },
    m10: {
        id: 33,
        title: 'Холодный обзвон: откуда задачи и как их отрабатывать',
    },
    m11: { id: 35, title: 'Данные клиента: контакты, ИНН, история' },
    m12: { id: 37, title: 'Возможные пересечения: клиент уже есть в базе' },
    m13: { id: 39, title: 'Если отчёт не отправился' },
    m14: { id: 41, title: 'Мои показатели и разбор звонков' },
    gh: { id: 43, title: 'Руководителю' },
    h1: { id: 45, title: 'KPI-отчёт: как читать' },
    h2: { id: 47, title: 'Конверсии: где теряются клиенты' },
    h3: { id: 49, title: 'Финансы и горячие клиенты' },
    h4: { id: 51, title: 'Планы сотрудникам' },
    h5: { id: 53, title: 'AI-аналитика отдела: на кого смотреть и что делать' },
    h6: {
        id: 55,
        title: 'Сделка-дубль: присоединить к основной работе клиента',
    },
    h7: { id: 57, title: 'Передать клиентов сотрудника другому' },
    h8: { id: 59, title: 'Заявки: кто получает и что, если их не берут' },
    h9: { id: 61, title: 'Отказники возвращаются в работу' },
    h10: { id: 63, title: 'Забытые сделки' },
    h11: { id: 65, title: 'Поделиться отчётом по ссылке' },
    faq: { id: 67, title: 'Частые вопросы' },
    gs: { id: 69, title: 'Настройка портала' },
    s1: { id: 71, title: 'Хуки и умные сценарии' },
    s2: { id: 73, title: 'Бизнес-процессы: как настроить' },
    s3: { id: 75, title: 'Что можно включить и настроить' },
    s4: {
        id: 77,
        title: 'Страховки: что приложение делает само по расписанию',
    },
    s5: { id: 79, title: 'Что-то не сработало: как проверить' },
    h12: { id: 81, title: 'Режим руководителя в «Звонках»: дела сотрудников' },
    h14: { id: 83, title: 'Еженедельный отчёт по дублям сделок' },
    h13: {
        id: 85,
        title: 'Дубли и повторные заявки: как приложение их находит',
    },
} as const satisfies Record<string, { id: number; title: string }>;

export type KbDocKey = keyof typeof KB_DOCS;

export const KB_DOC_KEYS = Object.keys(KB_DOCS) as KbDocKey[];

/**
 * Документы, которые на портале пока ЗАГОТОВКИ «Статья готовится»
 * (в дереве `kb-structure.content.js` у них `about` + `bullets` вместо
 * текста). Полные тексты для большинства уже лежат в `articles/`
 * (plans, ai-analytics, request-distribution, reject-revive,
 * forgotten-deals, share-report, settings-guide, safety-nets) — после
 * подключения в дерево и выкладки ключ убирается отсюда.
 */
export const KB_STUB_DOC_KEYS: ReadonlySet<KbDocKey> = new Set<KbDocKey>([
    'h4',
    'h5',
    'h8',
    'h9',
    'h10',
    'h11',
    's3',
    's4',
    's5',
]);

export interface KbDocLink {
    key: KbDocKey;
    title: string;
    url: string;
    /** Статья опубликована целиком (false — на портале заготовка «готовится»). */
    ready: boolean;
}

export const kbDocUrl = (key: KbDocKey): string =>
    `https://${KB_DOMAIN}/note/document/${KB_DOCS[key].id}/`;

export const kbDocLink = (key: KbDocKey): KbDocLink => ({
    key,
    title: KB_DOCS[key].title,
    url: kbDocUrl(key),
    ready: !KB_STUB_DOC_KEYS.has(key),
});
