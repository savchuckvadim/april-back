import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
    EnumQuestionnaireChannel,
    EnumQuestionnaireControl,
    EnumQuestionnaireFieldStatus,
    EnumQuestionnaireTargetMode,
    PortalQuestionnaireItemCheckInput,
    PortalQuestionnaireItemRecord,
    PortalQuestionnaireOptionCheckInput,
    PortalQuestionnaireOptionRecord,
    PortalQuestionnairesService,
    QUESTIONNAIRE_AUTO_FIELD_SOURCES,
    QUESTIONNAIRE_FIELD_BOUND_CHANNELS,
    QuestionnaireFieldMirrorState,
    findQuestionnaireMirrorOption,
    isSameQuestionnaireFieldTitle,
    readQuestionnaireFieldMirror,
    writeQuestionnaireFieldMirror,
} from '@lib/portal-lib/store/questionnaires';
import { toPortalQuestionnaireDto } from '@lib/portal-lib/store/questionnaires/portal-questionnaires.dto';
import { EnumQuestionnaireFieldSource } from '../dto/questionnaire-field-source.dto';
import {
    QuestionnaireCheckDiffDto,
    QuestionnaireCheckItemDto,
    QuestionnaireCheckResponseDto,
    QuestionnaireTitleDiffDto,
} from '../dto/questionnaire-check.dto';
import {
    QuestionnaireFieldSource,
    QuestionnaireFieldSourceService,
} from './questionnaire-field-source.service';
import {
    QuestionnaireBitrix,
    QuestionnaireBitrixFieldsReader,
    QuestionnaireLiveField,
    QuestionnaireLiveFieldItem,
    QuestionnaireLiveFields,
} from './questionnaire-bitrix-fields.reader';

/**
 * Наш вариант справочника рядом с элементом живого списка (или без него —
 * значит, в Битриксе его больше нет). Один и тот же разбор кормит и
 * запись (`syncOptions`), и отчёт владельцу (`buildDiff`): считать
 * совпадения дважды разными правилами — верный способ показать одно, а
 * записать другое.
 */
interface QuestionnaireOptionMatch {
    option: PortalQuestionnaireOptionRecord;
    live: QuestionnaireLiveFieldItem | undefined;
}

/**
 * Носитель, в котором может лежать поле вопроса. Одного `entity` мало:
 * смартов у портала много, и «поля смарта» без указания КАКОГО — это
 * поиск в чужом справочнике.
 */
interface QuestionnaireCheckTarget {
    entity: EnumQuestionnaireFieldSource;
    /** Строка `smarts` НАШЕЙ БД; null — штатная сущность CRM. */
    smartId: number | null;
}

/**
 * Порядок автоподбора носителя ответа: компания → сделка → лид. Список
 * берётся из реестра — тем же самым валидация на сохранении проверяет, что
 * выбранное поле вообще достижимо, и разъехаться им нельзя.
 */
const AUTO_SOURCES: EnumQuestionnaireFieldSource[] =
    QUESTIONNAIRE_AUTO_FIELD_SOURCES;

/** Пользовательские поля CRM всегда с этим префиксом. */
const CRM_FIELD_PREFIX = 'UF_CRM_';

/**
 * Сверка привязок анкеты с живым Битриксом — ПО КНОПКЕ, не по расписанию.
 *
 * Кроном это делать нельзя: проверка ходит в Битрикс портала и меняет
 * состав того, что видит менеджер. Владелец должен нажать кнопку сам и
 * увидеть результат — иначе анкета «сама» опустеет ночью, и объяснить это
 * будет нечем.
 *
 * Главное правило degraded-режима: если поля читались урезанным способом
 * (`crm.item.fields`, без прав администратора CRM), статус вопроса НЕ
 * меняется — обновляется только отметка проверки. Поставить `missing` по
 * неполным данным значит выбросить вопрос из работающей анкеты и обвинить
 * в этом портал.
 */
@Injectable()
export class QuestionnaireCheckService {
    private readonly logger = new Logger(QuestionnaireCheckService.name);

    constructor(
        private readonly questionnaires: PortalQuestionnairesService,
        private readonly sourceService: QuestionnaireFieldSourceService,
        private readonly reader: QuestionnaireBitrixFieldsReader,
    ) {}

