import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/prisma';
import { Prisma } from 'generated/prisma';
import {
    PortalQuestionnaireItemCheckInput,
    PortalQuestionnaireItemRecord,
    PortalQuestionnaireItemSyncInput,
    PortalQuestionnaireOptionRecord,
    PortalQuestionnaireRecord,
    PortalQuestionnaireSaveInput,
    PortalQuestionnaireSmartRecord,
    PortalQuestionnairesRepository,
} from './portal-questionnaires.repository';
import { EnumQuestionnaireFieldStatus } from './portal-questionnaires.schema';

/** Строка анкеты со всем составом — форма, в которой её читает маппер. */
type QuestionnaireRow = Prisma.PortalQuestionnaireGetPayload<{
    include: { items: { include: { options: true } } };
}>;

type QuestionnaireItemRow = QuestionnaireRow['items'][number];
type QuestionnaireOptionRow = QuestionnaireItemRow['options'][number];

/**
 * Prisma-реализация каталога анкет.
 *
 * Три вещи, на которых здесь легко обжечься:
 *  - `portal_id` в БД BigInt: без `BigInt(portalId)` в `where` запрос не
 *    сматчит НИЧЕГО и вернёт пустой список — без ошибки, молча;
 *  - обратно наружу BigInt отдавать нельзя (`Number(...)`), иначе ответ
 *    контроллера не сериализуется: глобального `toJSON` в монорепе нет;
 *  - uuid ставим сами (`randomUUID`) — колонки `id` объявлены без
 *    дефолта, БД их не генерит.
 *
 * JSON-колонки (`conditions`, `meta`) писались и будут писаться разными
 * версиями кода, поэтому на чтении их нормализуем: кривой JSON одной
 * анкеты не должен ронять весь каталог.
 */
