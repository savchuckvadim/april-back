import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { toBatchSafeText } from '@lib/bitrix/consts/batch.consts';
import { RedisService } from '@lib/core/redis/redis.service';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    isPresentationSurveyEmpty,
    normalizePresentationSurvey,
    PRESENTATION_SURVEY_SUMMARY_CODES,
    PresentationSurveyValues,
} from '../../shared/presentation-survey';
import {
    PresentationSurveyDto,
    PresentationSurveyResultDto,
    UnplannedPresentationSignalDto,
    UnplannedSignalResultDto,
} from '../dto/presentation-survey.dto';
import {
    RendezvousRef,
    SurveyRendezvousStore,
    SurveySummaryValues,
} from './survey-rendezvous.store';

type BxRow = Record<string, unknown>;

/** Дедуп операции: повтор в течение суток не пишется второй раз. */
const DEDUP_TTL_SECONDS = 24 * 3600;

/**
 * Нормализованные значения анкеты после whitelist/trim/обрезки.
 *
 * И whitelist кодов, и нормализация живут в общем модуле
 * `shared/presentation-survey`: у ручки и у основного потока отчёта ОДИН
 * список полей анкеты и один формат ответа. Разъехавшиеся копии списка —
 * ровно тот класс ошибок, из-за которого анкету увели в payload отчёта.
 */
type SurveyValues = PresentationSurveyValues;

/**
 * ЛЕГАСИ-МОСТ для старого React-фронта: ручка опросника 5К/Хвост, куда
 * ответы приезжают ОТДЕЛЬНЫМ запросом, вне event-report flow (hook не
 * участвует).
 *
 * НОВЫЙ фронт сюда не ходит: он кладёт те же ответы в payload отчёта
 * (`presentation.survey` в `EventSalesFlowDto`), и их пишет основной поток
 * своим батчем — вместе с отчётом, в те же лид/сделки/компанию
 * (`event-report/services/entity/event-report-entity-fields.model`).
 * Оттуда же их берут смарты — поэтому новому пути не нужен ни
 * Redis-rendezvous, ни фолбэк «лид → сделка». Удалить эту ручку вместе со
 * старым фронтом.
 *
 * Семантика — ТОЛЬКО перезапись: append'а нет, поэтому повтор того же
 * payload даёт тот же результат (идемпотентность заложена в саму запись).
 * Redis-дедуп по operationId — экономия повторных походов в Битрикс,
 * а не условие корректности.
 */
@Injectable()
export class PresentationSurveyEndpointService {
    private readonly logger = new Logger(
        PresentationSurveyEndpointService.name,
    );

    constructor(
        private readonly pbx: PBXService,
        private readonly redis: RedisService,
        private readonly rendezvous: SurveyRendezvousStore,
    ) {}

