import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import {
    EUserFieldType,
    IUserFieldConfig,
    IUserFieldConfigEnumerationItem,
} from '@/modules/bitrix';
import { QuestionnaireFieldSource } from './questionnaire-field-source.service';
import {
    QuestionnaireBitrix,
    QuestionnaireBitrixFieldsReader,
    QuestionnaireLiveField,
} from './questionnaire-bitrix-fields.reader';

/** Что владелец заказал завести в носителе. */
export interface QuestionnaireFieldDraft {
    /** Постфикс UF-имени и xmlId поля; он же ключ повтора. */
    code: string;
    title: string;
    /** `userTypeId` Битрикса. */
    type: string;
    isRequired?: boolean;
    /** Принимается только чтобы отказать словами: анкета такие не берёт. */
    isMultiple?: boolean;
    items?: { title: string; code?: string; sort?: number }[];
}

/** Итог записи: поле, прочитанное из Битрикса уже после неё. */
export interface QuestionnaireFieldWriteResult {
    field: QuestionnaireLiveField;
    /** Поле создано этим вызовом; false — оно уже было. */
    created: boolean;
    /** Чем результат отличается от заказанного. */
    warning?: string;
}

/** Максимальная длина UF-имени по документации Битрикса. */
const MAX_FIELD_NAME_LENGTH = 50;

/** Допустимый алфавит имени поля: только он, и только верхний регистр. */
const FIELD_CODE_PATTERN = /^[A-Z0-9_]+$/;

/** Шаг сортировки значений справочника. */
const ITEM_SORT_STEP = 100;

/**
 * Битрикс отвечает одной и той же фразой и на нехватку прав, и на
 * несуществующий `entityId`. Ловим её по подстрокам, а различаем уже
 * вызовом `user.admin`.
 */
const ACCESS_ERROR_MARKERS = [
    'не можете просматривать настройки',
    'access denied',
    'access_denied',
    'недостаточно прав',
];

/**
 * Запись поля в носитель портала — вторая половина источника полей: читать
 * живой Битрикс админка умела всегда, а заводить поле владелец был обязан
 * руками в карточке смарта.
 *
 * Почему свой сервис, а не эндпоинт установщика: `POST
 * /pbx-smart-field-install/install-fields` адресуется парой
 * «SmartNameEnum + группа», то есть только нашими шаблонными смартами, и
 * обязательно зеркалит поле в `bitrixfields`. Анкете нужен ПРОИЗВОЛЬНЫЙ
 * смарт портала по `smartId` нашей БД и БЕЗ зеркала: переустановка
 * сущности сносит её строки слепка скопом, и поле владельца исчезло бы
 * вместе со смыслом анкеты. Переиспользуется движок (форма payload
 * `InstallConstSmartService.buildFieldPayload`), а не маршрут.
 *
 * Три правила, на которых всё держится:
 *  1) адресует поле ТОЛЬКО `source.ufEntityId` (`CRM_COMPANY`,
 *     `CRM_{id из crm.type.list}`). Подставленный `entityTypeId` Битрикс
 *     встречает фразой про права — диагностика уходит в поиск
 *     несуществующей проблемы с ключом (боевой инцидент 2026-07-21);
 *  2) имя поля и идентификаторы значений списка ЧИТАЮТСЯ ОБРАТНО из
 *     Битрикса, а не выводятся формулой: формула врёт (боевой инцидент
 *     `UF_CRM_94_TRANSCRIPT_1`), а без `id` значения ответ-список
 *     записать некуда;
 *  3) повтор с тем же кодом не заводит дубль: перед записью поле ищется
 *     ПОСТРАНИЧНО (`userfieldconfig.list` отдаёт порядка 50 полей за раз,
 *     и без обхода существующее поле «не нашлось» бы молча).
 *
 * Транзакции между Битриксом и нашей БД нет, поэтому порядок один:
 * сначала Битрикс, потом наша запись. При падении нашей записи поле в
 * Битриксе останется, и повторный заход подхватит его как существующее —
 * обратный порядок дал бы вопрос, ссылающийся на несуществующее поле.
 */
@Injectable()
export class QuestionnaireFieldWriter {
    private readonly logger = new Logger(QuestionnaireFieldWriter.name);

    constructor(private readonly reader: QuestionnaireBitrixFieldsReader) {}

