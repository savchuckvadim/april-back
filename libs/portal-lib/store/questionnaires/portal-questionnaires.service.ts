import { createHash } from 'node:crypto';
import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from '@lib/core/redis/redis.service';
import { PortalRepository } from '../portal.repository';
import {
    PortalQuestionnaireConditionInput,
    PortalQuestionnaireItemCheckInput,
    PortalQuestionnaireItemInput,
    PortalQuestionnaireItemRecord,
    PortalQuestionnaireItemSyncInput,
    PortalQuestionnaireOptionCreateInput,
    PortalQuestionnaireOptionInput,
    PortalQuestionnaireOptionRenameInput,
    PortalQuestionnaireRecord,
    PortalQuestionnaireSaveInput,
    PortalQuestionnaireSmartRecord,
    PortalQuestionnairesRepository,
} from './portal-questionnaires.repository';
import {
    findEventTypesBySmartKind,
    findSmartBindingByTypeGroup,
} from '@lib/portal-lib/pbx/event-type-registry';
import {
    QuestionnaireFieldMirrorOption,
    findQuestionnaireMirrorOption,
    readQuestionnaireFieldMirror,
    writeQuestionnaireFieldMirror,
} from './questionnaire-field-mirror';
import {
    EnumQuestionnaireChannel,
    EnumQuestionnaireConditionKind,
    EnumQuestionnaireControl,
    EnumQuestionnaireFieldSource,
    EnumQuestionnaireFieldStatus,
    EnumQuestionnairePersist,
    EnumQuestionnairePlace,
    EnumQuestionnairePresentation,
    EnumQuestionnairePurpose,
    EnumQuestionnaireTargetEntity,
    EnumQuestionnaireTargetMode,
    getQuestionnaireDtoPath,
    getQuestionnaireSchema,
    isQuestionnaireControlAllowed,
    isQuestionnaireReachableForSmartKind,
    isQuestionnaireValuelessCondition,
    QUESTIONNAIRE_AUTO_FIELD_SOURCES,
    QUESTIONNAIRE_CATALOG_CONTRACT,
    QUESTIONNAIRE_CHANNELS,
    QUESTIONNAIRE_CONDITION_KINDS,
    QUESTIONNAIRE_CONDITION_VALUES,
    QUESTIONNAIRE_CONTROLS,
    QUESTIONNAIRE_FIELD_SOURCES,
    QUESTIONNAIRE_FIELD_STATUSES,
    QUESTIONNAIRE_PERSISTS,
    QUESTIONNAIRE_PLACES,
    QUESTIONNAIRE_PRESENTATIONS,
    QUESTIONNAIRE_PURPOSES,
    QUESTIONNAIRE_TARGET_ENTITIES,
    QUESTIONNAIRE_TARGET_MODES,
    QuestionnaireCatalog,
    QuestionnaireCatalogCondition,
    QuestionnaireCatalogEntry,
    QuestionnaireCatalogItem,
    QuestionnaireCatalogSmart,
    QuestionnaireCatalogVersion,
    QuestionnaireSchemaPayload,
} from './portal-questionnaires.schema';

/**
 * Смарты портала, разложенные по `smarts.id`. Собираются ОДНОЙ выборкой
 * на сохранение и на компиляцию — ходить в БД за каждым вопросом нельзя:
 * компиляция лежит на горячем пути фрейма.
 */
type PortalSmartsById = Map<number, PortalQuestionnaireSmartRecord>;

/** Что нужно вопросу сверх него самого, чтобы проверить его на сохранении. */
interface QuestionnaireItemContext {
    /** Условия показа анкеты — уже проверенные реестром. */
    conditions: PortalQuestionnaireConditionInput[];
    /** Смарты портала: без них адрес смарт-носителя не проверить. */
    smarts: PortalSmartsById;
}

/** Скомпилированный каталог кэшируется коротко — он на горячем пути фрейма. */
const CACHE_TTL_SECONDS = 300;

/** Вариант справочника, как его прислала админка. */
export interface PortalQuestionnaireOptionDraft {
    code: string;
    title: string;
    bitrixId?: number | null;
    xmlId?: string | null;
    sort?: number;
    isDefault?: boolean;
    isActive?: boolean;
}

/** Вопрос, как его прислала админка (до проверки реестром). */
export interface PortalQuestionnaireItemDraft {
    code: string;
    title: string;
    placeholder?: string | null;
    hint?: string | null;
    groupTitle?: string | null;
    sort?: number;
    control: string;
    isMultiple?: boolean;
    isRequired?: boolean;
    requireChange?: boolean;
    staleAfterDays?: number | null;
    channel?: string;
    targetMode?: string;
    targetEntity?: string | null;
    dtoPath?: string | null;
    isNative?: boolean;
    fieldName?: string | null;
    fieldBitrixId?: number | null;
    fieldXmlId?: string | null;
    fieldCode?: string | null;
    fieldType?: string | null;
    /**
     * Носитель, из которого поле выбрано в пикере. В БД не уезжает —
     * проверяется на сохранении: только он связывает поле с сущностью,
     * куда фрейм будет писать ответ.
     */
    fieldSource?: string;
    /**
     * Строка `smarts` НАШЕЙ БД, если поле выбрано у смарта. В отличие от
     * `fieldSource` — СОХРАНЯЕТСЯ: это постоянный адрес носителя, по
     * нему компиляция узнаёт поток, а сверка привязок — где искать поле.
     */
    smartId?: number | null;
    fieldStatus?: string;
    meta?: Record<string, unknown> | null;
    isActive?: boolean;
    options?: PortalQuestionnaireOptionDraft[];
}

/** Подпись варианта, которую владелец согласился подтянуть из Битрикса. */
export interface PortalQuestionnaireOptionRenameDraft {
    optionId: string;
    title: string;
}

/**
 * Вариант Битрикса, которого у нас нет и который владелец решил завести.
 * `bitrixId` обязателен: именно он уходит в `crm.*.update`, вариант без
 * него записать нечем.
 */
export interface PortalQuestionnaireOptionAddDraft {
    bitrixId: number;
    title: string;
    xmlId?: string | null;
    sort?: number;
}

/**
 * Что владелец согласился применить по одному вопросу разбора
 * расхождений: подпись вопроса, подписи вариантов, новые варианты.
 */
export interface PortalQuestionnaireItemSyncDraft {
    itemId: string;
    /** Пусто — подпись вопроса оставляем авторскую. */
    title?: string | null;
    renameOptions?: PortalQuestionnaireOptionRenameDraft[];
    addOptions?: PortalQuestionnaireOptionAddDraft[];
}

/** Сколько чего применилось — для отчёта админке. */
export interface PortalQuestionnaireFieldSyncOutcome {
    questionnaire: PortalQuestionnaireRecord;
    /** Вопросов, которым подтянули подпись. */
    titles: number;
    renamedOptions: number;
    addedOptions: number;
}

/** Условие показа, как его прислала админка. */
export interface PortalQuestionnaireConditionDraft {
    kind: string;
    values?: string[];
}

/** Анкета целиком, как её прислала админка. */
export interface PortalQuestionnaireDraft {
    id?: string | null;
    appCode: string;
    code: string;
    title: string;
    hint?: string | null;
    purpose: string;
    presentation?: string;
    place?: string | null;
    persist?: string;
    conditions: PortalQuestionnaireConditionDraft[];
    configKey?: string | null;
    legacyChecklistId?: string | null;
    isActive?: boolean;
    sort?: number;
    updatedBy?: number | null;
    items: PortalQuestionnaireItemDraft[];
}