    async submit(
        dto: PresentationSurveyDto,
    ): Promise<PresentationSurveyResultDto> {
        const result: PresentationSurveyResultDto = {
            accepted: true,
            deduplicated: false,
            noop: false,
            updated: [],
            warnings: [],
        };

        // Пустые значения — no-op ДО любых походов в Битрикс/портал.
        const values = this.normalizeValues(dto);

        // Отброшенное whitelist'ом — В ЛОГ, а не в тишину.
        //
        // Ручку зовёт ЛЕГАСИ-фронт, и выкатывается он отдельно от нас. Пока
        // он не обновлён, он шлёт коды прошлого состава анкеты («5К» из
        // девяти полей, «Разговор» из шести), а новый whitelist их не знает.
        // Молча отброшенный ответ выглядит как «менеджер не заполнял» —
        // отличить одно от другого можно только по этой строке.
        if (values.droppedCodes.length) {
            this.logger.warn(
                `[survey][${dto.operationId}] ${dto.domain}: коды вне ` +
                    `whitelist отброшены (${values.droppedCodes.length}): ` +
                    values.droppedCodes.join(', '),
            );
        }

        if (isPresentationSurveyEmpty(values)) {
            result.noop = true;
            this.logger.log(
                `[survey][${dto.operationId}] пустые значения — no-op`,
            );
            return result;
        }

        // Дедуп по operationId: Redis в приложении уже есть — используем.
        if (await this.isDuplicate(dto.operationId)) {
            result.deduplicated = true;
            this.logger.log(
                `[survey][${dto.operationId}] повтор операции — запись уже выполнялась`,
            );
            return result;
        }

        const { bitrix, portal } = await this.initPortal(dto.domain);

        // === Лид: девять детальных + оба сводных.
        const leadId = dto.targets.leadId;
        if (leadId) {
            const fields = this.buildLeadFields(portal, values, result);
            if (Object.keys(fields).length) {
                bitrix.batch.lead.update(
                    `survey_lead_${leadId}`,
                    leadId,
                    fields as never,
                );
                result.updated.push(`lead_${leadId}`);
            }
        }

        // === Сделки: девять детальных + сводные — зеркало лида (решение
        // владельца 31.08: раньше детальные писались только лиду, и девять
        // полей «5К» на pres-сделке стояли вечно пустыми, хотя legacy PHP
        // их заполнял). Неустановленное на сделке поле setField молча
        // пропустит — порталы без детальных полей сделки ничего не теряют.
        for (const dealId of dto.targets.dealIds ?? []) {
            const fields = this.buildDealFields(portal, values, result);
            if (Object.keys(fields).length) {
                bitrix.batch.deal.update(
                    `survey_deal_${dealId}`,
                    dealId,
                    fields as never,
                );
                result.updated.push(`deal_${dealId}`);
            }
        }
        const companyId = dto.targets.companyId;
        if (companyId) {
            const fields = this.buildSummaryFields(
                portal,
                'company',
                values,
                result,
            );
            if (Object.keys(fields).length) {
                bitrix.batch.company.update(
                    `survey_company_${companyId}`,
                    companyId,
                    fields as never,
                );
                result.updated.push(`company_${companyId}`);
            }
        }

        /*
         * Rendezvous с hook-сигналом об unplanned-презентации: сводные
         * значения кэшируются под ключами всех целей, а если сигнал уже
         * ждал (обогнал опросник) — сводные дописываются в его
         * unplanned-сделку тем же батчем.
         */
        await this.runRendezvousOnSubmit(dto, values, portal, bitrix, result);

        if (result.updated.length === 0) {
            // Все поля оказались неустановленными/вне whitelist — писать
            // нечего, но это не ошибка (мягкая деградация).
            result.noop = true;
            this.logger.warn(
                `[survey][${dto.operationId}] ${dto.domain}: ни одного ` +
                    `записываемого поля (${result.warnings.join('; ') || 'нет целей'})`,
            );
            return result;
        }

        await bitrix.api.callBatchWithConcurrency(1);
        this.logger.log(
            `[survey][${dto.operationId}] ${dto.domain}: записано → ` +
                result.updated.join(', '),
        );
        return result;
    }