    async check(
        portalId: number,
        id: string,
    ): Promise<QuestionnaireCheckResponseDto> {
        const record = await this.questionnaires.getById(id);
        if (record.portalId !== portalId) {
            throw new NotFoundException(
                `Анкета ${id} не принадлежит порталу ${portalId}`,
            );
        }

        const checkable = record.items.filter(item => this.isCheckable(item));
        if (checkable.length === 0) {
            return {
                questionnaire: toPortalQuestionnaireDto(record),
                items: [],
                degraded: false,
            };
        }

        const domain = await this.sourceService.requireDomain(portalId);
        const sources = await this.sourceService.listSources(portalId);
        const bitrix = await this.reader.connect(domain);
        const live = await this.readNeeded(bitrix, sources, checkable);

        const checkedAt = new Date();
        const results: PortalQuestionnaireItemCheckInput[] = [];
        const report: QuestionnaireCheckItemDto[] = [];
        for (const item of checkable) {
            const { result, summary } = this.checkItem(item, live, checkedAt);
            results.push(result);
            report.push(summary);
        }

        const questionnaire = await this.questionnaires.applyFieldCheck(
            id,
            results,
        );
        const degraded = [...live.values()].some(entry => entry.degraded);
        const error = [...live.values()].find(entry => entry.error)?.error;
        this.logger.log(
            `Привязки анкеты ${record.appCode}/${record.code} портала ` +
                `${portalId} (${domain}) сверены: вопросов ` +
                `${checkable.length}${degraded ? ', режим неполный' : ''}`,
        );

        return {
            questionnaire: toPortalQuestionnaireDto(questionnaire),
            items: report,
            degraded,
            ...(error ? { error } : {}),
        };
    }

    /**
     * Проверяем только то, что вообще привязано к пользовательскому полю:
     * ответы в отчёт и в комментарий поля не имеют, а штатные поля
     * (OPPORTUNITY) не пользовательские — в userfieldconfig их нет, и
     * «пропажу» им объявлять нельзя.
     *
     * Каналы с полем перечислены реестром (`crm` и `smart`) — тем же, по
     * которому админка считает сломанные привязки: разъедься они, сверка
     * чинила бы одно, а бэйдж показывал другое.
     */
    private isCheckable(item: PortalQuestionnaireItemRecord): boolean {
        return (
            QUESTIONNAIRE_FIELD_BOUND_CHANNELS.includes(
                item.channel as EnumQuestionnaireChannel,
            ) &&
            !item.isNative &&
            !!item.fieldName
        );
    }

    /** Читаем ровно те носители, которые нужны вопросам анкеты. */
    private async readNeeded(
        bitrix: QuestionnaireBitrix,
        sources: QuestionnaireFieldSource[],
        items: PortalQuestionnaireItemRecord[],
    ): Promise<Map<string, QuestionnaireLiveFields>> {
        const needed = new Map<string, QuestionnaireCheckTarget>();
        for (const item of items) {
            for (const target of this.candidates(item)) {
                needed.set(this.targetKey(target), target);
            }
        }

        const live = new Map<string, QuestionnaireLiveFields>();
        for (const [key, target] of needed) {
            const source = this.findSource(sources, target);
            if (!source) continue;
            live.set(key, await this.reader.readFields(bitrix, source));
        }
        return live;
    }

    /**
     * Носитель среди источников портала. Смарт ищем ПО smartId, а не по
     * типу: смартов много, и первый попавшийся — это чужой справочник.
     */
    private findSource(
        sources: QuestionnaireFieldSource[],
        target: QuestionnaireCheckTarget,
    ): QuestionnaireFieldSource | undefined {
        if (target.smartId !== null) {
            return sources.find(row => row.smartId === target.smartId);
        }
        return sources.find(
            row => row.entity === target.entity && row.smartId === null,
        );
    }

    /** Ключ носителя: тип плюс смарт — им и различаются два смарта. */
    private targetKey(target: QuestionnaireCheckTarget): string {
        return `${target.entity}:${target.smartId ?? ''}`;
    }

    /** Где может лежать поле этого вопроса. */
    private candidates(
        item: PortalQuestionnaireItemRecord,
    ): QuestionnaireCheckTarget[] {
        // Поле смарт-анкеты лежит ровно в одном носителе — в том смарте,
        // который записан у вопроса. Искать его в компании, сделке и
        // лиде бессмысленно: там его нет и не будет.
        if (
            (item.channel as EnumQuestionnaireChannel) ===
            EnumQuestionnaireChannel.smart
        ) {
            return item.smartId === null
                ? []
                : [
                      {
                          entity: EnumQuestionnaireFieldSource.smart,
                          smartId: item.smartId,
                      },
                  ];
        }
        if (
            (item.targetMode as EnumQuestionnaireTargetMode) ===
                EnumQuestionnaireTargetMode.entity &&
            item.targetEntity
        ) {
            return [
                {
                    entity: item.targetEntity as EnumQuestionnaireFieldSource,
                    smartId: null,
                },
            ];
        }
        return AUTO_SOURCES.map(entity => ({ entity, smartId: null }));
    }

