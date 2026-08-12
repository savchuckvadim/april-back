import { Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';

/**
 * UF-поля лидогена «Гарант», заполняемые ТОЛЬКО у заявок с сайта
 * (Код партнёра, Оценка). Имена подтверждены исследованием реального
 * портала; если у портала другие — detect() логирует все заполненные
 * UF_CRM_* поля лида, чтобы имена можно было добрать из логов.
 */
export const LEAD_REQUEST_UF_FIELD_NAMES = [
    'UF_CRM_REG_NUMBER',
    'UF_CRM_LEAD_QUEST_URL',
] as const;

/** Итог определения природы лида. */
export interface LeadRequestDetection {
    /** true — это заявка (лид с сайта/лидогена), false — просто лид. */
    isRequest: boolean;
    /** Человекочитаемые признаки, по которым решили (для warnings/логов). */
    signals: string[];
}

type BxRow = Record<string, unknown>;

/**
 * «Заявка или просто лид»: заявка распознаётся по любому из признаков —
 * заполнены наши поля op_lead_site_* ИЛИ поля лидогена портала
 * (UF_CRM_REG_NUMBER «Код партнёра», UF_CRM_LEAD_QUEST_URL «Оценка»).
 *
 * Влияет на названия: «Холодный звонок Запланирован. Заявка. {Название}»
 * и «Холодный обзвон. Заявка. {Название}» (без признака — без слова
 * «Заявка»).
 *
 * НЕ @Injectable: чистый детектор, создаётся `new` рядом с PortalModel.
 */
export class LeadRequestDetectorService {
    private readonly logger = new Logger(LeadRequestDetectorService.name);

    constructor(private readonly portal: PortalModel) {}

    detect(lead: BxRow): LeadRequestDetection {
        const signals: string[] = [];

        // 1. Наши pbx-поля заявки (op_lead_site_status / op_lead_site_stage).
        for (const code of [
            PBX_SALES_EVENT_FIELD_CODES.op_lead_site_status,
            PBX_SALES_EVENT_FIELD_CODES.op_lead_site_stage,
        ]) {
            const field = this.portal.getEntityFieldByCode('lead', code);
            if (!field) continue;
            const value = lead[this.portal.getFieldBitrixId(field)];
            if (this.filled(value)) {
                signals.push(`заполнено поле ${code}`);
            }
        }

        // 2. Поля лидогена портала (заполнены только у заявок).
        for (const fieldName of LEAD_REQUEST_UF_FIELD_NAMES) {
            if (this.filled(lead[fieldName])) {
                signals.push(`заполнено поле лидогена ${fieldName}`);
            }
        }

        if (signals.length === 0) {
            // Диагностика для подбора имён полей на новом портале: какие
            // UF-поля у лида вообще заполнены (см. комментарий к константе).
            // Уровень log, не debug: на проде debug отключён, а эта строка —
            // основной инструмент настройки детектора на новом портале.
            this.logger.log(
                `лид ${String(lead.ID)} — заявка не распознана; заполненные ` +
                    `UF-поля: ${this.filledUfNames(lead).join(', ') || 'нет'}`,
            );
        }

        return { isRequest: signals.length > 0, signals };
    }

    /** Имена заполненных UF_CRM_* полей лида — только для diag-логов. */
    private filledUfNames(lead: BxRow): string[] {
        return Object.keys(lead).filter(
            key => key.startsWith('UF_CRM_') && this.filled(lead[key]),
        );
    }

    /** Значение считается заполненным: непустая строка/массив, число > 0. */
    private filled(raw: unknown): boolean {
        if (raw == null) return false;
        if (typeof raw === 'string') return raw.trim() !== '' && raw !== '0';
        if (typeof raw === 'number') return raw > 0;
        if (Array.isArray(raw)) return raw.some(item => this.filled(item));
        return false;
    }
}
