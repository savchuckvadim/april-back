/**
 * Наборы ключей для выборки AI-записей (ais) по домену и типу.
 *
 * Наборы объединяются по ИЛИ: запись попадает в выборку, если её
 * activity_id входит в activityIds, либо transcription_id — в transcriptionIds,
 * либо entity_id — в entityIds. Пустые и отсутствующие наборы не участвуют;
 * каждый набор режется порциями по 500 значений (один IN-список на запрос).
 */
export interface AiRecordKeys {
    /** activity_id — id дела Bitrix или ключ периода снапшота ('2026-09', '2026-W36'). */
    activityIds?: string[];
    /** transcription_id — id транскрипции звонка (десятичная строка). */
    transcriptionIds?: string[];
    /** entity_id — id CRM-сущности (сделка / лид). */
    entityIds?: number[];
    /** report_item_id — id элемента смарт-процесса «AI-анализ звонков», куда записан разбор. */
    reportItemIds?: string[];
}

export interface AiFindByKeysOptions {
    /**
     * На каждый ключ оставить только последнюю запись — с максимальным id
     * (актуальная версия разбора / снапшота, старые считаются superseded).
     */
    latestOnly?: boolean;
}

/** Колонка ais, по которой идёт выборка набора ключей. */
export type AiRecordKeyColumn =
    | 'activity_id'
    | 'transcription_id'
    | 'entity_id'
    | 'report_item_id';
