/**
 * Человекочитаемый итог коммуникации для timeline Bitrix (сделка + компания).
 * Зеркало легаси-python src/services/event/EventTimeline.py — формулировки
 * склоняются по типу события таблицей, спонтанные действия выводятся одной
 * группой «⚡ Спонтанно: …» без пары «запланирован и сразу отработан».
 */

const COMPLETED: Readonly<Record<string, string>> = Object.freeze({
    edu: '🎓 Проведено обучение',
    edu_first: '🎓 Проведено первичное обучение',
    presentation: '🖥️ Проведена презентация',
    signal: '🛎️ Отработан сервисный сигнал',
    fail_work: '🛡️ Обработана угроза отказа',
});

const PLANNED: Readonly<Record<string, string>> = Object.freeze({
    edu: '🎓 Запланировано обучение',
    edu_first: '🎓 Запланировано первичное обучение',
    presentation: '🖥️ Запланирована презентация',
    signal: '🛎️ Запланирован сервисный сигнал',
    fail_work: '🛡️ Запланирована обработка угрозы отказа',
});

/** 'dd.MM.yyyy HH:mm:ss' или ISO -> 'dd.MM.yyyy HH:mm'. */
export const formatReadableDate = (raw: string | undefined | null): string => {
    if (!raw) return '';
    const value = String(raw);
    if (value.includes('T')) {
        const day = `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`;
        return `${day} ${value.slice(11, 16)}`.trim();
    }
    return value.slice(0, 16).trim();
};

export const completedPhrase = (typeCode: string, name: string): string =>
    COMPLETED[typeCode] ?? `📞 Выполнен звонок: ${name}`;

export const plannedPhrase = (
    typeCode: string,
    name: string,
    deadline: string | undefined,
): string => {
    const phrase = PLANNED[typeCode] ?? `📞 Запланирован звонок: ${name}`;
    const date = formatReadableDate(deadline);
    return date ? `${phrase} — 📅 ${date}` : phrase;
};

export const poundPhrase = (
    name: string,
    deadline: string | undefined,
): string => {
    const date = formatReadableDate(deadline);
    return `↪️ Перенос: ${name}` + (date ? ` → 📅 ${date}` : '');
};

export const failedPhrase = (name: string): string =>
    `❌ Не состоялся: ${name}`;

/** Итоговый текст для crm.timeline.comment.add или null, если писать нечего. */
export const buildTimelineComment = (
    when: string,
    lines: string[],
    spontaneousNames: string[],
    comment?: string,
): string | null => {
    if (!lines.length && !spontaneousNames.length) return null;
    const parts = [`🗂 Итог коммуникации — ${when}`, ''];
    parts.push(...lines);
    if (spontaneousNames.length) {
        // в столбик, а не через запятую — иначе в карточке сливаются в строку
        parts.push('⚡ Спонтанно:');
        parts.push(...spontaneousNames.map(name => `— ${name}`));
    }
    if (comment) {
        parts.push('', '💬 Комментарий менеджера:', comment);
    }
    return parts.join('\n');
};