    /**
     * Сигнал от hook: «создана unplanned-сделка N» — БЕЗ значений
     * опросника. Значения приходят (или уже пришли) от легаси-фронта в
     * основную ручку; здесь стороны женятся:
     *  - значения уже в кэше → пишем сводные в unplanned-сделку;
     *  - значений нет (сигнал обогнал опросник — hook-очередь бывает
     *    быстрее) → сигнал ложится в ожидание, опросник допишет сам.
     */
    async signal(
        dto: UnplannedPresentationSignalDto,
    ): Promise<UnplannedSignalResultDto> {
        const result: UnplannedSignalResultDto = {
            accepted: true,
            deduplicated: false,
            matched: false,
            pending: false,
            updated: [],
            warnings: [],
        };
        const refs = this.signalRefs(dto);

        /*
         * Захват права записи. Ключ означает «сводные в unplanned-сделку
         * записаны»: если запись не состоится (уйдём в pending/ошибку),
         * право возвращается — его позже заберёт опросник.
         */
        const owned = await this.rendezvous.tryMarkDone(
            dto.domain,
            dto.unplannedDealId,
        );
        if (!owned) {
            result.deduplicated = true;
            this.logger.log(
                `[survey][signal ${dto.unplannedDealId}] повтор сигнала — запись уже выполнялась`,
            );
            return result;
        }

        const values = await this.rendezvous.findValues(dto.domain, refs);
        if (!values || (!values.xvost && !values.fiveKSummary)) {
            // Гонка: опросника ещё не было. Оставляем ожидание и
            // возвращаем право записи — его заберёт основная ручка.
            await this.rendezvous.releaseDone(dto.domain, dto.unplannedDealId);
            if (refs.length === 0) {
                result.warnings.push(
                    'сигнал без baseDealId/companyId/leadId — rendezvous невозможен',
                );
                return result;
            }
            result.pending = await this.rendezvous.storePending(
                dto.domain,
                refs,
                dto.unplannedDealId,
            );
            if (!result.pending) {
                result.warnings.push(
                    'Redis недоступен — сигнал не сохранён, rendezvous не состоится',
                );
            }
            this.logger.log(
                `[survey][signal ${dto.unplannedDealId}] ${dto.domain}: значений ещё нет — сигнал в ожидании`,
            );
            return result;
        }

        try {
            const { bitrix, portal } = await this.initPortal(dto.domain);
            const fields = this.buildDealFields(
                portal,
                {
                    // Кэш старого формата без fiveK/talk читается как
                    // «детальных не было» — записываются только сводные.
                    fiveK: new Map(Object.entries(values.fiveK ?? {})),
                    talk: new Map(Object.entries(values.talk ?? {})),
                    xvost: values.xvost ?? null,
                    fiveKSummary: values.fiveKSummary ?? null,
                    // В кэш кладут УЖЕ нормализованное: отбрасывать было
                    // нечего, и заново whitelist здесь не применяется.
                    droppedCodes: [],
                },
                result,
            );
            if (Object.keys(fields).length) {
                bitrix.batch.deal.update(
                    `survey_unplanned_${dto.unplannedDealId}`,
                    dto.unplannedDealId,
                    fields as never,
                );
                await bitrix.api.callBatchWithConcurrency(1);
                result.updated.push(`deal_${dto.unplannedDealId}`);
            }
            result.matched = true;
            this.logger.log(
                `[survey][signal ${dto.unplannedDealId}] ${dto.domain}: сводные записаны в unplanned-сделку`,
            );
            return result;
        } catch (error) {
            // Запись не состоялась — вернуть право, чтобы повтор сработал.
            await this.rendezvous.releaseDone(dto.domain, dto.unplannedDealId);
            throw error;
        }
    }

    /* ------------------------------------------------------------------ */

    /**
     * Обратная сторона rendezvous в основной ручке: кэшируем сводные под
     * целями опросника и дописываем сводные в unplanned-сделки сигналов,
     * которые уже ждали (тем же батчем, что и основная запись).
     */
    private async runRendezvousOnSubmit(
        dto: PresentationSurveyDto,
        values: SurveyValues,
        portal: PortalModel,
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        result: PresentationSurveyResultDto,
    ): Promise<void> {
        // Rendezvous — только про сводные: без них женить нечего.
        if (!values.xvost && !values.fiveKSummary) return;
        const refs = this.submitRefs(dto);
        if (refs.length === 0) return;

        const summary: SurveySummaryValues = {
            ...(values.xvost ? { xvost: values.xvost } : {}),
            ...(values.fiveKSummary
                ? { fiveKSummary: values.fiveKSummary }
                : {}),
            // Детальные — тоже в кэш: unplanned-сделка обязана получить
            // тот же состав, что обычная (иначе девять полей пусты только
            // у незапланированных — необъяснимая асимметрия для менеджера).
            ...(values.fiveK.size
                ? { fiveK: Object.fromEntries(values.fiveK) }
                : {}),
            ...(values.talk.size
                ? { talk: Object.fromEntries(values.talk) }
                : {}),
        };
        await this.rendezvous.cacheValues(dto.domain, refs, summary);

        const pendings = await this.rendezvous.findPending(dto.domain, refs);
        for (const pending of pendings) {
            const owned = await this.rendezvous.tryMarkDone(
                dto.domain,
                pending.unplannedDealId,
            );
            if (owned) {
                const fields = this.buildDealFields(portal, values, result);
                if (Object.keys(fields).length) {
                    bitrix.batch.deal.update(
                        `survey_unplanned_${pending.unplannedDealId}`,
                        pending.unplannedDealId,
                        fields as never,
                    );
                    result.updated.push(`deal_${pending.unplannedDealId}`);
                    this.logger.log(
                        `[survey][${dto.operationId}] rendezvous: сводные → ` +
                            `unplanned-сделка ${pending.unplannedDealId}`,
                    );
                }
            }
            await this.rendezvous.deleteKeys(pending.keys);
        }
    }