/**
 * Портальный каталог анкет.
 *
 * Две стороны у сервиса:
 *  - ЧТЕНИЕ (`resolve`, `getVersion`) — горячий путь фрейма: активные
 *    анкеты домена компилируются в готовый к исполнению каталог и кладутся
 *    в Redis на 5 минут. Redis недоступен — работаем без кэша: каталог
 *    важнее скорости, ронять экран менеджера из-за кэша нельзя;
 *  - ЗАПИСЬ (`save`) — админка: ВСЯ проверка допустимости значений живёт
 *    здесь, на сохранении. Проверять при рендере поздно: портал заведёт
 *    `control: 'file'`, менеджер увидит пустое место, и никто не поймёт
 *    почему.
 *
 * Компиляция никогда не отдаёт фрейму неисполнимый пункт: сломанная
 * привязка, неизвестный контрол, множественное значение — всё это
 * ВЫБРАСЫВАЕТСЯ. Пункт, который нельзя записать, не должен ещё и
 * блокировать отправку отчёта.
 */
@Injectable()
export class PortalQuestionnairesService {
    private readonly logger = new Logger(PortalQuestionnairesService.name);
    private readonly redis: Redis;

    constructor(
        private readonly repository: PortalQuestionnairesRepository,
        private readonly portalRepository: PortalRepository,
        redisService: RedisService,
    ) {
        this.redis = redisService.getClient();
    }

    /** Реестр допустимых значений для админки (`GET /schema`). */
    getSchema(): QuestionnaireSchemaPayload {
        return getQuestionnaireSchema();
    }

    /** Готовый к исполнению каталог приложения на домене (с кэшем). */
    async resolve(
        domain: string,
        appCode: string,
    ): Promise<QuestionnaireCatalog> {
        const cached = await this.readCache(domain, appCode);
        if (cached) return cached;

        const records = await this.repository.findActiveByDomain(
            domain,
            appCode,
        );
        const catalog = this.compile(
            records,
            await this.loadSmartsForRecords(records),
        );
        await this.writeCache(domain, appCode, catalog);
        return catalog;
    }

    /**
     * Смарты порталов, чьи анкеты содержат вопросы канала `smart`. Если
     * таких вопросов нет — в БД не ходим вовсе: это горячий путь фрейма,
     * и лишний запрос на каждом промахе кэша ничем не оправдан.
     */
    private async loadSmartsForRecords(
        records: PortalQuestionnaireRecord[],
    ): Promise<PortalSmartsById> {
        const portalIds = new Set<number>();
        for (const record of records) {
            const needsSmarts = record.items.some(
                item =>
                    item.isActive &&
                    (item.channel as EnumQuestionnaireChannel) ===
                        EnumQuestionnaireChannel.smart,
            );
            if (needsSmarts) portalIds.add(record.portalId);
        }
        return this.loadPortalSmarts([...portalIds]);
    }

    /** Смарты перечисленных порталов одной картой по `smarts.id`. */
    private async loadPortalSmarts(
        portalIds: number[],
    ): Promise<PortalSmartsById> {
        const smarts: PortalSmartsById = new Map();
        for (const portalId of portalIds) {
            const rows = await this.repository.findPortalSmarts(portalId);
            for (const row of rows) smarts.set(row.id, row);
        }
        return smarts;
    }

    /**
     * «Менялся ли каталог» без самого состава: фрейм держит свою версию и
     * дёргает полный каталог, только когда хэш разошёлся.
     */
    async getVersion(
        domain: string,
        appCode: string,
    ): Promise<QuestionnaireCatalogVersion> {
        const { version, hash } = await this.resolve(domain, appCode);
        return { version, hash };
    }

    /** Список анкет портала для админки — вместе с выключенными. */
    async listByPortal(
        portalId: number,
        appCode?: string,
    ): Promise<PortalQuestionnaireRecord[]> {
        return this.repository.findByPortalId(portalId, appCode);
    }

    /** Одна анкета целиком; нет такой — 404. */
    async getById(id: string): Promise<PortalQuestionnaireRecord> {
        const record = await this.repository.findById(id);
        if (!record) {
            throw new NotFoundException(`Анкета ${id} не найдена`);
        }
        return record;
    }

    /**
     * Сохранение из админки: значения проверяются по реестру, состав
     * задаётся целиком одной транзакцией (лишний пункт гасится, а не
     * удаляется), версия анкеты растёт, кэш домена сбрасывается.
     */
    async save(
        portalId: number,
        draft: PortalQuestionnaireDraft,
    ): Promise<PortalQuestionnaireRecord> {
        const domain = await this.requireDomain(portalId);
        // Смарты портала нужны только вопросам канала `smart`: за ними
        // ходим, лишь когда такой вопрос в теле действительно есть.
        const needsSmarts = (draft.items ?? []).some(
            item => item.channel === EnumQuestionnaireChannel.smart,
        );
        const smarts = needsSmarts
            ? await this.loadPortalSmarts([portalId])
            : (new Map() as PortalSmartsById);
        const input = this.buildSaveInput(portalId, domain, draft, smarts);
        const record = await this.repository.save(input);
        await this.dropCache(domain, record.appCode);
        this.logger.log(
            `Анкета ${record.appCode}/${record.code} портала ${portalId} ` +
                `(${domain}) сохранена: версия ${record.version}, ` +
                `пунктов ${record.items.length}`,
        );
        return record;
    }

    /** Удаление анкеты целиком (пункты и варианты уходят каскадом). */
    async remove(id: string): Promise<void> {
        const record = await this.getById(id);
        await this.repository.remove(id);
        await this.dropCache(record.domain, record.appCode);
        this.logger.log(
            `Анкета ${record.appCode}/${record.code} портала ` +
                `${record.portalId} (${record.domain}) удалена`,
        );
    }

    /**
     * Результат проверки привязок («Проверить привязки» в админке).
     * Пункт со статусом кроме `ok` перестаёт попадать в каталог канала
     * `crm` — поэтому кэш сбрасываем сразу.
     */
    async setFieldStatuses(
        id: string,
        statuses: { itemId: string; status: string }[],
    ): Promise<PortalQuestionnaireRecord> {
        const record = await this.getById(id);
        const checkedAt = new Date();
        for (const entry of statuses) {
            const item = record.items.find(row => row.id === entry.itemId);
            if (!item) {
                throw new BadRequestException(
                    `Пункт ${entry.itemId} не принадлежит анкете ${id}`,
                );
            }
            const status = this.requireOneOf(
                entry.status,
                QUESTIONNAIRE_FIELD_STATUSES,
                `Статус привязки пункта ${item.code}`,
            );
            await this.repository.setItemFieldStatus(
                item.id,
                status,
                checkedAt,
            );
        }
        await this.dropCache(record.domain, record.appCode);
        return this.getById(id);
    }

    /**
     * Применение итогов сверки с живым Битриксом («Проверить привязки»).
     *
     * Сверку делает админ-слой (ему доступен Битрикс), сюда приходит уже
     * готовый результат. Здесь — принадлежность: вопрос обязан быть из
     * ЭТОЙ анкеты, вариант — из этого вопроса. Без проверки чужой itemId
     * из тела запроса погасил бы вариант в анкете соседнего портала.
     *
     * Кэш домена сбрасывается всегда: статус кроме `ok` убирает вопрос из
     * каталога канала `crm`, и фрейм должен увидеть это сразу.
     */
    async applyFieldCheck(
        id: string,
        results: PortalQuestionnaireItemCheckInput[],
    ): Promise<PortalQuestionnaireRecord> {
        const record = await this.getById(id);
        for (const result of results) {
            const item = record.items.find(row => row.id === result.itemId);
            if (!item) {
                throw new BadRequestException(
                    `Вопрос ${result.itemId} не принадлежит анкете ${id}`,
                );
            }
            if (result.status !== null) {
                this.requireOneOf(
                    result.status,
                    QUESTIONNAIRE_FIELD_STATUSES,
                    `Статус привязки вопроса ${item.code}`,
                );
            }
            for (const option of result.options) {
                if (!item.options.some(row => row.id === option.optionId)) {
                    throw new BadRequestException(
                        `Вариант ${option.optionId} не принадлежит вопросу ` +
                            `${item.code}`,
                    );
                }
            }
        }

        await this.repository.applyFieldCheck(results);
        await this.dropCache(record.domain, record.appCode);
        this.logger.log(
            `Привязки анкеты ${record.appCode}/${record.code} портала ` +
                `${record.portalId} (${record.domain}) проверены: ` +
                `вопросов ${results.length}`,
        );
        return this.getById(id);
    }