    /** Итог по одному вопросу: что писать в БД и что показать в админке. */
    private checkItem(
        item: PortalQuestionnaireItemRecord,
        live: Map<string, QuestionnaireLiveFields>,
        checkedAt: Date,
    ): {
        result: PortalQuestionnaireItemCheckInput;
        summary: QuestionnaireCheckItemDto;
    } {
        const candidates = this.candidates(item);
        // Носитель, который не прочитался вовсе, считаем неполным: сказать
        // «поля нет» можно, только увидев ВСЕ места, где оно могло быть.
        const degraded = candidates.some(
            target => live.get(this.targetKey(target))?.degraded !== false,
        );
        const field = this.findField(item, candidates, live);

        const base = {
            itemId: item.id,
            itemCode: item.code,
            fieldName: item.fieldName,
        };
        const previous = item.fieldStatus as EnumQuestionnaireFieldStatus;

        // Носителя нет вовсе — у смарт-вопроса не записан смарт (строка
        // из времён, когда адрес смарта не хранился). Искать поле негде,
        // и это именно сломанная привязка, а не неполные данные.
        if (candidates.length === 0) {
            return {
                result: {
                    itemId: item.id,
                    status: EnumQuestionnaireFieldStatus.missing,
                    checkedAt,
                    options: [],
                },
                summary: {
                    ...base,
                    status: EnumQuestionnaireFieldStatus.missing,
                    changed: previous !== EnumQuestionnaireFieldStatus.missing,
                    deactivatedOptions: 0,
                    comment:
                        'У вопроса не записан смарт-носитель — искать поле ' +
                        'негде. Выберите поле заново в редакторе анкеты.',
                    diff: null,
                },
            };
        }

        // Неполные данные — не повод терять поле: только отметка проверки.
        if (degraded) {
            return {
                result: {
                    itemId: item.id,
                    status: null,
                    checkedAt,
                    options: [],
                },
                summary: {
                    ...base,
                    status: previous,
                    changed: false,
                    deactivatedOptions: 0,
                    comment:
                        'Поля читались без прав администратора CRM — ' +
                        'состояние привязки оставлено прежним, обновлена ' +
                        'только отметка проверки.',
                    // Разбор не строим: живых подписей мы не видели, а
                    // сказать «поле переименовали» можно, только увидев его.
                    diff: null,
                },
            };
        }

        // Слепки живого поля: с ними «переименовали в Битриксе»
        // отличается от «владелец назвал вопрос по-своему».
        const mirror = readQuestionnaireFieldMirror(item.meta);

        if (!field) {
            return {
                result: {
                    itemId: item.id,
                    status: EnumQuestionnaireFieldStatus.missing,
                    checkedAt,
                    // Поля нет — правды портала тоже нет. Оставить прежний
                    // слепок значило бы показывать в карточке живое
                    // состояние поля, которого больше не существует.
                    ...(mirror.live === null
                        ? {}
                        : {
                              meta: writeQuestionnaireFieldMirror(item.meta, {
                                  live: null,
                                  accepted: mirror.accepted,
                              }),
                          }),
                    options: [],
                },
                summary: {
                    ...base,
                    status: EnumQuestionnaireFieldStatus.missing,
                    changed: previous !== EnumQuestionnaireFieldStatus.missing,
                    deactivatedOptions: 0,
                    comment:
                        `Поля ${item.fieldName ?? ''} на портале больше ` +
                        'нет: вопрос в каталог не попадёт.',
                    // Поля нет — расхождения сравнивать не с чем.
                    diff: null,
                },
            };
        }

        // Живое состояние поля, каким мы его только что увидели, и слепок
        // ПРИНЯТОГО: пока его нет, принятым считается увиденное сейчас —
        // прежней подписи мы не видели, и объявлять её переименованной не
        // за что. С этого момента настоящие переименования видны.
        const liveState = this.toMirrorState(field, checkedAt);
        const accepted = mirror.accepted ?? liveState;
        const meta = writeQuestionnaireFieldMirror(item.meta, {
            live: liveState,
            accepted,
        });

        // Тип сменился — старый НЕ перезаписываем: иначе следующая же
        // проверка увидит «совпадает» и молча вернёт вопрос в каталог с
        // контролом, который в это поле не пишет.
        if (item.fieldType && item.fieldType !== field.type) {
            return {
                result: {
                    itemId: item.id,
                    status: EnumQuestionnaireFieldStatus.typeChanged,
                    checkedAt,
                    fieldBitrixId: field.bitrixId,
                    fieldXmlId: field.xmlId,
                    meta,
                    options: [],
                },
                summary: {
                    ...base,
                    status: EnumQuestionnaireFieldStatus.typeChanged,
                    changed:
                        previous !== EnumQuestionnaireFieldStatus.typeChanged,
                    deactivatedOptions: 0,
                    comment:
                        `Поле есть, но сменило тип: было ${item.fieldType}, ` +
                        `стало ${field.type}. Выберите тип отображения ` +
                        'заново.',
                    // Варианты не разбираем: у поля чужого типа своего
                    // списка нет, и все наши варианты выглядели бы
                    // «исчезнувшими» — испуг на ровном месте.
                    diff: {
                        title: this.titleDiff(item, field, accepted),
                        newOptions: [],
                        renamedOptions: [],
                        lostOptions: [],
                    },
                },
            };
        }

        const matches = this.matchOptions(item, field);
        const options = this.syncOptions(matches);
        return {
            result: {
                itemId: item.id,
                status: EnumQuestionnaireFieldStatus.ok,
                checkedAt,
                fieldBitrixId: field.bitrixId,
                fieldXmlId: field.xmlId,
                // Тип заполняем, если его не было: привязка старая, а
                // проверять контрол по матрице без типа не по чему.
                ...(item.fieldType ? {} : { fieldType: field.type }),
                meta,
                options,
            },
            summary: {
                ...base,
                status: EnumQuestionnaireFieldStatus.ok,
                changed: previous !== EnumQuestionnaireFieldStatus.ok,
                deactivatedOptions: options.filter(option => !option.isActive)
                    .length,
                diff: this.buildDiff(item, field, matches, accepted),
            },
        };
    }