    /** Цели опросника → ссылки rendezvous (кэш значений + поиск pending). */
    private submitRefs(dto: PresentationSurveyDto): RendezvousRef[] {
        const refs: RendezvousRef[] = [];
        for (const dealId of dto.targets.dealIds ?? []) {
            refs.push(['deal', dealId]);
        }
        if (dto.targets.companyId)
            refs.push(['company', dto.targets.companyId]);
        if (dto.targets.leadId) refs.push(['lead', dto.targets.leadId]);
        return refs;
    }

    /** Ссылки сигнала — порядок поиска: базовая сделка → компания → лид. */
    private signalRefs(dto: UnplannedPresentationSignalDto): RendezvousRef[] {
        const refs: RendezvousRef[] = [];
        if (dto.baseDealId) refs.push(['deal', dto.baseDealId]);
        if (dto.companyId) refs.push(['company', dto.companyId]);
        if (dto.leadId) refs.push(['lead', dto.leadId]);
        return refs;
    }

    /* ------------------------------------------------------------------ */

    /** Портал по домену; не найден/не собрался → честный 404. */
    private async initPortal(domain: string): Promise<{
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'];
        portal: PortalModel;
    }> {
        try {
            const { bitrix, PortalModel: portal } = await this.pbx.init(domain);
            if (!bitrix || !portal) {
                throw new Error('портал не собрался');
            }
            return { bitrix, portal };
        } catch (error) {
            if (error instanceof NotFoundException) throw error;
            this.logger.warn(
                `[survey] портал ${domain} недоступен: ${String(error)}`,
            );
            throw new NotFoundException(`Портал ${domain} не найден`);
        }
    }

    /**
     * Whitelist + trim + обрезка до лимита — ОБЩЕЙ нормализацией
     * (`shared/presentation-survey`). Ключи вне списка ОТБРАСЫВАЮТСЯ МОЛЧА:
     * ручка не умеет писать чужие поля.
     */
    private normalizeValues(dto: PresentationSurveyDto): SurveyValues {
        return normalizePresentationSurvey(dto.values);
    }

    /**
     * Поля ЛИДА: девять детальных «5К» + шесть «Разговора» + сводные.
     * Перезапись, не append.
     */
    private buildLeadFields(
        portal: PortalModel,
        values: SurveyValues,
        result: { warnings: string[] },
    ): BxRow {
        const fields: BxRow = {};
        for (const [code, value] of values.fiveK) {
            this.setField(portal, 'lead', code, value, fields, result);
        }
        for (const [code, value] of values.talk) {
            this.setField(portal, 'lead', code, value, fields, result);
        }
        this.appendSummaryFields(portal, 'lead', values, fields, result);
        return fields;
    }