    /**
     * Применение расхождений, ВЫБРАННЫХ владельцем («Подтянуть из
     * Битрикса»).
     *
     * Почему по кнопке, а не сверкой: подпись вопроса и подписи вариантов
     * владелец правит под себя («Дата решения» в Битриксе — «Когда клиент
     * примет решение?» в анкете), и затирать их автоматически нельзя.
     * Сверка правит только адрес записи — `bitrixId` и гашение
     * исчезнувшего.
     *
     * Здесь же — ПРИНАДЛЕЖНОСТЬ: вопрос обязан быть из ЭТОЙ анкеты,
     * вариант — из этого вопроса. Без проверки чужой id из тела запроса
     * переписал бы вариант в анкете соседнего портала.
     */
    async applyFieldSync(
        id: string,
        drafts: PortalQuestionnaireItemSyncDraft[],
    ): Promise<PortalQuestionnaireFieldSyncOutcome> {
        const record = await this.getById(id);
        const inputs: PortalQuestionnaireItemSyncInput[] = [];
        let titles = 0;
        let renamedOptions = 0;
        let addedOptions = 0;

        for (const draft of drafts) {
            const item = record.items.find(row => row.id === draft.itemId);
            if (!item) {
                throw new BadRequestException(
                    `Вопрос ${draft.itemId} не принадлежит анкете ${id}`,
                );
            }
            const where = `Вопрос «${item.code}»`;

            const title = this.optionalText(draft.title);
            const renames = (draft.renameOptions ?? []).map(option => {
                if (!item.options.some(row => row.id === option.optionId)) {
                    throw new BadRequestException(
                        `Вариант ${option.optionId} не принадлежит вопросу ` +
                            `${item.code}`,
                    );
                }
                return {
                    optionId: option.optionId,
                    title: this.requireText(
                        option.title,
                        `${where}: подпись варианта`,
                    ),
                };
            });
            const newOptions = this.buildSyncOptions(
                item,
                draft.addOptions ?? [],
                where,
            );

            if (
                title === null &&
                renames.length === 0 &&
                newOptions.length === 0
            ) {
                continue;
            }
            titles += title === null ? 0 : 1;
            renamedOptions += renames.length;
            addedOptions += newOptions.length;
            const meta = this.acceptedMeta(item, title, renames, newOptions);
            inputs.push({
                itemId: item.id,
                ...(title === null ? {} : { title }),
                renamedOptions: renames,
                newOptions,
                ...(meta === null ? {} : { meta }),
            });
        }

        if (inputs.length === 0) {
            throw new BadRequestException(
                `Анкета ${id}: не выбрано ни одного расхождения — ` +
                    'применять нечего',
            );
        }

        await this.repository.applyFieldSync(id, inputs);
        await this.dropCache(record.domain, record.appCode);
        this.logger.log(
            `Расхождения анкеты ${record.appCode}/${record.code} портала ` +
                `${record.portalId} (${record.domain}) применены: ` +
                `подписей вопросов ${titles}, подписей вариантов ` +
                `${renamedOptions}, новых вариантов ${addedOptions}`,
        );
        return {
            questionnaire: await this.getById(id),
            titles,
            renamedOptions,
            addedOptions,
        };
    }

    /**
     * `meta` вопроса с обновлённым слепком ПРИНЯТОГО; `null` — слепка нет,
     * обновлять нечего (его посеет ближайшая сверка).
     *
     * Подтянутое владельцем становится принятым — и ровно оно, строка за
     * строкой. Записать сюда живое состояние целиком было нельзя: владелец
     * мог взять один новый вариант списка и осознанно оставить свою
     * формулировку вопроса — «принять» её за него значило бы погасить
     * настоящее расхождение, которого он не принимал.
     */
    private acceptedMeta(
        item: PortalQuestionnaireItemRecord,
        title: string | null,
        renames: PortalQuestionnaireOptionRenameInput[],
        newOptions: PortalQuestionnaireOptionCreateInput[],
    ): Record<string, unknown> | null {
        const mirror = readQuestionnaireFieldMirror(item.meta);
        // Принятого ещё нет — берём за основу последнее прочитанное: разбор,
        // который владелец сейчас применяет, собран ровно по нему.
        const base = mirror.accepted ?? mirror.live;
        if (!base) return null;

        const options = [...base.options];
        const upsert = (option: QuestionnaireFieldMirrorOption): void => {
            const known = findQuestionnaireMirrorOption(
                { ...base, options },
                option,
            );
            const at = known === null ? -1 : options.indexOf(known);
            if (at === -1) options.push(option);
            else options[at] = { ...options[at], ...option };
        };

        for (const rename of renames) {
            const option = item.options.find(row => row.id === rename.optionId);
            if (!option) continue;
            upsert({
                bitrixId: option.bitrixId,
                xmlId: option.xmlId,
                title: rename.title,
            });
        }
        for (const option of newOptions) {
            upsert({
                bitrixId: option.bitrixId,
                xmlId: option.xmlId,
                title: option.title,
            });
        }

        return writeQuestionnaireFieldMirror(item.meta, {
            live: mirror.live,
            accepted: {
                ...base,
                title: title ?? base.title,
                options,
                at: new Date().toISOString(),
            },
        });
    }

    /**
     * Новые варианты справочника: проверка и код строки.
     *
     * Три отказа, каждый — про уже собранные ответы:
     *  - вариант без `bitrixId` записать в поле нечем;
     *  - вариант с уже занятым `bitrixId` дал бы вопросу два одинаковых
     *    ответа, и понять, какой из них выбрал менеджер, стало бы нечем;
     *  - варианты есть только у списка: у любого другого контрола
     *    сохранение из редактора потом отказало бы в собственных же
     *    данных.
     */
    private buildSyncOptions(
        item: PortalQuestionnaireItemRecord,
        drafts: PortalQuestionnaireOptionAddDraft[],
        where: string,
    ): PortalQuestionnaireOptionCreateInput[] {
        if (drafts.length === 0) return [];
        if (
            (item.control as EnumQuestionnaireControl) !==
            EnumQuestionnaireControl.enumeration
        ) {
            throw new BadRequestException(
                `${where}: варианты справочника есть только у типа «Список»`,
            );
        }

        // Коды всех вариантов, включая погашенные: код уникален в вопросе
        // на уровне БД, и погашенный вариант строку не освобождает.
        const codes = new Set(item.options.map(option => option.code));
        const takenIds = new Set(
            item.options
                .map(option => option.bitrixId)
                .filter((bitrixId): bitrixId is number => bitrixId !== null),
        );

        return drafts.map(draft => {
            const bitrixId = Number(draft.bitrixId);
            if (!Number.isInteger(bitrixId) || bitrixId <= 0) {
                throw new BadRequestException(
                    `${where}: у нового варианта нет bitrixId элемента ` +
                        'списка — такой ответ не записать в поле',
                );
            }
            if (takenIds.has(bitrixId)) {
                throw new BadRequestException(
                    `${where}: вариант с bitrixId ${bitrixId} уже есть — ` +
                        'второй такой же сделал бы ответ неразличимым',
                );
            }
            takenIds.add(bitrixId);

            const xmlId = this.optionalText(draft.xmlId);
            return {
                code: this.buildSyncOptionCode(bitrixId, xmlId, codes),
                title: this.requireText(
                    draft.title,
                    `${where}: подпись нового варианта`,
                ),
                bitrixId,
                xmlId,
                sort: draft.sort ?? 500,
            };
        });
    }