    /** Живое поле → слепок его состояния на момент этой сверки. */
    private toMirrorState(
        field: QuestionnaireLiveField,
        checkedAt: Date,
    ): QuestionnaireFieldMirrorState {
        return {
            title: field.title,
            type: field.type,
            options: field.items.map(item => ({
                bitrixId: item.id,
                xmlId: item.xmlId,
                title: item.value,
            })),
            at: checkedAt.toISOString(),
        };
    }

    /** Первый носитель из цепочки, где поле нашлось. */
    private findField(
        item: PortalQuestionnaireItemRecord,
        candidates: QuestionnaireCheckTarget[],
        live: Map<string, QuestionnaireLiveFields>,
    ): QuestionnaireLiveField | undefined {
        const key = this.normalize(item.fieldName ?? '');
        if (!key) return undefined;
        for (const target of candidates) {
            const found = live
                .get(this.targetKey(target))
                ?.fields.find(field => this.normalize(field.fieldName) === key);
            if (found) return found;
        }
        return undefined;
    }

    /**
     * Опознание наших вариантов в живом списке. Три ключа подряд:
     * идентификатор элемента → внешний код → подпись. Подпись последняя
     * намеренно: её и переименовывают, а по ней же приходится узнавать
     * вариант, у которого пересоздали список.
     */
    private matchOptions(
        item: PortalQuestionnaireItemRecord,
        field: QuestionnaireLiveField,
    ): QuestionnaireOptionMatch[] {
        return item.options.map(option => ({
            option,
            live:
                field.items.find(
                    live =>
                        option.bitrixId !== null && live.id === option.bitrixId,
                ) ??
                field.items.find(
                    live =>
                        !!option.xmlId &&
                        !!live.xmlId &&
                        live.xmlId === option.xmlId,
                ) ??
                field.items.find(
                    live =>
                        live.value.trim().toLowerCase() ===
                        option.title.trim().toLowerCase(),
                ),
        }));
    }

