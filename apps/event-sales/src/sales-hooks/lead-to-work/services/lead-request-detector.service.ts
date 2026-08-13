import { Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { LEAD_WORK_KIND, LeadWorkKind } from '../../../shared/event-title';

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

/**
 * Штатные коды `SOURCE_ID` Битрикса, означающие ЗАЯВКУ (клиент оставил
 * данные сам через форму/сайт/магазин).
 *
 * Коды встроенные и одинаковы на всех порталах; кастомные источники
 * (числовые id, заведённые вручную) сюда не попадают и трактуются как
 * «сигнала нет» — гадать по ним нельзя.
 */
export const REQUEST_SOURCE_IDS = [
    'WEB',
    'WEBFORM',
    'RC_GENERATOR',
    'STORE',
] as const;

/**
 * Штатные коды `SOURCE_ID`, означающие ВХОДЯЩЕЕ ОБРАЩЕНИЕ — клиент вышел на
 * связь сам, но заявки не оставлял (позвонил, написал).
 */
export const LEAD_SOURCE_IDS = [
    'CALL',
    'CALLBACK',
    'EMAIL',
    'IMOL',
    'OPENLINE',
] as const;

/** Итог определения природы лида. */
export interface LeadRequestDetection {
    /**
     * true — это ВХОДЯЩАЯ работа (заявка либо обращение): клиент нас ждёт.
     * От неё зависят site-метки лида, таймер подтверждения и SLA — они
     * одинаковы и для заявки, и для входящего лида.
     */
    isRequest: boolean;
    /** Вид холодной работы — слово в заголовке задачи. */
    kind: LeadWorkKind;
    /** Человекочитаемые признаки, по которым решили (для warnings/логов). */
    signals: string[];
}

type BxRow = Record<string, unknown>;

/**
 * Вид холодной работы ПО ДАННЫМ САМОГО ЛИДА — без правки роботов.
 *
 * Что реально различает виды (по убыванию надёжности):
 *
 *  1. Поля лидогена «Гарант» (`UF_CRM_REG_NUMBER` «Код партнёра»,
 *     `UF_CRM_LEAD_QUEST_URL` «Оценка») — заполняются ТОЛЬКО у заявок с
 *     сайта. Однозначная ЗАЯВКА.
 *  2. Штатный `SOURCE_ID` Битрикса — единственное поле о ПРОИСХОЖДЕНИИ
 *     лида. Встроенные коды делятся честно: форма/сайт/магазин — заявка,
 *     звонок/почта/открытая линия — обращение. Кастомные (числовые) коды
 *     сигналом НЕ считаются: их смысл известен только владельцу портала.
 *  3. Наши поля пути заявки (`op_lead_site_status` / `op_lead_site_stage`)
 *     — говорят «лид уже идёт по пути входящей работы», но НЕ говорят,
 *     заявка это или обращение: их ставит наш же хук при назначении.
 *
 * Отсюда правило по умолчанию: путь заявки без уточняющего источника
 * трактуется как ЗАЯВКА (`request`) — это минимальный безопасный вариант,
 * прежнее поведение хука ровно такое же. `lead` ставится только при явном
 * входящем `SOURCE_ID`, а `workKind` из хука перебивает всё.
 *
 * Влияет на названия: «Холодный обзвон. Заявка. {N}» / «. Лид. {N}» —
 * по этому слову фрейм и определяет тип события.
 *
 * НЕ @Injectable: чистый детектор, создаётся `new` рядом с PortalModel.
 */
export class LeadRequestDetectorService {
    private readonly logger = new Logger(LeadRequestDetectorService.name);

    constructor(private readonly portal: PortalModel) {}

    detect(lead: BxRow): LeadRequestDetection {
        const signals: string[] = [];

        // 1. Наши pbx-поля пути заявки — «входящая работа», без уточнения вида.
        let onRequestPath = false;
        for (const code of [
            PBX_SALES_EVENT_FIELD_CODES.op_lead_site_status,
            PBX_SALES_EVENT_FIELD_CODES.op_lead_site_stage,
        ]) {
            const field = this.portal.getEntityFieldByCode('lead', code);
            if (!field) continue;
            const value = lead[this.portal.getFieldBitrixId(field)];
            if (this.filled(value)) {
                onRequestPath = true;
                signals.push(`заполнено поле ${code}`);
            }
        }

        // 2. Поля лидогена портала — однозначная заявка с сайта.
        let fromLeadGenerator = false;
        for (const fieldName of LEAD_REQUEST_UF_FIELD_NAMES) {
            if (this.filled(lead[fieldName])) {
                fromLeadGenerator = true;
                signals.push(`заполнено поле лидогена ${fieldName}`);
            }
        }

        // 3. Штатный источник лида — единственное поле о происхождении.
        const source = this.sourceId(lead);
        const sourceKind = this.kindBySource(source);
        if (sourceKind) {
            signals.push(`источник лида SOURCE_ID=${source}`);
        }

        const kind = this.resolveKind({
            onRequestPath,
            fromLeadGenerator,
            sourceKind,
        });

        if (kind === LEAD_WORK_KIND.cold) {
            // Диагностика для настройки на новом портале: какие UF-поля и
            // какой источник у лида вообще есть. Уровень log, не debug: на
            // проде debug отключён, а это основной инструмент разбора.
            this.logger.log(
                `лид ${String(lead.ID)} — входящая работа не распознана; ` +
                    `SOURCE_ID="${source ?? '—'}"; заполненные UF-поля: ` +
                    `${this.filledUfNames(lead).join(', ') || 'нет'}`,
            );
        }

        return {
            isRequest: kind !== LEAD_WORK_KIND.cold,
            kind,
            signals,
        };
    }

    /**
     * Сведение сигналов в вид работы.
     *
     * Лидоген главнее источника: поле «Код партнёра» заполняет наш же
     * генератор заявок, и это надёжнее любого SOURCE_ID, который менеджер
     * мог переставить руками.
     */
    private resolveKind(input: {
        onRequestPath: boolean;
        fromLeadGenerator: boolean;
        sourceKind: LeadWorkKind | null;
    }): LeadWorkKind {
        if (input.fromLeadGenerator) return LEAD_WORK_KIND.request;
        if (input.sourceKind) return input.sourceKind;
        // Путь заявки без уточняющего источника — считаем заявкой: так вёл
        // себя хук и раньше, и это безопаснее, чем назвать заявку «лидом».
        return input.onRequestPath
            ? LEAD_WORK_KIND.request
            : LEAD_WORK_KIND.cold;
    }

    /** Вид работы по штатному источнику; null — источник ничего не говорит. */
    private kindBySource(source: string | null): LeadWorkKind | null {
        if (!source) return null;
        const code = source.toUpperCase();
        if ((REQUEST_SOURCE_IDS as readonly string[]).includes(code)) {
            return LEAD_WORK_KIND.request;
        }
        if ((LEAD_SOURCE_IDS as readonly string[]).includes(code)) {
            return LEAD_WORK_KIND.lead;
        }
        return null;
    }

    private sourceId(lead: BxRow): string | null {
        const raw = lead.SOURCE_ID;
        return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
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
