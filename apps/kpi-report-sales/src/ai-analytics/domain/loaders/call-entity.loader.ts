/**
 * Загрузчик сущностей звонка (план Фазы 2, поток 13): по транскрипциям
 * из lite-выборки достаёт `entity_type` / `entity_id` записей `ais` —
 * то, на чём держится сцепка «звонок → сделка → эпизод» (§4.1 «Сцепка»).
 *
 * ⚠ call-lib не правится: lite-строка разбора этих полей не несёт, а
 * менять её контракт ради одного потребителя нельзя. Читаем те же записи
 * `ais`, что пишет конвейер разбора (AiService.findByTranscriptionIds),
 * порциями по 500 — IN-список по transcription_id ограничен.
 *
 * `@Injectable` без bitrix-состояния: источник — БД, а не портал.
 */
import { Injectable } from '@nestjs/common';
import { AiEntityDto, AiService } from '@lib/call-lib';
import { BitrixEntityType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import {
    AI_CALL_ENTITY_TYPES,
    type AiCallEntityType,
} from '@lib/sales-ai-analytics';

/** Порция ключей на один запрос (IN по transcription_id ограничен). */
export const AI_CALL_ENTITY_CHUNK = 500;

/** Сущность звонка: на чём он записан в CRM. */
export interface CallEntityRef {
    /** Транскрипция звонка (ключ lite-строки). */
    transcriptionId: string;
    entityType: AiCallEntityType;
    /** Идентификатор сущности строкой — как в эпизодах сделок. */
    entityId: string;
}

/**
 * Значения `entity_type` записей `ais` → типы сцепки. Конвейер разбора
 * пишет конвенцию call-lib ('deal' / 'lead'), она совпадает с
 * BitrixEntityType — берём коды из enum, а не литералами.
 */
const ENTITY_TYPES: Readonly<Record<string, AiCallEntityType>> = {
    [BitrixEntityType.DEAL]: 'deal',
    [BitrixEntityType.LEAD]: 'lead',
    [BitrixEntityType.COMPANY]: 'company',
    [BitrixEntityType.CONTACT]: 'contact',
};

/** Тип сцепки по значению колонки; неизвестное значение — null. */
export function toCallEntityType(value: string): AiCallEntityType | null {
    const code = ENTITY_TYPES[value.trim().toLowerCase()];

    return code && AI_CALL_ENTITY_TYPES.includes(code) ? code : null;
}

/** Запись `ais` → сущность звонка; без типа или id — null. */
export function toCallEntityRef(record: AiEntityDto): CallEntityRef | null {
    const entityType = toCallEntityType(record.entity_type ?? '');
    const entityId = Number(record.entity_id ?? 0);
    const transcriptionId = String(record.transcription_id ?? '');
    if (!entityType || !Number.isFinite(entityId) || entityId <= 0) {
        return null;
    }

    return transcriptionId
        ? { transcriptionId, entityType, entityId: String(entityId) }
        : null;
}

@Injectable()
export class CallEntityLoader {
    constructor(private readonly aiService: AiService) {}

    /**
     * Сущности звонков по транскрипциям. На транскрипцию берётся ПОСЛЕДНЯЯ
     * запись с заполненной сущностью (id записи растёт): разбор мог быть
     * перезапущен, и старая запись указывала бы на прежнюю сделку.
     * Записи чужих порталов отбрасываются — домен в выборке не участвует.
     */
    async load(
        domain: string,
        transcriptionIds: readonly string[],
    ): Promise<Map<string, CallEntityRef>> {
        const ids = [...new Set(transcriptionIds.filter(Boolean))];
        const refs = new Map<string, CallEntityRef>();
        const seen = new Map<string, number>();
        for (let start = 0; start < ids.length; start += AI_CALL_ENTITY_CHUNK) {
            const chunk = ids.slice(start, start + AI_CALL_ENTITY_CHUNK);
            const records = await this.aiService.findByTranscriptionIds(chunk);
            for (const record of records) {
                if (record.domain !== domain) continue;
                const ref = toCallEntityRef(record);
                if (!ref) continue;
                const version = Number(record.id);
                const known = seen.get(ref.transcriptionId);
                if (known !== undefined && known >= version) continue;
                seen.set(
                    ref.transcriptionId,
                    Number.isFinite(version) ? version : 0,
                );
                refs.set(ref.transcriptionId, ref);
            }
        }

        return refs;
    }
}