    /**
     * Поля СДЕЛКИ: детальные «5К» + «Разговор» + сводные — тот же состав,
     * что у лида (коды резолвятся на СДЕЛКЕ; не установлены — тихий скип).
     * Без сделочной записи снимок смарта в deal-placement оставался бы
     * пустым: лида там нет, а зеркало читает лид → базовую сделку.
     */
    private buildDealFields(
        portal: PortalModel,
        values: SurveyValues,
        result: { warnings: string[] },
    ): BxRow {
        const fields: BxRow = {};
        for (const [code, value] of values.fiveK) {
            this.setField(portal, 'deal', code, value, fields, result);
        }
        for (const [code, value] of values.talk) {
            this.setField(portal, 'deal', code, value, fields, result);
        }
        this.appendSummaryFields(portal, 'deal', values, fields, result);
        return fields;
    }

    /** Сводные поля для компании (детальных «5К» на компании нет). */
    private buildSummaryFields(
        portal: PortalModel,
        entityType: 'deal' | 'company',
        values: SurveyValues,
        result: { warnings: string[] },
    ): BxRow {
        const fields: BxRow = {};
        this.appendSummaryFields(portal, entityType, values, fields, result);
        return fields;
    }

    private appendSummaryFields(
        portal: PortalModel,
        entityType: 'lead' | 'deal' | 'company',
        values: SurveyValues,
        fields: BxRow,
        result: { warnings: string[] },
    ): void {
        if (values.xvost) {
            this.setField(
                portal,
                entityType,
                PRESENTATION_SURVEY_SUMMARY_CODES.xvost,
                values.xvost,
                fields,
                result,
            );
        }
        if (values.fiveKSummary) {
            this.setField(
                portal,
                entityType,
                PRESENTATION_SURVEY_SUMMARY_CODES.fiveKSummary,
                values.fiveKSummary,
                fields,
                result,
            );
        }
    }

    /**
     * UF-ключ — существующей механикой по слепку портала (как в
     * event-report-entity-fields.model): поле не установлено → тихий скип
     * с warning в ответе.
     *
     * Значение проходит {@link toBatchSafeText} — ТОТ ЖЕ строгий вариант,
     * что у потока (`EventReportEntityFieldsModel.setSurveyField`): ответ
     * анкеты это СВОБОДНЫЙ текст менеджера, целиком уезжающий одним
     * значением batch-команды. Многострочность обязательна к экранированию
     * (хвост — построчная склейка, сводка 5К — построчная сводка; сырой
     * `\n` доезжает до карточки подчёркиванием), но строку рвут ещё три
     * символа — `&`, `+`, `%` (см. докблок toBatchSafeText). Слабый вариант
     * здесь резал бы КОМАНДУ ЦЕЛИКОМ: остальные поля той же сущности
     * уезжали бы мусорными параметрами.
     *
     * Это ЕДИНСТВЕННАЯ точка попадания значений в batch-поля —
     * экранируются разом прямая запись, запись из сигнала и
     * rendezvous-дозапись; Redis-кэш при этом хранит СЫРЫЕ значения
     * (человекочитаем и независим от транспорта).
     */
    private setField(
        portal: PortalModel,
        entityType: 'lead' | 'deal' | 'company',
        code: string,
        value: string,
        fields: BxRow,
        result: { warnings: string[] },
    ): void {
        const field = portal.getEntityFieldByCode(entityType, code);
        if (!field) {
            const warning = `поле ${code} не установлено на ${entityType}`;
            if (!result.warnings.includes(warning)) {
                result.warnings.push(warning);
            }
            return;
        }
        fields[`UF_CRM_${field.bitrixId}`] = toBatchSafeText(value);
    }

    /**
     * true — операция уже выполнялась (повтор не пишется). Redis упал —
     * идём писать: перезапись идемпотентна, терять анкету из-за кэша нельзя.
     */
    private async isDuplicate(operationId: string): Promise<boolean> {
        try {
            const stored = await this.redis
                .getClient()
                .set(
                    `survey:${operationId}`,
                    '1',
                    'EX',
                    DEDUP_TTL_SECONDS,
                    'NX',
                );
            return stored === null;
        } catch (error) {
            this.logger.warn(
                `[survey] Redis-дедуп недоступен (${String(error)}) — пишем без дедупа`,
            );
            return false;
        }
    }
}
