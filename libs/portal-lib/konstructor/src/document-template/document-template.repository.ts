import {
    DocumentTemplateKind,
    TemplateCandidate,
    TemplateCriteria,
} from './document-template.criteria';

/**
 * Строка в том минимуме, который нужен диагностике неоднозначности.
 *
 * Отдельный тип, а не `TemplateCandidate`: диагностике нужны ВСЕ строки с
 * `is_default`, без привязки к критериям конкретного запроса, и нужен
 * СЫРОЙ вид признаков-списков — по нему строится ключ группировки, а
 * разобранный список для этого не годится (он уже потерял отброшенные
 * неизвестные коды).
 */
export type TemplateDefaultRow = {
    kind: DocumentTemplateKind;
    id: string;
    portalId: bigint | null;
    agentId: bigint | null;
    contractType: string | null;
    clientTypes: string | null;
    supplyTypes: string | null;
};

/**
 * Выборка кандидатов для резолвера.
 *
 * Жёсткие условия (`is_active = true`, `is_archived = false`, а для договора
 * ещё и точное совпадение `contract_type`) накладываются В SQL — они не
 * ранжируются и не ослабляются. Признаки-списки (`client_types`,
 * `supply_types`) лежат JSON-ом в LongText, у Prisma нет операций по
 * массивам в строковой колонке, а сырой SQL в проекте запрещён — поэтому
 * они разбираются и сопоставляются в TypeScript уже после выборки
 * (fetch-then-rank). Это осознанный компромисс: на портальных объёмах
 * строк (единицы-десятки) пост-фильтр дешевле, чем денормализация.
 */
export abstract class DocumentTemplateRepository {
    /**
     * Кандидаты одним запросом: `portal_id IN (portalId, NULL)` и
     * `agent_id IN (agentId, NULL)`. Это эквивалентно последовательному
     * каскаду «портал+поставщик → портал → общий», потому что разряд
     * `portalExact` строго старше `agentExact` — но за один round-trip.
     */
    abstract findCandidates(
        kind: DocumentTemplateKind,
        criteria: TemplateCriteria,
    ): Promise<TemplateCandidate[]>;

    /**
     * Есть ли у портала ХОТЬ ОДИН активный шаблон этого вида.
     *
     * Нужно, чтобы различить две принципиально разные ситуации:
     *  - у портала шаблонов нет вовсе → законный откат на файл из storage
     *    (так работает сегодня, поведение сохраняем);
     *  - шаблоны есть, но под нужный тип договора нет → это пробел в
     *    настройке, который админ должен увидеть сразу, а не получить
     *    молча подменённый универсальный файл.
     */
    abstract hasAnyForPortal(
        kind: DocumentTemplateKind,
        portalId: bigint | null,
    ): Promise<boolean>;

    /**
     * Все активные строки с `is_default = true` — сырьё для диагностики.
     *
     * Группировка по (portal_id, agent_id, contract_type, client_types,
     * supply_types) делается В TypeScript, а не в SQL: признаки-списки
     * лежат JSON-ом в LongText, `groupBy` по их нормализованному
     * содержимому Prisma не умеет, а сырой SQL в проекте запрещён. На
     * объёмах справочника (единицы-десятки строк) это дешевле, чем
     * денормализация.
     *
     * `portalId = null` означает «по всем порталам», а НЕ «только общие»:
     * диагностика без аргумента смотрит справочник целиком. С переданным
     * id выборка сужается до `portal_id IN (portalId, NULL)` — общий
     * конфликтный ящик достаётся и этому порталу тоже, поэтому исключать
     * общие строки было бы неверно.
     */
    abstract findDefaultRows(
        portalId: bigint | null,
    ): Promise<TemplateDefaultRow[]>;

    /**
     * Виды документов, по которым у портала есть хотя бы одна СВОЯ
     * активная строка (`portal_id = portalId`). Остальные виды портал
     * берёт с общих шаблонов — это и есть «опора на общий».
     */
    abstract findKindsWithOwnRows(
        portalId: bigint,
    ): Promise<DocumentTemplateKind[]>;
}
