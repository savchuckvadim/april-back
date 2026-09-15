/**
 * Нагрузка снапшота AI-резюме (`ai-analytics-brief`, зерно `portal-hash`,
 * ключ периода — `packHash`): что показали руководителю и во что обошёлся
 * вызов модели.
 *
 * Объявлена отдельным файлом по лимиту 300 строк и реэкспортируется из
 * `contracts/snapshot.types.ts` (тот же приём, что у `passport.types.ts`),
 * поэтому потребители импортируют её из публичного API библиотеки.
 *
 * Расход вызова живёт в НАГРУЗКЕ, а не в колонках `ais.tokens_count` /
 * `ais.price`: запись снапшота идёт общим стором приложения
 * (AiAnalyticsSnapshotStore.upsert), а он раскладывает по колонкам только
 * поля конверта. Имена полей сохраняют смысл колонок, чтобы перенос в
 * колонки (когда стор научится их писать) был механическим.
 *
 * Только форма данных: без DI, Bitrix и Prisma.
 */

/** Буллет резюме в снапшоте: `undefined` полей нет — нагрузка JSON-канонична. */
export interface BriefSnapshotBullet {
    text: string;
    /** Bitrix-id менеджера буллета; null — буллет про отдел. */
    managerId: string | null;
    /** Код типа звонка; null — буллет не про тип. */
    callType: string | null;
    /** Коды фактов пакета, на которых стоит буллет. */
    factRefs: string[];
}

/** Снапшот AI-резюме за период: текст, источник и расход вызова. */
export interface BriefSnapshot {
    /** Начало периода резюме 'YYYY-MM-DD' в TZ портала. */
    from: string;
    /** Конец периода резюме 'YYYY-MM-DD' в TZ портала. */
    to: string;
    /** sha256 пакета фактов — он же ключ периода и ключ кэша резюме. */
    packHash: string;
    headline: string;
    bullets: BriefSnapshotBullet[];
    /** Тон резюме (AI_BRIEF_TONES). */
    tone: string;
    /** Источник резюме (AI_BRIEF_SOURCES): 'llm' | 'template'. */
    source: string;
    /** Причина шаблона (AI_BRIEF_TEMPLATE_REASONS); null — ответ модели. */
    reason: string | null;
    promptVersion: string;
    /**
     * Токенов вызова модели (смысл колонки `ais.tokens_count`); null —
     * модель не вызывали (резюме собрано шаблоном без обращения к LLM).
     */
    tokensCount: number | null;
    /**
     * Стоимость вызова, ₽: `tokens / 1000 × llm_price_per_1k`; null —
     * модель не вызывали. Ноль означает «цена в реестре не задана»
     * (код `llm_price_per_1k` = 0) — тогда `estimated` = true.
     */
    price: number | null;
    /**
     * Токены и цена — оценка, а не факт: провайдер не вернул `usage`
     * (считали по длине текста) либо цена 1 000 токенов не задана.
     */
    estimated: boolean;
    /** Модель из ответа провайдера; null — не вернул или вызова не было. */
    model: string | null;
    /** Коды фактов пакета, ушедших в модель. */
    factCodes: string[];
    /** Коды фактов, не поместившихся в лимиты пакета. */
    droppedCodes: string[];
    /** Доля буллетов модели, прошедших факт-чек, %. */
    passRatePct: number;
    /** Менеджеры периметра резюме; пусто — весь ростер портала. */
    managerIds: string[];
}
