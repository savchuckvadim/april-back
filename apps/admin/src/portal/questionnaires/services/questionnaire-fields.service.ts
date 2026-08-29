import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/prisma';
import { PortalQuestionnairesService } from '@lib/portal-lib/store/questionnaires';
import {
    EnumQuestionnaireFieldSource,
    QuestionnaireFieldSourceDto,
    QuestionnaireFieldSourcesResponseDto,
} from '../dto/questionnaire-field-source.dto';
import {
    QuestionnaireFieldDto,
    QuestionnaireFieldUsageDto,
    QuestionnaireFieldsResponseDto,
} from '../dto/questionnaire-field.dto';
import {
    QuestionnaireFieldCreateDto,
    QuestionnaireFieldCreateResponseDto,
} from '../dto/questionnaire-field-create.dto';
import {
    QuestionnaireFieldSource,
    QuestionnaireFieldSourceService,
} from './questionnaire-field-source.service';
import {
    QuestionnaireBitrixFieldsReader,
    QuestionnaireLiveField,
} from './questionnaire-bitrix-fields.reader';
import { QuestionnaireFieldWriter } from './questionnaire-field-writer';

/** Пользовательские поля CRM всегда с этим префиксом. */
const CRM_FIELD_PREFIX = 'UF_CRM_';

/** Строка слепка `bitrixfields`, урезанная до нужного. */
interface SnapshotField {
    /** Может лежать и с префиксом, и без него — см. {@link normalize}. */
    bitrixId: string;
    code: string;
}

/**
 * Источник полей для редактора анкет: что владелец портала завёл в
 * Битриксе руками.
 *
 * Ради этого «руками» здесь и стоит левое соединение со слепком
 * `bitrixfields`: `inPortalDb: false` = поля нет у установщика, значит его
 * завёл человек — ровно то, из чего собирается анкета. Обратная сторона:
 * строку в слепок для такого поля мы НЕ создаём никогда. Переустановка
 * сущности зовёт `deleteFieldsByEntityId`, который сносит ВСЕ её строки
 * скопом — вместе с ними исчез бы и смысл анкеты. Поэтому анкета держится
 * за поле мягко, по имени.
 */