    /** Завести поле в носителе (или вернуть уже заведённое с тем же кодом). */
    async create(
        bitrix: QuestionnaireBitrix,
        source: QuestionnaireFieldSource,
        draft: QuestionnaireFieldDraft,
    ): Promise<QuestionnaireFieldWriteResult> {
        const entityId = this.requireEntityId(source);
        const code = this.requireCode(draft.code);
        const title = this.requireTitle(draft.title);
        const userTypeId = this.requireType(draft.type, draft.isMultiple);
        const fieldName = this.buildFieldName(entityId, code);
        const items = this.buildItems(userTypeId, code, draft.items);

        const existing = await this.findExisting(bitrix, entityId, fieldName);
        if (existing) {
            const field = await this.readBack(
                bitrix,
                existing.id,
                existing,
                fieldName,
            );
            return {
                field,
                created: false,
                warning: this.describeExisting(field, userTypeId),
            };
        }

        const payload: Partial<IUserFieldConfig> = {
            entityId,
            fieldName,
            userTypeId,
            // Множественность анкете не годится, и «как в черновике» здесь
            // писать нельзя: черновик её и не принимает.
            multiple: 'N',
            mandatory: draft.isRequired ? 'Y' : 'N',
            showFilter: 'Y',
            showInList: 'Y',
            editInList: 'Y',
            isSearchable: 'Y',
            // xmlId — стабильный код: он переживает переименование подписи
            // в Битриксе, по нему вопрос и опознаёт своё поле.
            xmlId: code,
            editFormLabel: { ru: title },
            listColumnLabel: { ru: title },
            listFilterLabel: { ru: title },
            ...(items.length > 0 ? { enum: items } : {}),
        };

        const added = await this.call(
            bitrix,
            () =>
                bitrix.userFieldConfig.add({ moduleId: 'crm', field: payload }),
            `Поле ${fieldName} не создано`,
        );
        const addedField = added?.result?.field;
        this.logger.log(
            `Поле ${fieldName} создано в ${entityId} ` +
                `(id ${String(addedField?.id ?? 'неизвестен')})`,
        );

        const field = await this.readBack(
            bitrix,
            addedField?.id,
            addedField,
            fieldName,
        );
        return {
            field,
            created: true,
            warning: this.describeCreated(field, userTypeId, items.length),
        };
    }

    /**
     * Поле с таким именем среди уже заведённых; `undefined` — имя свободно.
     *
     * Читаем `getAll`, а не `getAllWithItems`: значения списка нужны ровно
     * у одного поля, и дотягивать их для каждого списочного поля носителя
     * значит выложить лишние десятки запросов (на смарте с 60 списками —
     * плюс полминуты на ровном месте). Значения найденного поля дочитает
     * `readBack` одним `get`.
     */
    private async findExisting(
        bitrix: QuestionnaireBitrix,
        entityId: string,
        fieldName: string,
    ): Promise<IUserFieldConfig | undefined> {
        const fields = await this.call(
            bitrix,
            () => bitrix.userFieldConfig.getAll('crm', { entityId }),
            'Список полей носителя не прочитан',
        );
        const needle = fieldName.toUpperCase();
        return fields.find(
            field => String(field.fieldName ?? '').toUpperCase() === needle,
        );
    }

    /**
     * Правда портала после записи: `userfieldconfig.get` по id.
     *
     * В отличие от `list`, он отдаёт `enum` с идентификаторами значений —
     * именно они уходят в `crm.item.update`, и вопрос-список без них
     * собрать нельзя. Ответ самой записи оставляем запасным вариантом:
     * поле уже создано, и падать на чтении назад значило бы отдать
     * владельцу ошибку вместо созданного поля.
     */
    private async readBack(
        bitrix: QuestionnaireBitrix,
        id: string | number | undefined,
        fallback: IUserFieldConfig | undefined,
        fieldName: string,
    ): Promise<QuestionnaireLiveField> {
        if (id !== undefined && id !== null) {
            try {
                const response = await bitrix.userFieldConfig.get({
                    moduleId: 'crm',
                    id,
                });
                const live = response?.result?.field;
                if (live?.fieldName) return this.reader.toLiveField(live);
            } catch (error) {
                this.logger.warn(
                    `Поле ${fieldName} записано, но перечитать его не ` +
                        `удалось: ${this.describeError(error)}`,
                );
            }
        }
        if (fallback?.fieldName) return this.reader.toLiveField(fallback);

        throw new ServiceUnavailableException(
            `Битрикс принял поле ${fieldName}, но не вернул его настройки. ` +
                'Обновите список полей: повторный вызов дубля не создаст.',
        );
    }

    /** `entityId` для userfieldconfig; без него поле заводить некуда. */
    private requireEntityId(source: QuestionnaireFieldSource): string {
        if (source.ufEntityId) return source.ufEntityId;
        throw new BadRequestException(
            source.warning ??
                'У носителя не известен идентификатор типа CRM — ' +
                    'создавать поле негде',
        );
    }

