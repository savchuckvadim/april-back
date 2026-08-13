import { Logger } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    LEAD_WORK_KIND,
    LeadWorkKind,
    leadWorkKindByItemCode,
} from '../../../shared/event-title';

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
 * Штатные коды `SOURCE_ID` Битрикса, по которым можно РАЗЛИЧИТЬ заявку и
 * входящее обращение.
 *
 * ВАЖНО: `SOURCE_ID` — ЧУЖОЕ поле. Его правят руками, у многих порталов он
 * автоматически проставляется при ручном создании лида, и набор значений на
 * каждом портале свой. Поэтому источник НЕ имеет права объявить работу
 * входящей: он используется ТОЛЬКО как последняя подсказка и ТОЛЬКО чтобы
 * уточнить вид, когда наши собственные признаки уже сказали «работа
 * входящая», но не сказали какая именно. Иначе холодный лид с дефолтным
 * `SOURCE_ID=CALL` превратился бы в «Лид», а менеджер настроился бы не на
 * тот разговор.
 *
 * Кастомные (числовые) коды сигналом не считаются — их смысл известен
 * только владельцу портала.
 */
export const REQUEST_SOURCE_IDS = [
    'WEB',
    'WEBFORM',
    'RC_GENERATOR',
    'STORE',
] as const;

/** Штатные коды `SOURCE_ID` входящего обращения (звонок, письмо, чат). */
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
 * Порядок признаков — от «нашего» к «чужому», потому что доверять можно
 * только тому, чем управляем мы сами:
 *
 *  1. `op_lead_work_kind` — НАШЕ поле вида работы. Его пишет этот же хук
 *     при передаче лида в работу, поэтому оно и есть источник истины:
 *     переживает ручные правки карточки и не зависит от настроек портала.
 *     Поля нет в слепке (ещё не заведено) — просто идём дальше.
 *  2. Поля лидогена «Гарант» (`UF_CRM_REG_NUMBER` «Код партнёра»,
 *     `UF_CRM_LEAD_QUEST_URL` «Оценка») — тоже наши, заполняются ТОЛЬКО у
 *     заявок. Однозначная ЗАЯВКА.
 *  3. Наши метки пути заявки (`op_lead_site_status` / `op_lead_site_stage`)
 *     — говорят «работа входящая», но не уточняют вид: их ставит наш же
 *     хук при назначении. По умолчанию трактуем как ЗАЯВКУ.
 *  4. Штатный `SOURCE_ID` — ПОСЛЕДНЯЯ подсказка и только на уточнение вида
 *     внутри уже признанной входящей работы (см. REQUEST_SOURCE_IDS).
 *     Объявить работу входящей он НЕ может: поле чужое.
 *
 * `workKind` из запроса перебивает всё (см. LeadToWorkFlowService.detect).
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

        // 1. НАШЕ поле вида работы — источник истины, спор на нём и кончается.
        const ownKind = this.kindByOwnField(lead);
        if (ownKind) {
            signals.push(
                `наше поле ${PBX_SALES_EVENT_FIELD_CODES.op_lead_work_kind}=${ownKind}`,
            );
            return {
                isRequest: ownKind !== LEAD_WORK_KIND.cold,
                kind: ownKind,
                signals,
            };
        }

        // 2. Поля лидогена портала — однозначная заявка.
        let fromLeadGenerator = false;
        for (const fieldName of LEAD_REQUEST_UF_FIELD_NAMES) {
            if (this.filled(lead[fieldName])) {
                fromLeadGenerator = true;
                signals.push(`заполнено поле лидогена ${fieldName}`);
            }
        }

        // 3. Наши метки пути заявки — «работа входящая», без уточнения вида.
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

        // 4. Чужой SOURCE_ID — только уточнение вида уже входящей работы.
        const source = this.sourceId(lead);
        const kind = this.resolveKind({
            fromLeadGenerator,
            onRequestPath,
            source,
            signals,
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
     * Ключевое ограничение: `SOURCE_ID` не может СДЕЛАТЬ работу входящей —
     * он лишь уточняет вид там, где наши поля уже это установили. Поле
     * чужое: на многих порталах оно проставляется автоматически при ручном
     * создании лида, и «повышение» холодного лида до обращения по нему было
     * бы ошибкой в самую неудобную сторону.
     */
    private resolveKind(input: {
        fromLeadGenerator: boolean;
        onRequestPath: boolean;
        source: string | null;
        signals: string[];
    }): LeadWorkKind {
        // Лидоген надёжнее источника: «Код партнёра» ставит наш генератор.
        if (input.fromLeadGenerator) return LEAD_WORK_KIND.request;
        if (!input.onRequestPath) return LEAD_WORK_KIND.cold;

        const sourceKind = this.kindBySource(input.source);
        if (sourceKind) {
            input.signals.push(
                `вид уточнён по ЧУЖОМУ полю SOURCE_ID=${input.source}`,
            );
            this.logger.log(
                `вид работы уточнён по чужому полю SOURCE_ID="${input.source}" → ` +
                    `${sourceKind}; надёжнее завести наше поле ` +
                    `${PBX_SALES_EVENT_FIELD_CODES.op_lead_work_kind}`,
            );
            return sourceKind;
        }
        // Путь заявки без уточнения — заявка: так хук вёл себя и раньше, и
        // это безопаснее, чем назвать заявку «лидом».
        return LEAD_WORK_KIND.request;
    }

    /** Вид работы по НАШЕМУ полю лида; null — поле не заведено либо пусто. */
    private kindByOwnField(lead: BxRow): LeadWorkKind | null {
        const field = this.portal.getEntityFieldByCode(
            'lead',
            PBX_SALES_EVENT_FIELD_CODES.op_lead_work_kind,
        );
        // Поля нет в слепке портала — работаем как раньше (graceful).
        if (!field) return null;
        const raw = lead[this.portal.getFieldBitrixId(field)];
        if (!this.filled(raw)) return null;
        const item = field.items.find(
            entry => String(entry.bitrixId) === String(raw),
        );
        return leadWorkKindByItemCode(item?.code);
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