    /**
     * Код новой строки варианта. Берём внешний код элемента, а без него —
     * идентификатор: код — ключ строки в БД, он переживает пересоздание
     * списка в Битриксе, и выводить его из подписи нельзя — подпись
     * владелец потом перепишет.
     */
    private buildSyncOptionCode(
        bitrixId: number,
        xmlId: string | null,
        codes: Set<string>,
    ): string {
        const slug = (xmlId ?? '')
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 48);
        const base = slug || `bx_${bitrixId}`;
        let code = base;
        if (codes.has(code)) code = `${base}_${bitrixId}`;
        let index = 2;
        while (codes.has(code)) {
            code = `${base}_${bitrixId}_${index}`;
            index += 1;
        }
        codes.add(code);
        return code;
    }

    // ---------------------------------------------------------------
    // Проверка и нормализация на сохранении
    // ---------------------------------------------------------------

    /** Черновик админки → проверенный вход репозитория. */
    private buildSaveInput(
        portalId: number,
        domain: string,
        draft: PortalQuestionnaireDraft,
        smarts: PortalSmartsById,
    ): PortalQuestionnaireSaveInput {
        const code = this.requireText(draft.code, 'Код анкеты');
        const title = this.requireText(draft.title, 'Название анкеты');
        const appCode = this.requireText(draft.appCode, 'Код приложения');

        const purpose = this.requireOneOf(
            draft.purpose,
            QUESTIONNAIRE_PURPOSES,
            'Назначение анкеты',
        );
        const presentation = this.requireOneOf(
            draft.presentation ?? EnumQuestionnairePresentation.inline,
            QUESTIONNAIRE_PRESENTATIONS,
            'Способ показа анкеты',
        );
        const persist = this.requireOneOf(
            draft.persist ?? EnumQuestionnairePersist.onChange,
            QUESTIONNAIRE_PERSISTS,
            'Момент записи ответа',
        );

        // Колонка есть только у карточки: у модалки она ничего не значит и
        // в редакторе выглядела бы работающей настройкой.
        let place: EnumQuestionnairePlace | null = null;
        if (presentation === EnumQuestionnairePresentation.inline) {
            place = draft.place
                ? this.requireOneOf(
                      draft.place,
                      QUESTIONNAIRE_PLACES,
                      'Колонка анкеты',
                  )
                : purpose === EnumQuestionnairePurpose.report
                  ? EnumQuestionnairePlace.report
                  : EnumQuestionnairePlace.plan;
        } else if (draft.place) {
            throw new BadRequestException(
                'Колонка задаётся только для анкеты-карточки ' +
                    '(presentation: inline)',
            );
        }

        // Условия строятся ПЕРВЫМИ: вопрос канала `smart` проверяется по
        // ним — анкета обязана быть привязана к типу события, у которого
        // этот смарт есть, иначе элемент, куда писать ответ, не родится.
        const conditions = this.buildConditions(draft.conditions);
        const items = this.buildItems(draft.items ?? [], {
            conditions,
            smarts,
        });

        return {
            id: draft.id ?? null,
            portalId,
            domain,
            appCode,
            code,
            title,
            hint: this.optionalText(draft.hint),
            purpose,
            presentation,
            place,
            persist,
            conditions,
            configKey: this.optionalText(draft.configKey),
            legacyChecklistId: this.optionalText(draft.legacyChecklistId),
            isActive: draft.isActive ?? false,
            sort: draft.sort ?? 500,
            updatedBy: draft.updatedBy ?? null,
            items,
        };
    }

    /** Условия показа: И-семантика, поэтому вид условия не повторяется. */
    private buildConditions(
        drafts: PortalQuestionnaireConditionDraft[],
    ): PortalQuestionnaireConditionInput[] {
        if (!Array.isArray(drafts) || drafts.length === 0) {
            throw new BadRequestException(
                'Нужно хотя бы одно условие показа. Анкета без условий ' +
                    'никогда не появится — для «показывать всегда» есть ' +
                    'условие «Всегда».',
            );
        }

        const conditions: PortalQuestionnaireConditionInput[] = [];
        const seen = new Set<string>();
        for (const draft of drafts) {
            const kind = this.requireOneOf(
                draft.kind,
                QUESTIONNAIRE_CONDITION_KINDS,
                'Вид условия показа',
            );
            if (seen.has(kind)) {
                throw new BadRequestException(
                    `Условие «${kind}» указано дважды: условия ` +
                        'объединяются по И, второе такое же выполнить нельзя',
                );
            }
            seen.add(kind);

            const values = draft.values ?? [];
            // «Всегда» и «Презентация проведена» значений не имеют: их
            // список один на бэк, чтобы сохранение и компиляция не
            // разошлись во мнении, пустой массив — это норма или поломка.
            if (isQuestionnaireValuelessCondition(kind)) {
                if (values.length > 0) {
                    throw new BadRequestException(
                        `Условие «${kind}» значений не принимает`,
                    );
                }
                conditions.push({ kind, values: [] });
                continue;
            }

            if (values.length === 0) {
                throw new BadRequestException(
                    `Условие «${kind}»: не выбрано ни одного значения`,
                );
            }
            const allowed = QUESTIONNAIRE_CONDITION_VALUES[kind].map(
                option => option.code,
            );
            for (const value of values) {
                if (!allowed.includes(value)) {
                    throw new BadRequestException(
                        `Условие «${kind}»: значение «${value}» не ` +
                            `из реестра. Допустимо: ${allowed.join(', ')}`,
                    );
                }
            }
            conditions.push({ kind, values: [...new Set(values)] });
        }

        if (seen.size > 1 && seen.has(EnumQuestionnaireConditionKind.always)) {
            throw new BadRequestException(
                'Условие «Всегда» не совмещается с другими условиями',
            );
        }
        return conditions;
    }

    private buildItems(
        drafts: PortalQuestionnaireItemDraft[],
        context: QuestionnaireItemContext,
    ): PortalQuestionnaireItemInput[] {
        const items = drafts.map((draft, index) =>
            this.buildItem(draft, index, context),
        );
        const codes = new Set<string>();
        for (const item of items) {
            if (codes.has(item.code)) {
                throw new BadRequestException(
                    `Код вопроса «${item.code}» повторяется: код — ключ ` +
                        'ответа во фрейме, дубль обнулит один из вопросов',
                );
            }
            codes.add(item.code);
        }
        return items;
    }

    private buildItem(
        draft: PortalQuestionnaireItemDraft,
        index: number,
        context: QuestionnaireItemContext,
    ): PortalQuestionnaireItemInput {
        const code = this.requireText(draft.code, `Код вопроса #${index + 1}`);
        const where = `Вопрос «${code}»`;
        const title = this.requireText(draft.title, `${where}: название`);

        const control = this.requireOneOf(
            draft.control,
            QUESTIONNAIRE_CONTROLS,
            `${where}: тип отображения`,
        );
        const channel = this.requireOneOf(
            draft.channel ?? EnumQuestionnaireChannel.crm,
            QUESTIONNAIRE_CHANNELS,
            `${where}: канал записи`,
        );
        const isSmartChannel = channel === EnumQuestionnaireChannel.smart;
        const targetMode = isSmartChannel
            ? EnumQuestionnaireTargetMode.entity
            : this.requireOneOf(
                  draft.targetMode ?? EnumQuestionnaireTargetMode.auto,
                  QUESTIONNAIRE_TARGET_MODES,
                  `${where}: выбор носителя`,
              );
        const fieldStatus = this.requireOneOf(
            draft.fieldStatus ?? EnumQuestionnaireFieldStatus.ok,
            QUESTIONNAIRE_FIELD_STATUSES,
            `${where}: состояние привязки`,
        );

        // Массивы фронт не пишет: `toPortalValue(['a']) === null` (закреплено
        // тестом). Разрешить множественное поле — значит собирать ответы,
        // которые исчезают бесследно.
        if (draft.isMultiple === true) {
            throw new BadRequestException(
                `${where}: множественные поля в этой версии не ` +
                    'поддержаны — ответ не был бы записан',
            );
        }

        let targetEntity: EnumQuestionnaireTargetEntity | null = null;
        if (isSmartChannel) {
            // Носитель у смарт-канала самоописывающий: ответ уедет в тот
            // элемент, который создаёт или закрывает поток события.
            // Выбирать нечего — ставим сами, но чужой явный выбор молча
            // не переиначиваем: это была бы подмена решения владельца.
            if (
                draft.targetMode &&
                draft.targetMode !== EnumQuestionnaireTargetMode.entity
            ) {
                throw new BadRequestException(
                    `${where}: ответ в элемент смарта адресуется жёстко — ` +
                        'цепочки компания → сделка → лид у него нет',
                );
            }
            if (
                draft.targetEntity &&
                draft.targetEntity !== EnumQuestionnaireTargetEntity.smart
            ) {
                throw new BadRequestException(
                    `${where}: у канала «Поле элемента смарта» носитель ` +
                        `только «${EnumQuestionnaireTargetEntity.smart}», ` +
                        `а указан «${draft.targetEntity}»`,
                );
            }
            targetEntity = EnumQuestionnaireTargetEntity.smart;
        } else if (targetMode === EnumQuestionnaireTargetMode.entity) {
            targetEntity = this.requireOneOf(
                draft.targetEntity ?? '',
                QUESTIONNAIRE_TARGET_ENTITIES,
                `${where}: сущность-носитель`,
            );
            // Элемент смарта наполняет поток, а не фрейм: без канала
            // `smart` такой носитель был бы обещанием записи, которой не
            // случится.
            if (targetEntity === EnumQuestionnaireTargetEntity.smart) {
                throw new BadRequestException(
                    `${where}: носитель «элемент смарта» работает только с ` +
                        'каналом «Поле элемента смарта»',
                );
            }
        } else if (draft.targetEntity) {
            throw new BadRequestException(
                `${where}: сущность-носитель задаётся только при жёстком ` +
                    'выборе носителя (targetMode: entity)',
            );
        }

        // Требование нового ответа умеет проверять только запись в CRM: в
        // остальных каналах «прошлого значения» просто нет.
        const requireChange = draft.requireChange ?? false;
        if (requireChange && channel !== EnumQuestionnaireChannel.crm) {
            throw new BadRequestException(
                `${where}: «требовать новое значение» работает только для ` +
                    'канала «Поле CRM»',
            );
        }

        const staleAfterDays = draft.staleAfterDays ?? null;
        if (staleAfterDays !== null) {
            const isDateControl =
                control === EnumQuestionnaireControl.date ||
                control === EnumQuestionnaireControl.datetime;
            if (!isDateControl) {
                throw new BadRequestException(
                    `${where}: срок годности ответа считается только по ` +
                        'дате — он доступен типам «Дата» и «Дата и время»',
                );
            }
            if (!Number.isInteger(staleAfterDays) || staleAfterDays <= 0) {
                throw new BadRequestException(
                    `${where}: срок годности — целое число дней больше нуля`,
                );
            }
        }

        const fieldName = this.optionalText(draft.fieldName);
        const fieldType = this.optionalText(draft.fieldType);
        const dtoPath = this.optionalText(draft.dtoPath);

        if (channel === EnumQuestionnaireChannel.crm) {
            if (!fieldName) {
                throw new BadRequestException(
                    `${where}: для записи в CRM нужно выбрать поле`,
                );
            }
            if (dtoPath) {
                throw new BadRequestException(
                    `${where}: путь в отчёте задаётся только для канала ` +
                        '«Поле отчёта»',
                );
            }
            this.requireReachableField(where, draft, targetMode, targetEntity);
            // Штатное поле (OPPORTUNITY) типа пользовательского поля не
            // имеет — матрицу применяем только к UF-полям.
            if (
                fieldType &&
                !isQuestionnaireControlAllowed(fieldType, control)
            ) {
                throw new BadRequestException(
                    `${where}: тип отображения «${control}» несовместим с ` +
                        `полем типа «${fieldType}» — ответ не записался бы`,
                );
            }
            if (!fieldType && draft.isNative !== true) {
                throw new BadRequestException(
                    `${where}: не указан тип поля — без него проверить ` +
                        'исполнимость типа отображения нечем',
                );
            }
        }

        let smartId: number | null = null;
        let smartEntityTypeId: number | null = null;
        if (isSmartChannel) {
            if (!fieldName) {
                throw new BadRequestException(
                    `${where}: для записи в элемент смарта нужно выбрать поле`,
                );
            }
            if (dtoPath) {
                throw new BadRequestException(
                    `${where}: путь в отчёте задаётся только для канала ` +
                        '«Поле отчёта»',
                );
            }
            // Штатных полей у смарта нет: `isNative` про OPPORTUNITY
            // сделки, и с ним не сошлась бы ни матрица, ни резолв ключа.
            if (draft.isNative === true) {
                throw new BadRequestException(
                    `${where}: штатных полей у элемента смарта нет — ` +
                        'выберите пользовательское поле смарта',
                );
            }
            const smart = this.requireEventSmart(where, draft, context);
            smartId = smart.id;
            smartEntityTypeId = smart.entityTypeId;
            if (!fieldType) {
                throw new BadRequestException(
                    `${where}: не указан тип поля — без него проверить ` +
                        'исполнимость типа отображения нечем',
                );
            }
            if (!isQuestionnaireControlAllowed(fieldType, control)) {
                throw new BadRequestException(
                    `${where}: тип отображения «${control}» несовместим с ` +
                        `полем типа «${fieldType}» — ответ не записался бы`,
                );
            }
        }

        if (channel === EnumQuestionnaireChannel.dto) {
            const descriptor = dtoPath
                ? getQuestionnaireDtoPath(dtoPath)
                : undefined;
            if (!descriptor) {
                throw new BadRequestException(
                    `${where}: путь в отчёте «${dtoPath ?? ''}» не из ` +
                        'реестра — бэк отчёта такого поля не примет',
                );
            }
            if (descriptor.control !== control) {
                throw new BadRequestException(
                    `${where}: поле отчёта «${descriptor.path}» ` +
                        `заполняется типом «${descriptor.control}»`,
                );
            }
        }

        if (channel === EnumQuestionnaireChannel.text) {
            if (fieldName || dtoPath) {
                throw new BadRequestException(
                    `${where}: ответ в комментарий события никуда больше ` +
                        'не пишется — поле и путь в отчёте нужно очистить',
                );
            }
        }

        const options = this.buildOptions(draft.options ?? [], {
            where,
            control,
            channel,
        });

        return {
            code,
            title,
            placeholder: this.optionalText(draft.placeholder),
            hint: this.optionalText(draft.hint),
            groupTitle: this.optionalText(draft.groupTitle),
            sort: draft.sort ?? 500,
            control,
            isMultiple: false,
            isRequired: draft.isRequired ?? false,
            requireChange,
            staleAfterDays,
            channel,
            targetMode,
            targetEntity,
            dtoPath,
            smartId,
            smartEntityTypeId,
            isNative: draft.isNative ?? false,
            fieldName,
            fieldBitrixId: draft.fieldBitrixId ?? null,
            fieldXmlId: this.optionalText(draft.fieldXmlId),
            fieldCode: this.optionalText(draft.fieldCode),
            fieldType,
            fieldStatus,
            fieldCheckedAt: null,
            meta: draft.meta ?? {},
            isActive: draft.isActive ?? true,
            options,
        };
    }

    /**
     * Поле само по себе адреса не имеет: ответ уедет в ту сущность, которую
     * назвал носитель. Пикер отдаёт поля ПЯТИ носителей, а фрейм умеет
     * только цепочку `auto` (компания → сделка → лид) и жёстко указанный
     * `targetEntity` — поэтому источник поля связывается с носителем здесь,
     * на сохранении.
     *
     * Без этой сверки вопрос с полем смарта (`UF_CRM_7_…`) или с полем
     * контакта при дефолтном `targetMode: auto` сохранялся бы со статусом
     * `ok`, компиляция бы его пропустила, а фрейм записал бы ответ в
     * компанию/сделку/лид — то есть в никуда и молча.
     */
    private requireReachableField(
        where: string,
        draft: PortalQuestionnaireItemDraft,
        targetMode: EnumQuestionnaireTargetMode,
        targetEntity: EnumQuestionnaireTargetEntity | null,
    ): void {
        // Штатное поле (OPPORTUNITY) в пикере не выбирается: носителя у
        // него нет ровно так же, как нет типа пользовательского поля.
        if (draft.isNative === true) return;

        if (!this.optionalText(draft.fieldSource)) {
            throw new BadRequestException(
                `${where}: не указан носитель, из которого выбрано поле — ` +
                    'без него нечем проверить, что фрейм до поля доберётся',
            );
        }
        const source = this.requireOneOf(
            draft.fieldSource,
            QUESTIONNAIRE_FIELD_SOURCES,
            `${where}: носитель поля`,
        );

        // Поле смарта на канале «Поле CRM» — по-прежнему отказ: фрейм
        // пишет ответ сам, а элемента смарта в этот момент ещё нет. Для
        // смарта есть свой канал, где ответ раскладывает бэк.
        if (source === EnumQuestionnaireFieldSource.smart) {
            throw new BadRequestException(
                `${where}: поле смарта в CRM не пишется — фрейм адресует ` +
                    'компанию, сделку, лид и контакт. Для ответа в элемент ' +
                    'смарта выберите канал «Поле элемента смарта»',
            );
        }

        if (targetMode === EnumQuestionnaireTargetMode.auto) {
            if (QUESTIONNAIRE_AUTO_FIELD_SOURCES.includes(source)) return;
            throw new BadRequestException(
                `${where}: поле носителя «${source}» цепочкой ` +
                    'компания → сделка → лид не достать — выберите жёсткий ' +
                    `носитель (targetMode: entity, targetEntity: ${source})`,
            );
        }

        // Строками, а не значениями enum'ов: реестры разные, коды общие.
        if ((targetEntity as string | null) !== (source as string)) {
            throw new BadRequestException(
                `${where}: поле выбрано у носителя «${source}», а ответ ` +
                    `адресован «${targetEntity ?? ''}» — фрейм записал бы ` +
                    'его в сущность, где этого поля нет',
            );
        }
    }

    /**
     * Адрес смарта для вопроса канала `smart` — три вопроса подряд, и
     * каждый про то, куда именно уедет ответ:
     *  1) поле выбрано ИМЕННО у смарта (иначе оно уехало бы в элемент,
     *     где его нет);
     *  2) смарт принадлежит ЭТОМУ порталу и известен нам строкой `smarts`;
     *  3) у смарта есть ПОТОК события, который создаёт или закрывает
     *     элемент, и анкета привязана к типу события этого потока.
     *
     * Третья проверка — главная. Ответ смарт-анкеты пишется не «в смарт
     * вообще», а в элемент, который заводит поток ЭТОГО отчёта. Анкета,
     * не привязанная к типу события со смартом, показалась бы там, где
     * элемент не рождается: ответ собрали бы, а положить его было бы
     * некуда — и никто бы не понял, куда он делся.
     */
    private requireEventSmart(
        where: string,
        draft: PortalQuestionnaireItemDraft,
        context: QuestionnaireItemContext,
    ): PortalQuestionnaireSmartRecord {
        const source = this.requireOneOf(
            draft.fieldSource,
            QUESTIONNAIRE_FIELD_SOURCES,
            `${where}: носитель поля`,
        );
        if (source !== EnumQuestionnaireFieldSource.smart) {
            throw new BadRequestException(
                `${where}: канал «Поле элемента смарта» принимает только ` +
                    `поле смарта, а поле выбрано у носителя «${source}»`,
            );
        }

        const smartId = draft.smartId ?? null;
        if (smartId === null || !Number.isInteger(smartId) || smartId <= 0) {
            throw new BadRequestException(
                `${where}: не указан смарт, из которого выбрано поле ` +
                    '(smartId из GET /questionnaire-fields/sources) — без ' +
                    'него неизвестно, в элемент какого смарта писать ответ',
            );
        }
        const record = context.smarts.get(smartId);
        if (!record) {
            throw new BadRequestException(
                `${where}: смарт ${smartId} не установлен на этом портале`,
            );
        }

        const binding = findSmartBindingByTypeGroup(record.type, record.group);
        if (!binding) {
            throw new BadRequestException(
                `${where}: у смарта «${record.title}» нет потока события, ` +
                    'который создавал бы элемент, — ответ было бы некуда ' +
                    'писать',
            );
        }
        if (
            !isQuestionnaireReachableForSmartKind(
                context.conditions,
                binding.kind,
            )
        ) {
            const types = findEventTypesBySmartKind(binding.kind).join(', ');
            throw new BadRequestException(
                `${where}: анкета не привязана к типу события смарта ` +
                    `«${record.title}» — элемент, в который уехал бы ответ, ` +
                    'просто не создаётся. Добавьте условие показа по типу ' +
                    `планируемого или отчётного события (${types})` +
                    (binding.kind === 'presentation'
                        ? ' либо условие «Презентация проведена»'
                        : ''),
            );
        }
        return record;
    }

    private buildOptions(
        drafts: PortalQuestionnaireOptionDraft[],
        context: {
            where: string;
            control: EnumQuestionnaireControl;
            channel: EnumQuestionnaireChannel;
        },
    ): PortalQuestionnaireOptionInput[] {
        const { where, control, channel } = context;
        if (control !== EnumQuestionnaireControl.enumeration) {
            if (drafts.length > 0) {
                throw new BadRequestException(
                    `${where}: варианты справочника есть только у типа ` +
                        '«Список»',
                );
            }
            return [];
        }
        if (drafts.length === 0) {
            throw new BadRequestException(
                `${where}: у списка должен быть хотя бы один вариант`,
            );
        }

        const codes = new Set<string>();
        return drafts.map((draft, index) => {
            const code = this.requireText(
                draft.code,
                `${where}: код варианта #${index + 1}`,
            );
            if (codes.has(code)) {
                throw new BadRequestException(
                    `${where}: код варианта «${code}» повторяется`,
                );
            }
            codes.add(code);

            const bitrixId = draft.bitrixId ?? null;
            // В поле уезжает именно id элемента списка: вариант без него
            // записать нельзя, ответ молча потерялся бы. Каналу `smart`
            // требование то же — фрейму этот id не отдаётся (элементы
            // резолвит бэк по живому справочнику), но вариант обязан быть
            // взят из настоящего поля, а не набран руками.
            if (
                (channel === EnumQuestionnaireChannel.crm ||
                    channel === EnumQuestionnaireChannel.smart) &&
                bitrixId === null
            ) {
                throw new BadRequestException(
                    `${where}: у варианта «${code}» нет bitrixId элемента ` +
                        'списка — такой ответ не записать в поле',
                );
            }

            return {
                code,
                title: this.requireText(
                    draft.title,
                    `${where}: название варианта «${code}»`,
                ),
                bitrixId,
                xmlId: this.optionalText(draft.xmlId),
                sort: draft.sort ?? 500,
                isDefault: draft.isDefault ?? false,
                isActive: draft.isActive ?? true,
            };
        });
    }

    // ---------------------------------------------------------------
    // Компиляция каталога для фрейма
    // ---------------------------------------------------------------

    /** Записи БД → каталог, в котором каждый пункт исполним. */
    private compile(
        records: PortalQuestionnaireRecord[],
        smarts: PortalSmartsById,
    ): QuestionnaireCatalog {
        const questionnaires: QuestionnaireCatalogEntry[] = [];
        for (const record of records) {
            const entry = this.compileEntry(record, smarts);
            if (entry) questionnaires.push(entry);
        }
        questionnaires.sort(
            (left, right) =>
                left.sort - right.sort || left.code.localeCompare(right.code),
        );
        return {
            contract: QUESTIONNAIRE_CATALOG_CONTRACT,
            // Человекочитаемый счётчик правок; надёжный компаратор — hash.
            version: questionnaires.reduce(
                (sum, entry) => sum + entry.version,
                0,
            ),
            hash: this.hash(questionnaires),
            questionnaires,
        };
    }

    private compileEntry(
        record: PortalQuestionnaireRecord,
        smarts: PortalSmartsById,
    ): QuestionnaireCatalogEntry | null {
        if (!record.isActive) return null;

        const purpose = this.readOneOf(record.purpose, QUESTIONNAIRE_PURPOSES);
        const presentation = this.readOneOf(
            record.presentation,
            QUESTIONNAIRE_PRESENTATIONS,
        );
        const persist = this.readOneOf(record.persist, QUESTIONNAIRE_PERSISTS);
        if (!purpose || !presentation || !persist) {
            this.logger.warn(
                `Анкета ${record.appCode}/${record.code} пропущена: ` +
                    'неизвестное назначение, способ показа или момент записи',
            );
            return null;
        }

        const conditions = this.compileConditions(record);
        if (!conditions) return null;

        const items: QuestionnaireCatalogItem[] = [];
        for (const item of record.items) {
            const compiled = this.compileItem(item, record, smarts);
            if (compiled) items.push(compiled);
        }
        if (items.length === 0) {
            this.logger.warn(
                `Анкета ${record.appCode}/${record.code} пропущена: ` +
                    'не осталось ни одного исполнимого вопроса',
            );
            return null;
        }
        items.sort(
            (left, right) =>
                left.sort - right.sort || left.code.localeCompare(right.code),
        );

        const place =
            presentation === EnumQuestionnairePresentation.inline
                ? (this.readOneOf(record.place ?? '', QUESTIONNAIRE_PLACES) ??
                  (purpose === EnumQuestionnairePurpose.report
                      ? EnumQuestionnairePlace.report
                      : EnumQuestionnairePlace.plan))
                : null;

        return {
            code: record.code,
            title: record.title,
            hint: record.hint,
            purpose,
            presentation,
            place,
            persist,
            conditions,
            configKey: record.configKey,
            legacyChecklistId: record.legacyChecklistId,
            sort: record.sort,
            version: record.version,
            items,
        };
    }

    /**
     * Условия показа из JSON-колонки. Любая непонятность — БЕЗОПАСНЫЙ
     * ОТКАЗ: анкету не показываем вовсе. Выбросить непонятое условие и
     * показать анкету было бы хуже всего — она всплыла бы там, где её
     * никто не ждёт.
     */
    private compileConditions(
        record: PortalQuestionnaireRecord,
    ): QuestionnaireCatalogCondition[] | null {
        const raw = Array.isArray(record.conditions) ? record.conditions : [];
        if (raw.length === 0) {
            this.logger.warn(
                `Анкета ${record.appCode}/${record.code} пропущена: ` +
                    'условия показа пусты или лежат в колонке не массивом',
            );
            return null;
        }

        const conditions: QuestionnaireCatalogCondition[] = [];
        for (const entry of raw) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                this.logger.warn(
                    `Анкета ${record.appCode}/${record.code} пропущена: ` +
                        'условие показа записано не объектом',
                );
                return null;
            }
            const source = entry as { kind?: unknown; values?: unknown };
            const kind =
                typeof source.kind === 'string'
                    ? this.readOneOf(source.kind, QUESTIONNAIRE_CONDITION_KINDS)
                    : null;
            if (!kind) {
                this.logger.warn(
                    `Анкета ${record.appCode}/${record.code} пропущена: ` +
                        `неизвестный вид условия «${String(source.kind)}»`,
                );
                return null;
            }
            // «Всегда» и «Презентация проведена» значений не имеют:
            // пустой список у них норма, а не потерянное условие.
            if (isQuestionnaireValuelessCondition(kind)) {
                conditions.push({ kind, values: [] });
                continue;
            }

            const allowed = QUESTIONNAIRE_CONDITION_VALUES[kind].map(
                option => option.code,
            );
            const values = (
                Array.isArray(source.values) ? source.values : []
            ).filter(
                (value): value is string =>
                    typeof value === 'string' && allowed.includes(value),
            );
            if (values.length === 0) {
                this.logger.warn(
                    `Анкета ${record.appCode}/${record.code} пропущена: ` +
                        `у условия «${kind}» не осталось значений из реестра`,
                );
                return null;
            }
            conditions.push({ kind, values });
        }
        return conditions;
    }

    /** Вопрос → пункт каталога; неисполнимый пункт выбрасывается. */
    private compileItem(
        item: PortalQuestionnaireItemRecord,
        record: PortalQuestionnaireRecord,
        smarts: PortalSmartsById,
    ): QuestionnaireCatalogItem | null {
        const where = `${record.appCode}/${record.code}.${item.code}`;
        if (!item.isActive) return null;
        if (item.isMultiple) {
            this.logger.warn(
                `Вопрос ${where} выброшен: множественные значения фронт ` +
                    'не пишет',
            );
            return null;
        }

        const control = this.readOneOf(item.control, QUESTIONNAIRE_CONTROLS);
        const channel = this.readOneOf(item.channel, QUESTIONNAIRE_CHANNELS);
        if (!control || !channel) {
            this.logger.warn(
                `Вопрос ${where} выброшен: неизвестный тип отображения или ` +
                    'канал записи',
            );
            return null;
        }

        const targetMode =
            this.readOneOf(item.targetMode, QUESTIONNAIRE_TARGET_MODES) ??
            EnumQuestionnaireTargetMode.auto;
        const targetEntity = item.targetEntity
            ? this.readOneOf(item.targetEntity, QUESTIONNAIRE_TARGET_ENTITIES)
            : null;
        if (
            targetMode === EnumQuestionnaireTargetMode.entity &&
            !targetEntity
        ) {
            this.logger.warn(
                `Вопрос ${where} выброшен: жёсткий носитель указан, а ` +
                    'сущность неизвестна',
            );
            return null;
        }
        // Элемент смарта наполняет поток, а не фрейм: носитель `smart` без
        // своего канала — след старой записи, исполнить его нечем.
        if (
            targetEntity === EnumQuestionnaireTargetEntity.smart &&
            channel !== EnumQuestionnaireChannel.smart
        ) {
            this.logger.warn(
                `Вопрос ${where} выброшен: носитель «элемент смарта» без ` +
                    `канала «${EnumQuestionnaireChannel.smart}»`,
            );
            return null;
        }

        let field: QuestionnaireCatalogItem['field'] = null;
        let smart: QuestionnaireCatalogSmart | null = null;
        if (channel === EnumQuestionnaireChannel.crm) {
            field = this.compileBoundField(item, where, control);
            if (!field) return null;
        }

        if (channel === EnumQuestionnaireChannel.smart) {
            field = this.compileBoundField(item, where, control);
            if (!field) return null;
            smart = this.compileSmart(item, where, smarts);
            // Смарта на портале нет (снесли или переустановили) — вопрос
            // просто не показывается: ответ было бы некуда положить.
            if (!smart) return null;
        }

        if (channel === EnumQuestionnaireChannel.dto) {
            const descriptor = item.dtoPath
                ? getQuestionnaireDtoPath(item.dtoPath)
                : undefined;
            if (!descriptor || descriptor.control !== control) {
                this.logger.warn(
                    `Вопрос ${where} выброшен: путь в отчёте ` +
                        `«${item.dtoPath ?? ''}» не из реестра или не ` +
                        'соответствует типу отображения',
                );
                return null;
            }
            field = item.fieldName
                ? { name: item.fieldName, type: item.fieldType }
                : null;
        }

        const isDateControl =
            control === EnumQuestionnaireControl.date ||
            control === EnumQuestionnaireControl.datetime;

        return {
            code: item.code,
            title: item.title,
            placeholder: item.placeholder,
            hint: item.hint,
            groupTitle: item.groupTitle,
            sort: item.sort,
            control,
            isRequired: item.isRequired,
            // Оба свойства сужаем до исполнимого: свойство, которое фронт
            // не сможет проверить, лучше не отдавать вовсе.
            requireChange:
                channel === EnumQuestionnaireChannel.crm
                    ? item.requireChange
                    : false,
            staleAfterDays: isDateControl ? item.staleAfterDays : null,
            channel,
            dtoPath:
                channel === EnumQuestionnaireChannel.dto ? item.dtoPath : null,
            target: { mode: targetMode, entity: targetEntity },
            smart,
            isNative: item.isNative,
            field,
            options: item.options
                .filter(option => option.isActive)
                .map(option => ({
                    code: option.code,
                    title: option.title,
                    // Каналу `smart` идентификатор элемента НЕ отдаём:
                    // фрейм в смарт не пишет и адресами чужого справочника
                    // не оперирует — ответ уезжает кодом варианта, а в id
                    // его переводит бэк по живому полю элемента.
                    bitrixId:
                        channel === EnumQuestionnaireChannel.smart
                            ? null
                            : option.bitrixId,
                })),
        };
    }

    /**
     * Привязка к полю для каналов, которые без поля неисполнимы (`crm` и
     * `smart`). Любая беда — null и warn: пункт, в который нечего
     * записать, фрейму не показывается совсем и отправку не блокирует.
     */
    private compileBoundField(
        item: PortalQuestionnaireItemRecord,
        where: string,
        control: EnumQuestionnaireControl,
    ): QuestionnaireCatalogItem['field'] {
        // Неизвестный статус привязки — тоже «не ok»: читаем через
        // реестр, чтобы мусор в колонке не сошёл за исправную привязку.
        const fieldStatus = this.readOneOf(
            item.fieldStatus,
            QUESTIONNAIRE_FIELD_STATUSES,
        );
        if (fieldStatus !== EnumQuestionnaireFieldStatus.ok) {
            this.logger.warn(
                `Вопрос ${where} выброшен: привязка к полю в состоянии ` +
                    `«${item.fieldStatus}»`,
            );
            return null;
        }
        if (!item.fieldName) {
            this.logger.warn(
                `Вопрос ${where} выброшен: нет имени поля для записи`,
            );
            return null;
        }
        if (
            item.fieldType &&
            !isQuestionnaireControlAllowed(item.fieldType, control)
        ) {
            this.logger.warn(
                `Вопрос ${where} выброшен: тип отображения «${control}» ` +
                    `несовместим с полем «${item.fieldType}»`,
            );
            return null;
        }
        return { name: item.fieldName, type: item.fieldType };
    }

    /**
     * Смарт-носитель вопроса: строка `smarts` портала → поток события.
     *
     * Три причины выбросить пункт, и все три означают одно — элемента, в
     * который поедет ответ, не будет: смарта у вопроса не записано,
     * смарта нет на портале, у смарта нет потока события.
     *
     * Слепок `entityTypeId` расходится с живым — это не повод молчать
     * (смарт переустановили), но и не повод терять вопрос: в каталог
     * едет ЖИВОЕ значение, оно и есть правда.
     */
    private compileSmart(
        item: PortalQuestionnaireItemRecord,
        where: string,
        smarts: PortalSmartsById,
    ): QuestionnaireCatalogSmart | null {
        if (item.smartId === null) {
            this.logger.warn(
                `Вопрос ${where} выброшен: у канала «${EnumQuestionnaireChannel.smart}» ` +
                    'не записан смарт-носитель',
            );
            return null;
        }
        const record = smarts.get(item.smartId);
        if (!record) {
            this.logger.warn(
                `Вопрос ${where} выброшен: смарта ${item.smartId} на ` +
                    'портале больше нет',
            );
            return null;
        }
        const binding = findSmartBindingByTypeGroup(record.type, record.group);
        if (!binding) {
            this.logger.warn(
                `Вопрос ${where} выброшен: у смарта «${record.title}» нет ` +
                    'потока события — элемент для ответа не создаётся',
            );
            return null;
        }
        if (
            item.smartEntityTypeId !== null &&
            item.smartEntityTypeId !== record.entityTypeId
        ) {
            this.logger.warn(
                `Вопрос ${where}: смарт «${record.title}» переустановлен — ` +
                    `entityTypeId был ${item.smartEntityTypeId}, стал ` +
                    `${record.entityTypeId}. В каталог едет живое значение`,
            );
        }
        return { kind: binding.kind, entityTypeId: record.entityTypeId };
    }

    /** sha1 нормализованного состава: сравнивать каталоги по нему. */
    private hash(questionnaires: QuestionnaireCatalogEntry[]): string {
        return createHash('sha1')
            .update(JSON.stringify(questionnaires))
            .digest('hex');
    }

    // ---------------------------------------------------------------
    // Кэш и мелкие помощники
    // ---------------------------------------------------------------

    /**
     * Кэш — ускорение, а не источник правды: любая беда с Redis это warn
     * и поход в БД, но не 500 на экране менеджера.
     */
    private async readCache(
        domain: string,
        appCode: string,
    ): Promise<QuestionnaireCatalog | null> {
        const raw = await this.redis
            .get(this.cacheKey(domain, appCode))
            .catch((error: unknown) => {
                this.logger.warn(
                    `Кэш каталога анкет ${domain}/${appCode} недоступен на ` +
                        `чтении: ${this.describeError(error)}`,
                );
                return null;
            });
        if (!raw) return null;

        try {
            const cached = JSON.parse(raw) as QuestionnaireCatalog;
            // Форма ответа сменилась — старый кэш разбирать нельзя.
            if (cached.contract !== QUESTIONNAIRE_CATALOG_CONTRACT) return null;
            return cached;
        } catch (error: unknown) {
            this.logger.warn(
                `Кэш каталога анкет ${domain}/${appCode} испорчен: ` +
                    this.describeError(error),
            );
            return null;
        }
    }

    private async writeCache(
        domain: string,
        appCode: string,
        catalog: QuestionnaireCatalog,
    ): Promise<void> {
        await this.redis
            .set(
                this.cacheKey(domain, appCode),
                JSON.stringify(catalog),
                'EX',
                CACHE_TTL_SECONDS,
            )
            .catch((error: unknown) => {
                this.logger.warn(
                    `Кэш каталога анкет ${domain}/${appCode} не записан: ` +
                        this.describeError(error),
                );
                return undefined;
            });
    }

    private async dropCache(domain: string, appCode: string): Promise<void> {
        await this.redis
            .del(this.cacheKey(domain, appCode))
            .catch((error: unknown) => {
                this.logger.warn(
                    `Кэш каталога анкет ${domain}/${appCode} не сброшен: ` +
                        `${this.describeError(error)}. До истечения TTL ` +
                        `(${CACHE_TTL_SECONDS} с) фрейм видит прежний состав`,
                );
                return undefined;
            });
    }

    private cacheKey(domain: string, appCode: string): string {
        return `portal-questionnaires:${domain}:${appCode}`;
    }

    private async requireDomain(portalId: number): Promise<string> {
        const portal = await this.portalRepository.findById(portalId);
        if (!portal?.domain) {
            throw new NotFoundException(`Портал ${portalId} не найден`);
        }
        return portal.domain;
    }

    /** Значение из реестра или 400 с перечнем допустимых. */
    private requireOneOf<Value extends string>(
        value: string | null | undefined,
        allowed: Value[],
        label: string,
    ): Value {
        const found = this.readOneOf(value, allowed);
        if (!found) {
            throw new BadRequestException(
                `${label}: значение «${value ?? ''}» не из реестра. ` +
                    `Допустимо: ${allowed.join(', ')}`,
            );
        }
        return found;
    }

    /** Значение из реестра или null — для чтения того, что уже в БД. */
    private readOneOf<Value extends string>(
        value: string | null | undefined,
        allowed: Value[],
    ): Value | null {
        if (!value) return null;
        return allowed.includes(value as Value) ? (value as Value) : null;
    }

    private requireText(value: string | null | undefined, label: string) {
        const text = (value ?? '').trim();
        if (!text) {
            throw new BadRequestException(`${label}: значение обязательно`);
        }
        return text;
    }

    private optionalText(value: string | null | undefined): string | null {
        const text = (value ?? '').trim();
        return text ? text : null;
    }

    private describeError(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