    /** Код поля: алфавит имени UF задан документацией, а не нашим вкусом. */
    private requireCode(raw: string): string {
        const code = String(raw ?? '')
            .trim()
            .toUpperCase();
        if (!code) {
            throw new BadRequestException(
                'Не указан код поля: из него собирается имя UF, по которому ' +
                    'анкета и находит поле',
            );
        }
        if (!FIELD_CODE_PATTERN.test(code)) {
            throw new BadRequestException(
                `Код поля «${raw}» Битрикс не примет: в имени UF допустимы ` +
                    'только латинские буквы, цифры и подчёркивание',
            );
        }
        return code;
    }

    private requireTitle(raw: string): string {
        const title = String(raw ?? '').trim();
        if (!title) {
            throw new BadRequestException(
                'Не указана подпись поля: с пустой подписью его не найти ' +
                    'ни в карточке портала, ни в списке выбора',
            );
        }
        return title;
    }

    /** Тип поля: и множественность, и «анкета такое не заполняет» — здесь. */
    private requireType(raw: string, isMultiple?: boolean): EUserFieldType {
        if (isMultiple) {
            throw new BadRequestException(
                'Множественное поле анкете не годится: ответ записался бы в ' +
                    'первый элемент и исчез — заведите одиночное поле',
            );
        }
        const type = String(raw ?? '').trim();
        const known = Object.values(EUserFieldType).find(
            value => String(value) === type,
        );
        if (!known) {
            throw new BadRequestException(
                `Битрикс не знает типа поля «${raw}»: тип берётся из матрицы ` +
                    '«тип поля → типы отображения» реестра анкет',
            );
        }
        return known;
    }

    /**
     * Имя поля: `UF_{идентификатор объекта}_{постфикс}`, не длиннее 50
     * символов вместе с префиксом (документация Битрикса). Длину считаем
     * сами: обрезанное имя Битрикс ошибкой не вернёт, а анкета получила бы
     * поле, которого потом не найдёт.
     */
    private buildFieldName(entityId: string, code: string): string {
        const fieldName = `UF_${entityId}_${code}`;
        if (fieldName.length > MAX_FIELD_NAME_LENGTH) {
            const extra = fieldName.length - MAX_FIELD_NAME_LENGTH;
            throw new BadRequestException(
                `Имя поля ${fieldName} длиннее ${MAX_FIELD_NAME_LENGTH} ` +
                    'символов — Битрикс такое не примет. Сократите код поля ' +
                    `на ${extra} символ(ов)`,
            );
        }
        return fieldName;
    }

    /**
     * Значения справочника. Коды уникальны: одинаковые xmlId у двух
     * значений означают, что сверка привязок опознала бы их как одно.
     */
    private buildItems(
        userTypeId: EUserFieldType,
        fieldCode: string,
        items: QuestionnaireFieldDraft['items'],
    ): IUserFieldConfigEnumerationItem[] {
        if (userTypeId !== EUserFieldType.ENUMERATION) return [];

        const list = items ?? [];
        if (list.length === 0) {
            throw new BadRequestException(
                'Поле-список без значений: выбирать менеджеру будет не из ' +
                    'чего — добавьте варианты ответа',
            );
        }

        const taken = new Set<string>();
        return list.map((item, index) => {
            const title = String(item.title ?? '').trim();
            if (!title) {
                throw new BadRequestException(
                    `Значение №${index + 1} без подписи: менеджер выбирает ` +
                        'подпись, а не код',
                );
            }
            const code = this.requireItemCode(item.code, fieldCode, index);
            if (taken.has(code)) {
                throw new BadRequestException(
                    `Код значения «${code}» повторяется: по нему вопрос ` +
                        'опознаёт вариант, и двух одинаковых быть не может',
                );
            }
            taken.add(code);

            return {
                value: title,
                def: 'N',
                sort: item.sort ?? (index + 1) * ITEM_SORT_STEP,
                xmlId: code,
            };
        });
    }

    private requireItemCode(
        raw: string | undefined,
        fieldCode: string,
        index: number,
    ): string {
        const code = String(raw ?? '')
            .trim()
            .toUpperCase();
        if (!code) return `${fieldCode}_${index + 1}`;
        if (!FIELD_CODE_PATTERN.test(code)) {
            throw new BadRequestException(
                `Код значения «${raw}» не годится: допустимы латинские ` +
                    'буквы, цифры и подчёркивание',
            );
        }
        return code;
    }