    /**
     * Варианты справочника: исчезнувшие гасим (`isActive: false`), у
     * оставшихся обновляем идентификатор — именно он уходит в
     * `crm.*.update`, и после пересоздания списка на портале он другой.
     *
     * Ни новых вариантов, ни подписей сюда НЕ попадает: и то и другое
     * уходит владельцу разбором расхождений и применяется его кнопкой.
     * Возвращаем только те строки, которые реально меняются, — писать всё
     * подряд означало бы шуметь в `updated_at` каждой проверкой.
     */
    private syncOptions(
        matches: QuestionnaireOptionMatch[],
    ): PortalQuestionnaireOptionCheckInput[] {
        const changes: PortalQuestionnaireOptionCheckInput[] = [];
        for (const { option, live } of matches) {
            const bitrixId = live?.id ?? option.bitrixId;
            const isActive = live !== undefined;
            if (bitrixId === option.bitrixId && isActive === option.isActive) {
                continue;
            }
            changes.push({ optionId: option.id, bitrixId, isActive });
        }
        return changes;
    }

    /**
     * Разбор расхождений — ДАННЫЕ для владельца, а не действие: подписи он
     * правит под себя («Дата решения» в Битриксе — «Когда клиент примет
     * решение?» в анкете), и затирать их сверкой нельзя. Применяется
     * выбранное отдельной кнопкой (`apply-field-sync`).
     *
     * Варианты разбираем только у списка: у любого другого контрола их
     * взять некуда, а «появившимися» показался бы весь чужой справочник.
     */
    private buildDiff(
        item: PortalQuestionnaireItemRecord,
        field: QuestionnaireLiveField,
        matches: QuestionnaireOptionMatch[],
        accepted: QuestionnaireFieldMirrorState,
    ): QuestionnaireCheckDiffDto {
        const diff: QuestionnaireCheckDiffDto = {
            title: this.titleDiff(item, field, accepted),
            newOptions: [],
            renamedOptions: [],
            lostOptions: [],
        };
        if (
            (item.control as EnumQuestionnaireControl) !==
            EnumQuestionnaireControl.enumeration
        ) {
            return diff;
        }

        const known = new Set<number>();
        for (const { option, live } of matches) {
            if (!live) {
                // Этой же сверкой погашен — в отчёт, применять нечего.
                if (option.isActive) {
                    diff.lostOptions.push({
                        optionId: option.id,
                        code: option.code,
                        title: option.title,
                    });
                }
                continue;
            }
            if (live.id !== null) known.add(live.id);
            // Переименование — это расхождение живой подписи со СЛЕПКОМ, а
            // не с нашей. Подпись варианта владелец правит под менеджера
            // («Прямая» → «Прямые продажи»), и сравнение с ней зажигало бы
            // строку у каждого второго варианта.
            const before = findQuestionnaireMirrorOption(accepted, {
                bitrixId: live.id,
                xmlId: live.xmlId,
            });
            if (before && !isSameQuestionnaireFieldTitle(before.title, live.value)) {
                diff.renamedOptions.push({
                    optionId: option.id,
                    code: option.code,
                    our: option.title,
                    live: live.value,
                    // Идентификатор уже живой: его сверка правит сама.
                    bitrixId: live.id ?? option.bitrixId,
                });
            }
        }

        for (const live of field.items) {
            // Вариант без идентификатора завести нельзя: писать в поле
            // нечем — такой в разбор не попадает вовсе.
            if (live.id === null || known.has(live.id)) continue;
            diff.newOptions.push({
                bitrixId: live.id,
                title: live.value,
                xmlId: live.xmlId,
            });
        }
        return diff;
    }

    /**
     * Переименование поля В БИТРИКСЕ; `null` — не переименовывали.
     *
     * Сравнивается живая подпись со СЛЕПКОМ принятого, а не с
     * формулировкой вопроса. Это и есть починка главного шума раздела:
     * авторская формулировка почти всегда другая («Дата решения» в поле
     * против «Когда клиент примет решение?» в анкете), и сравнение с ней
     * зажигало строку у каждого вопроса — настоящее переименование в ней
     * терялось.
     *
     * Наружу при этом уезжает пара «наша формулировка → живая подпись»:
     * подтягивать владелец будет именно её, и видеть он должен то, что
     * заменится.
     */
    private titleDiff(
        item: PortalQuestionnaireItemRecord,
        field: QuestionnaireLiveField,
        accepted: QuestionnaireFieldMirrorState,
    ): QuestionnaireTitleDiffDto | null {
        if (isSameQuestionnaireFieldTitle(accepted.title, field.title)) {
            return null;
        }
        return { our: item.title, live: field.title };
    }

    /** Единая форма UF-имени: верхний регистр и обязательный префикс. */
    private normalize(raw: string): string {
        const value = String(raw ?? '')
            .trim()
            .toUpperCase();
        if (!value) return '';
        return value.startsWith(CRM_FIELD_PREFIX)
            ? value
            : `${CRM_FIELD_PREFIX}${value}`;
    }
}