@Injectable()
export class QuestionnaireFieldsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly sourceService: QuestionnaireFieldSourceService,
        private readonly reader: QuestionnaireBitrixFieldsReader,
        private readonly questionnaires: PortalQuestionnairesService,
        private readonly writer: QuestionnaireFieldWriter,
    ) {}

    /** Носители полей портала для списка выбора. */
    async listSources(
        portalId: number,
    ): Promise<QuestionnaireFieldSourcesResponseDto> {
        const domain = await this.sourceService.requireDomain(portalId);
        const sources = await this.sourceService.listSources(portalId);
        return {
            domain,
            sources: sources.map(source => this.toSourceDto(source)),
        };
    }

    /** Живые поля носителя с отметками «есть в слепке» и «уже в анкете». */
    async listFields(
        portalId: number,
        entity: EnumQuestionnaireFieldSource,
        smartId?: number,
        onlyManual = false,
    ): Promise<QuestionnaireFieldsResponseDto> {
        const domain = await this.sourceService.requireDomain(portalId);
        const source = await this.sourceService.resolveSource(
            portalId,
            entity,
            smartId,
        );

        const bitrix = await this.reader.connect(domain);
        const live = await this.reader.readFields(bitrix, source);
        const snapshot = await this.loadSnapshot(source);
        const usage = await this.loadUsage(portalId);

        const fields: QuestionnaireFieldDto[] = [];
        for (const field of live.fields) {
            const inPortalDb = snapshot.has(this.normalize(field.fieldName));
            if (onlyManual && inPortalDb) continue;
            fields.push(this.toFieldDto(field, snapshot, usage));
        }

        return {
            source: this.toSourceDto(source),
            fields,
            degraded: live.degraded,
            ...(live.error ? { error: live.error } : {}),
        };
    }

    /**
     * Завести поле в носителе и вернуть его В ТОМ ЖЕ ВИДЕ, что и список
     * полей: имя и идентификаторы значений прочитаны из Битрикса после
     * записи, поэтому админка собирает из ответа вопрос без второго
     * запроса.
     *
     * Порядок жёсткий: сначала Битрикс, потом наши отметки. Строку в
     * слепок `bitrixfields` не создаём НИКОГДА — переустановка сущности
     * зовёт `deleteFieldsByEntityId` и сносит её строки скопом, а поле
     * владельца обязано пережить переустановку. Поэтому у созданного поля
     * `inPortalDb: false`, и это не оплошность, а признак «поле завели
     * под анкету, установщик его не знает».
     *
     * Ручка долгая: список полей носителя + запись + чтение назад. На
     * тарифе regular (ведро 50, два запроса в секунду) это секунды, на
     * большом портале — десятки. Клиенту нужен свой таймаут и запрет
     * второго нажатия: повтор безопасен (дубль не заведётся), но ждать
     * владелец будет вдвое дольше.
     */
    async createField(
        portalId: number,
        dto: QuestionnaireFieldCreateDto,
    ): Promise<QuestionnaireFieldCreateResponseDto> {
        const domain = await this.sourceService.requireDomain(portalId);
        const source = await this.sourceService.resolveSource(
            portalId,
            dto.entity,
            dto.smartId,
        );

        const bitrix = await this.reader.connect(domain);
        const written = await this.writer.create(bitrix, source, {
            code: dto.code,
            title: dto.title,
            type: dto.type,
            isRequired: dto.isRequired,
            isMultiple: dto.isMultiple,
            items: dto.items,
        });

        const snapshot = await this.loadSnapshot(source);
        const usage = await this.loadUsage(portalId);

        return {
            source: this.toSourceDto(source),
            field: this.toFieldDto(written.field, snapshot, usage),
            created: written.created,
            ...(written.warning ? { warning: written.warning } : {}),
        };
    }

    /**
     * Живое поле → строка списка выбора.
     *
     * Один разбор и для чтения, и для только что созданного поля: два
     * означали бы, что созданное поле выглядит в админке иначе, чем то же
     * самое поле, прочитанное следующим запросом.
     */
    private toFieldDto(
        field: QuestionnaireLiveField,
        snapshot: Map<string, SnapshotField>,
        usage: Map<string, QuestionnaireFieldUsageDto[]>,
    ): QuestionnaireFieldDto {
        const key = this.normalize(field.fieldName);
        const portalField = snapshot.get(key);
        return {
            fieldName: field.fieldName,
            title: field.title,
            type: field.type,
            multiple: field.multiple,
            mandatory: field.mandatory,
            bitrixId: field.bitrixId,
            xmlId: field.xmlId,
            items: field.items,
            inPortalDb: portalField !== undefined,
            portalCode: portalField?.code ?? null,
            usedIn: usage.get(key) ?? [],
        };
    }

    /**
     * Слепок полей сущности: ключ — нормализованное UF-имя.
     *
     * Нормализация обязательна с ОБЕИХ сторон: `bitrixfields.bitrixId`
     * неоднороден исторически. Установщик штатных сущностей пишет туда
     * суффикс из Excel (`OP_CLIENT_TYPE`), установщик смартов — полное имя
     * (`UF_CRM_7_ZPR_LEAD`), а конструктор — тоже полное. Сравнение «в лоб»
     * пометило бы половину установленных полей как заведённые вручную.
     */
    private async loadSnapshot(
        source: QuestionnaireFieldSource,
    ): Promise<Map<string, SnapshotField>> {
        const snapshot = new Map<string, SnapshotField>();
        if (source.snapshotEntityId === null) return snapshot;

        const rows = await this.prisma.bitrixfields.findMany({
            where: {
                entity_type: source.snapshotEntityType,
                entity_id: BigInt(source.snapshotEntityId),
            },
            select: { bitrixId: true, code: true },
        });
        for (const row of rows) {
            // bitrixfields.bitrixId — String, а bitrixfield_items.bitrixId —
            // Int: приводим явно, чтобы сравнение не зависело от колонки.
            const key = this.normalize(String(row.bitrixId));
            if (!key) continue;
            snapshot.set(key, {
                bitrixId: String(row.bitrixId),
                code: row.code,
            });
        }
        return snapshot;
    }

    /** Где поля портала уже используются: ключ — нормализованное UF-имя. */
    private async loadUsage(
        portalId: number,
    ): Promise<Map<string, QuestionnaireFieldUsageDto[]>> {
        const usage = new Map<string, QuestionnaireFieldUsageDto[]>();
        const records = await this.questionnaires.listByPortal(portalId);
        for (const record of records) {
            for (const item of record.items) {
                const key = this.normalize(item.fieldName ?? '');
                if (!key) continue;
                const list = usage.get(key) ?? [];
                list.push({
                    questionnaireId: record.id,
                    questionnaireCode: record.code,
                    questionnaireTitle: record.title,
                    itemCode: item.code,
                    itemTitle: item.title,
                });
                usage.set(key, list);
            }
        }
        return usage;
    }

    /**
     * Единая форма UF-имени для сравнения: верхний регистр и обязательный
     * префикс. Пустая строка означает «сравнивать не с чем».
     */
    private normalize(raw: string): string {
        const value = String(raw ?? '')
            .trim()
            .toUpperCase();
        if (!value) return '';
        return value.startsWith(CRM_FIELD_PREFIX)
            ? value
            : `${CRM_FIELD_PREFIX}${value}`;
    }

    private toSourceDto(
        source: QuestionnaireFieldSource,
    ): QuestionnaireFieldSourceDto {
        return {
            entity: source.entity,
            smartId: source.smartId,
            entityTypeId: source.entityTypeId,
            bitrixId: source.bitrixId,
            title: source.title,
            ...(source.warning ? { warning: source.warning } : {}),
        };
    }
}