    /** Что стоит сказать владельцу о только что созданном поле. */
    private describeCreated(
        field: QuestionnaireLiveField,
        userTypeId: EUserFieldType,
        itemCount: number,
    ): string | undefined {
        if (field.type !== String(userTypeId)) {
            return (
                `Битрикс завёл поле типа «${field.type}», а не ` +
                `«${String(userTypeId)}» — проверьте тип отображения вопроса`
            );
        }
        if (itemCount > 0 && field.items.some(item => item.id === null)) {
            return (
                'Идентификаторы значений списка не прочитались: в CRM уходит ' +
                'именно id значения. Проверьте права администратора CRM у ' +
                'ключа портала и обновите список полей'
            );
        }
        if (itemCount > 0 && field.items.length !== itemCount) {
            return (
                `Заказано значений: ${itemCount}, в Битриксе их ` +
                `${field.items.length} — сверьте список в карточке портала`
            );
        }
        return undefined;
    }

    /**
     * Поле с таким кодом уже было. Настройки ему НЕ правим: `update`
     * меняет не всё (тип и множественность — никогда), а молча
     * перекраивать поле, в котором уже лежат ответы менеджеров, нельзя.
     * Говорим владельцу, чем найденное отличается от заказанного.
     */
    private describeExisting(
        field: QuestionnaireLiveField,
        userTypeId: EUserFieldType,
    ): string {
        const head =
            `Поле ${field.fieldName} в носителе уже было — взяли его, ` +
            'дубль не создавали.';
        if (field.multiple) {
            return (
                `${head} Оно множественное: ответ записался бы в первый ` +
                'элемент и исчез — для анкеты заведите одиночное поле с ' +
                'другим кодом'
            );
        }
        if (field.type !== String(userTypeId)) {
            return (
                `${head} Тип у него «${field.type}», а заказан ` +
                `«${String(userTypeId)}»: сменить тип поля Битрикс не даёт, ` +
                'заведите поле с другим кодом'
            );
        }
        return head;
    }

    /**
     * Один поход в Битрикс с человеческим разбором отказа.
     *
     * `userfieldconfig.*` доступен ТОЛЬКО администратору CRM, и на записи
     * фолбэка нет в принципе: `crm.item.fields` умеет лишь читать. Поэтому
     * нехватка прав — это отказ с готовым рецептом, а не degraded-режим,
     * как у чтения полей.
     */
    private async call<T>(
        bitrix: QuestionnaireBitrix,
        action: () => Promise<T>,
        what: string,
    ): Promise<T> {
        try {
            return await action();
        } catch (error) {
            const message = this.describeError(error);
            this.logger.warn(`${what}: ${message}`);
            if (this.isAccessError(message)) {
                throw new ForbiddenException(
                    `${what}: ${await this.describeAccess(bitrix)}`,
                );
            }
            throw new ServiceUnavailableException(`${what}: ${message}`);
        }
    }

    private isAccessError(message: string): boolean {
        const lower = message.toLowerCase();
        return ACCESS_ERROR_MARKERS.some(marker => lower.includes(marker));
    }

    /** Права ключа: `user.admin` тем же ключом — как в установщике смартов. */
    private async describeAccess(bitrix: QuestionnaireBitrix): Promise<string> {
        const isAdmin = await this.checkKeyIsAdmin(bitrix);
        if (isAdmin === false) {
            return (
                'Битрикс не пустил к настройкам полей (userfieldconfig), а ' +
                'user.admin=false — вебхук портала создан НЕ ' +
                'администратором. Пересоздайте вебхук от имени ' +
                'администратора портала и повторите.'
            );
        }
        if (isAdmin === true) {
            return (
                'Битрикс не пустил к настройкам полей (userfieldconfig), ' +
                'хотя user.admin=true — проверьте у вебхука право ' +
                '`userfieldconfig` и права администратора CRM.'
            );
        }
        return (
            'Битрикс не пустил к настройкам полей (userfieldconfig), а ' +
            'проверить права ключа (user.admin) не удалось. Нужен вебхук от ' +
            'имени администратора портала.'
        );
    }

    /** true/false; null — метод недоступен, значит и вывода делать нельзя. */
    private async checkKeyIsAdmin(
        bitrix: QuestionnaireBitrix,
    ): Promise<boolean | null> {
        try {
            // Типизированная сущность библиотеки, а не сырой api.call:
            // правило репозитория — apps/* ходят в Битрикс только через
            // @workspace/bitrix, метод дописан там же (BxUserService.isAdmin).
            const response = (await bitrix.user.isAdmin()) as {
                result?: boolean;
            };
            return typeof response?.result === 'boolean'
                ? response.result
                : null;
        } catch (error) {
            this.logger.warn(
                `user.admin не выполнен: ${this.describeError(error)}`,
            );
            return null;
        }
    }

    private describeError(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