@Injectable()
export class PortalQuestionnairesPrismaRepository
    implements PortalQuestionnairesRepository
{
    constructor(private readonly prisma: PrismaService) {}

    async findActiveByDomain(
        domain: string,
        appCode: string,
    ): Promise<PortalQuestionnaireRecord[]> {
        const rows = await this.prisma.portalQuestionnaire.findMany({
            where: { domain, appCode, isActive: true },
            include: {
                items: {
                    where: { isActive: true },
                    orderBy: [{ sort: 'asc' }, { code: 'asc' }],
                    include: {
                        options: {
                            where: { isActive: true },
                            orderBy: [{ sort: 'asc' }, { code: 'asc' }],
                        },
                    },
                },
            },
            orderBy: [{ sort: 'asc' }, { code: 'asc' }],
        });
        return rows.map(row => this.toRecord(row));
    }

    async findByPortalId(
        portalId: number,
        appCode?: string,
    ): Promise<PortalQuestionnaireRecord[]> {
        const rows = await this.prisma.portalQuestionnaire.findMany({
            where: {
                portal_id: BigInt(portalId),
                ...(appCode ? { appCode } : {}),
            },
            include: {
                items: {
                    orderBy: [{ sort: 'asc' }, { code: 'asc' }],
                    include: {
                        options: {
                            orderBy: [{ sort: 'asc' }, { code: 'asc' }],
                        },
                    },
                },
            },
            orderBy: [{ appCode: 'asc' }, { sort: 'asc' }, { code: 'asc' }],
        });
        return rows.map(row => this.toRecord(row));
    }

    async findById(id: string): Promise<PortalQuestionnaireRecord | null> {
        const row = await this.prisma.portalQuestionnaire.findUnique({
            where: { id },
            include: {
                items: {
                    orderBy: [{ sort: 'asc' }, { code: 'asc' }],
                    include: {
                        options: {
                            orderBy: [{ sort: 'asc' }, { code: 'asc' }],
                        },
                    },
                },
            },
        });
        return row ? this.toRecord(row) : null;
    }

    /**
     * Смарты портала для вопросов канала `smart`. Отдаём (type, group) —
     * ими строка опознаётся в реестре типов события — и entityTypeId,
     * который уедет в каталог. BigInt наружу не выпускаем.
     */
    async findPortalSmarts(
        portalId: number,
    ): Promise<PortalQuestionnaireSmartRecord[]> {
        const rows = await this.prisma.smarts.findMany({
            where: { portal_id: BigInt(portalId) },
            select: {
                id: true,
                entityTypeId: true,
                type: true,
                group: true,
                title: true,
                name: true,
            },
            orderBy: [{ title: 'asc' }, { id: 'asc' }],
        });
        return rows.map(row => ({
            id: Number(row.id),
            entityTypeId: Number(row.entityTypeId),
            type: row.type,
            group: row.group,
            title: row.title || row.name,
        }));
    }

    /**
     * Сохранение одной транзакцией: шапка (create или update с
     * `version++`), затем состав. Частями это делать нельзя — на середине
     * пути анкета осталась бы с половиной пунктов, а фрейм уже считает её
     * действующей.
     *
     * Состав СВЕРЯЕТСЯ по коду вопроса, а не пересоздаётся: код — ключ
     * ответа во фрейме, и уже собранное в CRM значение объясняется именно
     * им. Пункт, которого нет в теле сохранения, ГАСИМ (`isActive:
     * false`), а не удаляем — физическое удаление сделало бы такой ответ
     * необъяснимым (миграция 2026_08_28_100000). То же с вариантами
     * справочника: их `bitrixId` уже мог уехать в поле сущности.
     *
     * Итог «Проверить привязки» (`fieldStatus`, `fieldCheckedAt`) телу
     * сохранения не принадлежит: у пункта с прежней привязкой он
     * переносится из БД, и сохранение из админки не выдаёт сломанный
     * вопрос за исправный.
     */
    async save(
        input: PortalQuestionnaireSaveInput,
    ): Promise<PortalQuestionnaireRecord> {
        const savedId = await this.prisma.$transaction(async tx => {
            const now = new Date();
            const existing = input.id
                ? await tx.portalQuestionnaire.findUnique({
                      where: { id: input.id },
                      select: { id: true },
                  })
                : await tx.portalQuestionnaire.findUnique({
                      where: {
                          portal_id_appCode_code: {
                              portal_id: BigInt(input.portalId),
                              appCode: input.appCode,
                              code: input.code,
                          },
                      },
                      select: { id: true },
                  });

            const head = {
                domain: input.domain,
                title: input.title,
                hint: input.hint,
                purpose: input.purpose,
                presentation: input.presentation,
                place: input.place,
                persist: input.persist,
                conditions: this.toJson(input.conditions),
                configKey: input.configKey,
                legacyChecklistId: input.legacyChecklistId,
                isActive: input.isActive,
                sort: input.sort,
                updatedBy:
                    input.updatedBy === null ? null : BigInt(input.updatedBy),
                updatedAt: now,
            };

            const questionnaireId = existing
                ? (
                      await tx.portalQuestionnaire.update({
                          where: { id: existing.id },
                          data: {
                              ...head,
                              appCode: input.appCode,
                              code: input.code,
                              // Фрейм сверяет версию — растим её на каждое
                              // сохранение, даже если состав не изменился.
                              version: { increment: 1 },
                          },
                          select: { id: true },
                      })
                  ).id
                : (
                      await tx.portalQuestionnaire.create({
                          data: {
                              id: randomUUID(),
                              portal_id: BigInt(input.portalId),
                              appCode: input.appCode,
                              code: input.code,
                              version: 1,
                              createdAt: now,
                              ...head,
                          },
                          select: { id: true },
                      })
                  ).id;

            // Что уже лежит в анкете — вместе с кодами вариантов: по коду и
            // опознаём пункт между сохранениями. Ни строки отсюда не
            // удаляем, только переписываем или гасим.
            const oldItems = await tx.portalQuestionnaireItem.findMany({
                where: { questionnaireId },
                select: {
                    id: true,
                    code: true,
                    channel: true,
                    smartId: true,
                    fieldName: true,
                    fieldType: true,
                    fieldStatus: true,
                    fieldCheckedAt: true,
                    options: { select: { id: true, code: true } },
                },
            });
            const oldItemByCode = new Map(
                oldItems.map(item => [item.code, item]),
            );
            const keptItemIds = new Set<string>();

            for (const item of input.items) {
                // Пункт с таким кодом уже был — переписываем его строку.
                // Тем же и ВОЗВРАЩАЕМ погашенный ранее пункт: id тот же,
                // варианты и их bitrixId остаются на месте.
                const oldItem = oldItemByCode.get(item.code);

                // Итог «Проверить привязки» живёт ТОЛЬКО в БД: в теле
                // сохранения статуса по сути нет (он необязателен и по
                // умолчанию `ok`), а отметки проверки нет вовсе. Пока
                // пункт смотрит в то же поле, обе колонки оставляем как
                // были — иначе правка одного заголовка вернула бы
                // сломанный вопрос в каталог со статусом «ok» и без даты
                // проверки. Сменили поле — прежняя проверка ни о чём:
                // берём из тела (`ok`, проверка не проводилась).
                const checkKept =
                    oldItem !== undefined &&
                    oldItem.channel === String(item.channel) &&
                    // Сменился смарт-носитель — прежняя проверка ни о чём:
                    // поле искали в другом элементе другого типа.
                    (oldItem.smartId === null
                        ? item.smartId === null
                        : Number(oldItem.smartId) === item.smartId) &&
                    oldItem.fieldName === item.fieldName &&
                    oldItem.fieldType === item.fieldType;
                const fieldCheck =
                    checkKept && oldItem
                        ? {
                              fieldStatus: oldItem.fieldStatus,
                              fieldCheckedAt: oldItem.fieldCheckedAt,
                          }
                        : {
                              fieldStatus: item.fieldStatus,
                              fieldCheckedAt: item.fieldCheckedAt,
                          };

                const itemFields = {
                    title: item.title,
                    placeholder: item.placeholder,
                    hint: item.hint,
                    groupTitle: item.groupTitle,
                    sort: item.sort,
                    control: item.control,
                    isMultiple: item.isMultiple,
                    isRequired: item.isRequired,
                    requireChange: item.requireChange,
                    staleAfterDays: item.staleAfterDays,
                    channel: item.channel,
                    targetMode: item.targetMode,
                    targetEntity: item.targetEntity,
                    dtoPath: item.dtoPath,
                    smartId:
                        item.smartId === null ? null : BigInt(item.smartId),
                    smartEntityTypeId:
                        item.smartEntityTypeId === null
                            ? null
                            : BigInt(item.smartEntityTypeId),
                    isNative: item.isNative,
                    fieldName: item.fieldName,
                    fieldBitrixId:
                        item.fieldBitrixId === null
                            ? null
                            : BigInt(item.fieldBitrixId),
                    fieldXmlId: item.fieldXmlId,
                    fieldCode: item.fieldCode,
                    fieldType: item.fieldType,
                    ...fieldCheck,
                    meta: this.toJson(item.meta),
                    isActive: item.isActive,
                    updatedAt: now,
                };

                let itemId: string;
                if (oldItem) {
                    itemId = oldItem.id;
                    await tx.portalQuestionnaireItem.update({
                        where: { id: itemId },
                        data: itemFields,
                    });
                } else {
                    itemId = randomUUID();
                    await tx.portalQuestionnaireItem.create({
                        data: {
                            id: itemId,
                            questionnaireId,
                            portal_id: BigInt(input.portalId),
                            code: item.code,
                            createdAt: now,
                            ...itemFields,
                        },
                    });
                }
                keptItemIds.add(itemId);

                const oldOptionByCode = new Map(
                    (oldItem?.options ?? []).map(option => [
                        option.code,
                        option,
                    ]),
                );
                const keptOptionIds = new Set<string>();
                for (const option of item.options) {
                    const optionFields = {
                        title: option.title,
                        bitrixId: option.bitrixId,
                        xmlId: option.xmlId,
                        sort: option.sort,
                        isDefault: option.isDefault,
                        isActive: option.isActive,
                        updatedAt: now,
                    };
                    const oldOption = oldOptionByCode.get(option.code);
                    if (oldOption) {
                        await tx.portalQuestionnaireItemOption.update({
                            where: { id: oldOption.id },
                            data: optionFields,
                        });
                        keptOptionIds.add(oldOption.id);
                    } else {
                        await tx.portalQuestionnaireItemOption.create({
                            data: {
                                id: randomUUID(),
                                itemId,
                                code: option.code,
                                createdAt: now,
                                ...optionFields,
                            },
                        });
                    }
                }

                // Вариант, которого в теле не прислали, гасим: его bitrixId
                // уже мог уехать в поле сущности, и удалённый вариант
                // превратил бы ответ в число без расшифровки.
                const staleOptionIds = (oldItem?.options ?? [])
                    .filter(option => !keptOptionIds.has(option.id))
                    .map(option => option.id);
                if (staleOptionIds.length > 0) {
                    await tx.portalQuestionnaireItemOption.updateMany({
                        where: { id: { in: staleOptionIds } },
                        data: { isActive: false, updatedAt: now },
                    });
                }
            }

            // Пункт, которого в теле не прислали, тоже гасим, а не удаляем:
            // ответ на него уже лежит в поле CRM, и объяснить это значение
            // потом будет нечем. Из каталога фрейма он уходит сразу —
            // чтение фильтрует по `isActive`.
            const staleItemIds = oldItems
                .filter(item => !keptItemIds.has(item.id))
                .map(item => item.id);
            if (staleItemIds.length > 0) {
                await tx.portalQuestionnaireItem.updateMany({
                    where: { id: { in: staleItemIds } },
                    data: { isActive: false, updatedAt: now },
                });
            }

            return questionnaireId;
        });

        const saved = await this.findById(savedId);
        if (!saved) {
            throw new Error(
                `Анкета ${savedId} исчезла сразу после сохранения — ` +
                    'проверьте транзакции и каскады БД',
            );
        }
        return saved;
    }

    async remove(id: string): Promise<void> {
        await this.prisma.portalQuestionnaire.delete({ where: { id } });
    }

    async setItemFieldStatus(
        itemId: string,
        status: EnumQuestionnaireFieldStatus,
        checkedAt: Date,
    ): Promise<void> {
        await this.prisma.portalQuestionnaireItem.update({
            where: { id: itemId },
            data: {
                fieldStatus: status,
                fieldCheckedAt: checkedAt,
                updatedAt: new Date(),
            },
        });
    }

    /**
     * Итоги «Проверить привязки»: статус вопроса, отметка проверки и
     * состояние вариантов — одной транзакцией.
     *
     * Колонки обновляются ТОЛЬКО когда о них что-то известно: `status:
     * null` и не заданные `fieldBitrixId`/`fieldXmlId`/`fieldType`
     * остаются как были. Это degraded-режим: прочитали урезанным способом,
     * значит и записываем ровно то, что увидели.
     */
    async applyFieldCheck(
        items: PortalQuestionnaireItemCheckInput[],
    ): Promise<void> {
        if (items.length === 0) return;
        const now = new Date();
        await this.prisma.$transaction(async tx => {
            for (const item of items) {
                await tx.portalQuestionnaireItem.update({
                    where: { id: item.itemId },
                    data: {
                        ...(item.status === null
                            ? {}
                            : { fieldStatus: item.status }),
                        ...(item.fieldBitrixId === undefined
                            ? {}
                            : {
                                  fieldBitrixId:
                                      item.fieldBitrixId === null
                                          ? null
                                          : BigInt(item.fieldBitrixId),
                              }),
                        ...(item.fieldXmlId === undefined
                            ? {}
                            : { fieldXmlId: item.fieldXmlId }),
                        ...(item.fieldType === undefined
                            ? {}
                            : { fieldType: item.fieldType }),
                        // Слепки живого поля приходят вместе с `meta`
                        // целиком: сверка собирает её из прежней, чтобы
                        // расширения вопроса (min/max, rows) пережили
                        // запись слепка.
                        ...(item.meta === undefined
                            ? {}
                            : { meta: this.toJson(item.meta) }),
                        fieldCheckedAt: item.checkedAt,
                        updatedAt: now,
                    },
                });
                for (const option of item.options) {
                    await tx.portalQuestionnaireItemOption.update({
                        where: { id: option.optionId },
                        data: {
                            bitrixId: option.bitrixId,
                            isActive: option.isActive,
                            updatedAt: now,
                        },
                    });
                }
            }
        });
    }

    /**
     * Применение расхождений, выбранных владельцем: подпись вопроса,
     * подписи вариантов и НОВЫЕ варианты Битрикса — одной транзакцией.
     *
     * Что здесь НЕ делается: адрес записи не трогаем. `bitrixId`
     * существующего варианта и гашение исчезнувшего — дело сверки
     * (`applyFieldCheck`), она обязана быть верной всегда. Здесь только
     * тексты и добавление варианта, который в Битриксе уже есть.
     *
     * `version` анкеты растёт одним апдейтом на всю пачку: фрейм держит
     * свою версию каталога и без её роста показал бы прежние подписи до
     * протухания кэша.
     */
    async applyFieldSync(
        questionnaireId: string,
        items: PortalQuestionnaireItemSyncInput[],
    ): Promise<void> {
        if (items.length === 0) return;
        const now = new Date();
        await this.prisma.$transaction(async tx => {
            for (const item of items) {
                // Подпись и слепок принятого едут одним апдейтом: слепок
                // обновляется и тогда, когда владелец подтянул только
                // варианты, — иначе следующая сверка снова показала бы
                // ему уже применённое.
                if (item.title !== undefined || item.meta !== undefined) {
                    await tx.portalQuestionnaireItem.update({
                        where: { id: item.itemId },
                        data: {
                            ...(item.title === undefined
                                ? {}
                                : { title: item.title }),
                            ...(item.meta === undefined
                                ? {}
                                : { meta: this.toJson(item.meta) }),
                            updatedAt: now,
                        },
                    });
                }
                for (const option of item.renamedOptions) {
                    await tx.portalQuestionnaireItemOption.update({
                        where: { id: option.optionId },
                        data: { title: option.title, updatedAt: now },
                    });
                }
                for (const option of item.newOptions) {
                    // uuid ставим сами: колонка объявлена без дефолта.
                    await tx.portalQuestionnaireItemOption.create({
                        data: {
                            id: randomUUID(),
                            itemId: item.itemId,
                            code: option.code,
                            title: option.title,
                            bitrixId: option.bitrixId,
                            xmlId: option.xmlId,
                            sort: option.sort,
                            isDefault: false,
                            isActive: true,
                            createdAt: now,
                            updatedAt: now,
                        },
                    });
                }
            }
            await tx.portalQuestionnaire.update({
                where: { id: questionnaireId },
                data: { version: { increment: 1 }, updatedAt: now },
            });
        });
    }

    private toRecord(row: QuestionnaireRow): PortalQuestionnaireRecord {
        return {
            id: row.id,
            portalId: Number(row.portal_id),
            domain: row.domain,
            appCode: row.appCode,
            code: row.code,
            title: row.title,
            hint: row.hint,
            purpose: row.purpose,
            presentation: row.presentation,
            place: row.place,
            persist: row.persist,
            conditions: this.toJsonArray(row.conditions),
            configKey: row.configKey,
            legacyChecklistId: row.legacyChecklistId,
            isActive: row.isActive,
            sort: row.sort,
            version: row.version,
            updatedBy: row.updatedBy === null ? null : Number(row.updatedBy),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            items: row.items.map(item => this.toItemRecord(item)),
        };
    }

    private toItemRecord(
        row: QuestionnaireItemRow,
    ): PortalQuestionnaireItemRecord {
        return {
            id: row.id,
            questionnaireId: row.questionnaireId,
            portalId: Number(row.portal_id),
            code: row.code,
            title: row.title,
            placeholder: row.placeholder,
            hint: row.hint,
            groupTitle: row.groupTitle,
            sort: row.sort,
            control: row.control,
            isMultiple: row.isMultiple,
            isRequired: row.isRequired,
            requireChange: row.requireChange,
            staleAfterDays: row.staleAfterDays,
            channel: row.channel,
            targetMode: row.targetMode,
            targetEntity: row.targetEntity,
            dtoPath: row.dtoPath,
            smartId: row.smartId === null ? null : Number(row.smartId),
            smartEntityTypeId:
                row.smartEntityTypeId === null
                    ? null
                    : Number(row.smartEntityTypeId),
            isNative: row.isNative,
            fieldName: row.fieldName,
            fieldBitrixId:
                row.fieldBitrixId === null ? null : Number(row.fieldBitrixId),
            fieldXmlId: row.fieldXmlId,
            fieldCode: row.fieldCode,
            fieldType: row.fieldType,
            fieldStatus: row.fieldStatus,
            fieldCheckedAt: row.fieldCheckedAt,
            meta: this.toJsonObject(row.meta),
            isActive: row.isActive,
            options: row.options.map(option => this.toOptionRecord(option)),
        };
    }

    private toOptionRecord(
        row: QuestionnaireOptionRow,
    ): PortalQuestionnaireOptionRecord {
        return {
            id: row.id,
            code: row.code,
            title: row.title,
            bitrixId: row.bitrixId,
            xmlId: row.xmlId,
            sort: row.sort,
            isDefault: row.isDefault,
            isActive: row.isActive,
        };
    }

    /** Мусор в JSON-колонке-массиве не роняет чтение: не массив → []. */
    private toJsonArray(value: Prisma.JsonValue | null | undefined): unknown[] {
        return Array.isArray(value) ? value : [];
    }

    /** Мусор в JSON-колонке-объекте не роняет чтение: не объект → {}. */
    private toJsonObject(
        value: Prisma.JsonValue | null | undefined,
    ): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    private toJson(value: unknown): Prisma.InputJsonValue {
        return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    }
}
