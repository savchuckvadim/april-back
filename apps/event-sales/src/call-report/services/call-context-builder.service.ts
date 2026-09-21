import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { RedisService } from '@lib/core/redis/redis.service';
import { BitrixService } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import {
    AiService,
    CALL_RESUME_TYPE,
    CallAnalysisBitrixService,
    TranscriptionPipelineView,
    TranscriptionStoreService,
} from '@lib/call-lib';
import { CallReportDealFamilyService } from '@lib/call-lib/call-report/services/call-report-deal-family.service';
import { LeadRequestDetectorService } from '../../sales-hooks/lead-to-work/services/lead-request-detector.service';
import { LeadWorkKind } from '../../shared/event-title';
import {
    renderPassportClassifyHint,
    renderPassportForPrompt,
} from './call-context-render.util';
import {
    callTypeOfRecords,
    familyResolveArgsOf,
} from './call-family-context.util';
import { CallReportSettingsService } from './call-report-settings.service';
import { CallTypePrior, resolveCallTypePrior } from './call-type-prior.util';

/** Кандидат identity, найденный по номеру телефона. НИКОГДА не факт. */
export interface CallPassportIdentity {
    entityType: 'CONTACT' | 'COMPANY' | 'LEAD';
    entityId: number;
    confidence: 'suspected';
}

/** Один прошлый звонок той же сущности — для контекста истории. */
export interface CallPassportHistoryItem {
    startedAt: string | null;
    resume: string | null;
}

/** Поля карточки лида/контакта, из которых собирается персона собеседника. */
interface PersonaFields {
    STATUS_ID?: string;
    NAME?: string;
    LAST_NAME?: string;
    POST?: string;
    COMMENTS?: string;
}

/**
 * «Паспорт звонка» — слой 0 многослойного анализа (план
 * ai/tasks/call-analysis-v2-plan.md): всё, что мы ЗНАЕМ из данных до
 * какого-либо LLM. Паспорт — подсказка, не приговор: уровень certainty
 * определяет, насколько жёсткие выводы допустимы.
 */
export interface CallPassport {
    /**
     * rich — сделка со стадией; lead — лид со статусом; naked — CRM-контекст
     * отсутствует или сырой (может оказаться действующим клиентом с
     * незнакомого номера — жёстких выводов об уместности делать нельзя).
     */
    certainty: 'rich' | 'lead' | 'naked';
    entityType: 'deal' | 'lead' | null;
    entityId: number | null;
    /** Стадия сделки (STAGE_ID) на момент разбора; null вне rich. */
    stageId: string | null;
    /** Воронка сделки (CATEGORY_ID); null вне rich. */
    categoryId: string | null;
    /**
     * pbx-код воронки сделки (sales_base / sales_presentation / …) —
     * обратный резолв CATEGORY_ID через PortalModel; null — воронка не
     * заведена в pbx (чужая) или звонок не по сделке.
     */
    dealCategoryCode: string | null;
    /** pbx-код стадии сделки (sales_pres, sales_refine, …); null — не в pbx. */
    dealStageCode: string | null;
    /**
     * Ожидаемый тип звонка по CRM (стадия сделки, вид лида) — приор для
     * классификатора и подстраховка при «другое»/неуверенности
     * (ai/tasks/call-type-accuracy-plan.md). null — CRM ничего не говорит.
     */
    callTypePrior: CallTypePrior | null;
    /** Статус лида (STATUS_ID); null вне lead. */
    leadStatusId: string | null;
    /**
     * Вид работы лида от LeadRequestDetector (тот же детектор, что в хуке
     * lead-to-work): request — входящая ЗАЯВКА с сайта/лидогена (вероятный
     * тип звонка «Заявка с сайта»), lead — входящее обращение
     * (звонок/письмо/чат), cold — входящая работа не распознана;
     * null вне lead или при ошибке детекта.
     */
    leadWorkKind: LeadWorkKind | null;
    /**
     * Должность собеседника из CRM (POST лида или контакта сделки) —
     * подсказка глубокому разбору для специализации показа (бухгалтер/
     * юрист/кадровик); null — не заполнена или недоступна.
     */
    contactPosition: string | null;
    /**
     * Имя собеседника из CRM (лид или контакт сделки) — помогает разбору
     * восстанавливать искажённые распознаванием имена; null — нет данных.
     */
    contactName: string | null;
    /**
     * Заметки менеджера из CRM (COMMENTS лида или контакта сделки, без
     * разметки, обрезаны) — фон для разбора; могут быть устаревшими.
     */
    crmNotes: string | null;
    /** Компания/контакт владельца звонка из CRM — для долива связей. */
    crmCompanyId: number | null;
    crmContactId: number | null;
    /**
     * Название компании клиента (карточка компании сделки или
     * COMPANY_TITLE лида) — помогает восстанавливать искажённое
     * распознаванием название; null — нет данных.
     */
    companyTitle: string | null;
    /** Заметки менеджера из карточки компании (COMMENTS, без разметки). */
    companyNotes: string | null;
    /**
     * Последние записи «ОП История (Комментарии)» (op_mhistory) из
     * сделки/лида и компании — датированные заметки менеджера о касаниях
     * клиента; пустой массив — поле не заведено или пусто.
     */
    opHistory: string[];
    /**
     * Названия НАШИХ организаций на портале («Альфа-центр», «Апрель») из
     * настройки `ownOrgNames`. Разбор без них читал партнёрское имя как
     * чужой бренд и снижал оценку (прод alfacentr 08.09.2026). Пустой
     * массив — настройка не задана, промпт прежний.
     */
    ownOrgNames: string[];
    /** Направление: ~99% исходящие (менеджер — инициатор). */
    direction: 'incoming' | 'outgoing' | null;
    /** Кандидаты «кто это на самом деле» по номеру телефона (suspected). */
    identity: CallPassportIdentity[];
    /** Последние разборы той же сущности, новые первыми. */
    history: CallPassportHistoryItem[];
}

/**
 * Слой 0 конвейера анализа: собирает паспорт звонка из CRM и нашей БД.
 * Полностью fail-open — любая недоступность источника деградирует паспорт,
 * но не роняет разбор (пустой паспорт = certainty 'naked').
 */
@Injectable()
export class CallContextBuilderService {
    private readonly logger = new Logger(CallContextBuilderService.name);

    /**
     * Кэш паспорта: один звонок собирает паспорт ДВАЖДЫ за минуты
     * (стадия анализа — для классификатора и GigaChat, процессор — для
     * глубокого разбора), а паспорт потяжелел до ~10 запросов (сделка,
     * контакт, компания, активность, номер, история). TTL короткий:
     * ночной ревизор придёт за свежими данными уже мимо кэша.
     */
    private static readonly CACHE_TTL_SEC = 15 * 60;

    constructor(
        private readonly pbxService: PBXService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
        private readonly redisService: RedisService,
        private readonly dealFamily: CallReportDealFamilyService,
        private readonly reportSettings: CallReportSettingsService,
    ) {}

    async build(row: TranscriptionPipelineView): Promise<CallPassport> {
        const cached = await this.readCache(row.id);
        if (cached) return cached;
        const passport = await this.buildFresh(row);
        await this.writeCache(row.id, passport);
        return passport;
    }

    private async buildFresh(
        row: TranscriptionPipelineView,
    ): Promise<CallPassport> {
        const passport: CallPassport = {
            certainty: 'naked',
            entityType: null,
            entityId: null,
            stageId: null,
            categoryId: null,
            dealCategoryCode: null,
            dealStageCode: null,
            callTypePrior: null,
            leadStatusId: null,
            leadWorkKind: null,
            contactPosition: null,
            contactName: null,
            crmNotes: null,
            crmCompanyId: null,
            crmContactId: null,
            companyTitle: null,
            companyNotes: null,
            opHistory: [],
            ownOrgNames: [],
            direction: null,
            identity: [],
            history: [],
        };
        if (!row.domain) return passport;
        passport.ownOrgNames = await this.readOwnOrgNames(row.domain);
        const callType = await this.readCallType(row);

        try {
            const { bitrix, PortalModel } = await this.pbxService.init(
                row.domain,
            );
            await this.fillCrmContext(
                bitrix,
                PortalModel,
                row,
                passport,
                callType,
            );
            await this.fillDirectionAndIdentity(bitrix, row, passport);
        } catch (error) {
            this.logger.warn(
                `Паспорт: CRM-контекст не собран (${row.domain}): ${(error as Error).message}`,
            );
        }
        await this.fillHistory(row, passport);
        return passport;
    }

    /**
     * Названия своих организаций из настроек портала. Fail-open: настройки
     * недоступны — паспорт без имён, промпт остаётся прежним (лучше пусто,
     * чем ложное «это чужой бренд»).
     */
    private async readOwnOrgNames(domain: string): Promise<string[]> {
        try {
            const settings = await this.reportSettings.resolve(domain);
            return settings.ownOrgNames;
        } catch (error) {
            this.logger.warn(
                `Паспорт: названия своих организаций не прочитаны (${domain}): ${(error as Error).message}`,
            );
            return [];
        }
    }

    /**
     * Тип звонка по уже сделанным ais-записям строки (классификатор,
     * глубокий разбор) — ранжирование записи отчётности в раскладке связей.
     * До классификации записей нет — тип неизвестен; ошибка БД паспорт не
     * ломает.
     */
    private async readCallType(
        row: TranscriptionPipelineView,
    ): Promise<string | null> {
        try {
            return callTypeOfRecords(
                await this.aiService.findByTranscriptionIds([row.id]),
                row.id,
            );
        } catch {
            return null;
        }
    }

    /** Паспорт из кэша; любая ошибка Redis — просто собираем заново. */
    private async readCache(
        transcriptionId: string,
    ): Promise<CallPassport | null> {
        try {
            const raw = await this.redisService
                .getClient()
                .get(this.cacheKey(transcriptionId));
            return raw ? (JSON.parse(raw) as CallPassport) : null;
        } catch {
            return null;
        }
    }

    private async writeCache(
        transcriptionId: string,
        passport: CallPassport,
    ): Promise<void> {
        try {
            await this.redisService
                .getClient()
                .set(
                    this.cacheKey(transcriptionId),
                    JSON.stringify(passport),
                    'EX',
                    CallContextBuilderService.CACHE_TTL_SEC,
                );
        } catch {
            // Redis недоступен — паспорт просто не кэшируется.
        }
    }

    private cacheKey(transcriptionId: string): string {
        return `call-report:passport:${transcriptionId}`;
    }

    /** Текстовый блок паспорта для user-части промпта разбора. */
    renderForPrompt(passport: CallPassport): string {
        return renderPassportForPrompt(passport);
    }

    /**
     * Короткая CRM-подсказка для дешёвого классификатора типа звонка;
     * null — подсказать нечего (рендер — call-context-render.util).
     */
    renderClassifyHint(passport: CallPassport): string | null {
        return renderPassportClassifyHint(passport);
    }

    /**
     * pbx-коды воронки и стадии сделки по bitrix-id из CRM (обратный резолв
     * через PortalModel). Воронка не заведена в pbx — коды остаются null и
     * приор не строится. Fail-open: ошибка портала паспорт не ломает.
     */
    private fillDealCodes(
        portal: PortalModel,
        passport: CallPassport,
        rawCategoryId: string | null = passport.categoryId,
        rawStageId: string | null = passport.stageId,
    ): void {
        try {
            const categoryId = rawCategoryId ?? '0';
            const category = portal
                .getDealCategories()
                .find(item => String(item.bitrixId) === categoryId);
            if (!category) return;
            passport.dealCategoryCode = category.code;
            const stageId = rawStageId;
            if (!stageId) return;
            // В pbx STAGE_ID хранится полностью (C5:PREPARATION); на случай
            // хранения без префикса воронки сверяем и по суффиксу.
            const suffix = stageId.split(':').pop();
            passport.dealStageCode =
                category.stages.find(
                    stage =>
                        stage.bitrixId === stageId || stage.bitrixId === suffix,
                )?.code ?? null;
        } catch {
            // портал без воронок/стадий — приор не строится
        }
    }

    /**
     * Коды воронки/стадии — от ПРАВИЛЬНОЙ сделки «ОП Основная» из раскладки
     * связей (запись «ОП История»/«ОП KPI» этого звонка, корневая сделка,
     * дотяжка по компании/контакту). Сырые stageId/categoryId паспорта
     * остаются от владельца звонка — это факт CRM; коды же нужны
     * классификатору, и брать их у сделки чужой воронки бессмысленно. Для
     * звонка по лиду коды дают семью его записи; приор лида остаётся
     * лидовым. Fail-open: не нашли — приора просто не будет.
     */
    private async fillCodesFromMainDeal(
        bitrix: BitrixService,
        portal: PortalModel,
        row: TranscriptionPipelineView,
        passport: CallPassport,
        callType: string | null,
    ): Promise<void> {
        if (!row.domain) return;
        try {
            // Полный контекст раскладки (лид-владелец, владелец звонка из
            // телефонии, тип): без них шаг 0 «ОП История» недостижим для
            // звонков по лиду — семья дотягивалась догадкой по клиенту.
            const args = familyResolveArgsOf(passport, row, callType);
            const family = await this.dealFamily.resolve(
                row.domain,
                args.dealId,
                args.context,
            );
            if (
                !family.mainDealId ||
                (passport.entityType === 'deal' &&
                    family.mainDealId === passport.entityId)
            ) {
                return;
            }
            const response = (await bitrix.api.call('crm.deal.get', {
                id: family.mainDealId,
            })) as {
                result?: { STAGE_ID?: string; CATEGORY_ID?: string | number };
            };
            const main = response?.result;
            if (!main) return;
            this.fillDealCodes(
                portal,
                passport,
                main.CATEGORY_ID != null ? String(main.CATEGORY_ID) : null,
                main.STAGE_ID ?? null,
            );
            this.logger.log(
                `Паспорт: коды воронки/стадии — от основной сделки ${family.mainDealId} ` +
                    `(воронка ${passport.dealCategoryCode ?? '—'}, стадия ` +
                    `${passport.dealStageCode ?? '—'}, источник ${family.source ?? '—'})`,
            );
        } catch (error) {
            this.logger.warn(
                `Паспорт: основная сделка для приора не получена: ${(error as Error).message}`,
            );
        }
    }

    /** Сделка/лид: стадия или статус. */
    private async fillCrmContext(
        bitrix: BitrixService,
        portal: PortalModel,
        row: TranscriptionPipelineView,
        passport: CallPassport,
        callType: string | null,
    ): Promise<void> {
        if (!row.entityId) return;
        const entityId = Number(row.entityId);
        if (row.entityType === 'deal') {
            const response = (await bitrix.api.call('crm.deal.get', {
                id: entityId,
            })) as {
                result?: Record<string, unknown> & {
                    STAGE_ID?: string;
                    CATEGORY_ID?: string | number;
                    CONTACT_ID?: string | number;
                    COMPANY_ID?: string | number;
                };
            };
            if (response?.result) {
                passport.certainty = 'rich';
                passport.entityType = 'deal';
                passport.entityId = entityId;
                passport.stageId = response.result.STAGE_ID ?? null;
                passport.categoryId =
                    response.result.CATEGORY_ID != null
                        ? String(response.result.CATEGORY_ID)
                        : null;
                passport.crmCompanyId = this.toId(response.result.COMPANY_ID);
                passport.crmContactId = this.toId(response.result.CONTACT_ID);
                this.fillDealCodes(portal, passport);
                // Воронка владельца звонка не из ОП — коды берём у
                // ПРАВИЛЬНОЙ сделки «ОП Основная» из раскладки связей,
                // иначе приора нет и тип скатывается в «Другое»
                // (прод 08.09.2026).
                if (!passport.dealCategoryCode) {
                    await this.fillCodesFromMainDeal(
                        bitrix,
                        portal,
                        row,
                        passport,
                        callType,
                    );
                }
                passport.callTypePrior = resolveCallTypePrior({
                    entityType: 'deal',
                    dealCategoryCode: passport.dealCategoryCode,
                    dealStageCode: passport.dealStageCode,
                    leadWorkKind: null,
                });
                this.appendOpHistory(portal, 'deal', response.result, passport);
                await this.fillContactPersona(
                    bitrix,
                    response.result.CONTACT_ID,
                    passport,
                );
                await this.fillCompanyPersona(
                    bitrix,
                    portal,
                    response.result.COMPANY_ID,
                    passport,
                );
            }
            return;
        }
        if (row.entityType === 'lead') {
            const response = (await bitrix.api.call('crm.lead.get', {
                id: entityId,
            })) as {
                result?: Record<string, unknown> &
                    PersonaFields & {
                        CONTACT_ID?: string | number;
                        COMPANY_ID?: string | number;
                        COMPANY_TITLE?: string;
                    };
            };
            if (response?.result) {
                passport.certainty = 'lead';
                passport.entityType = 'lead';
                passport.entityId = entityId;
                passport.leadStatusId = response.result.STATUS_ID ?? null;
                passport.leadWorkKind = this.detectLeadWork(
                    portal,
                    response.result,
                );
                passport.callTypePrior = resolveCallTypePrior({
                    entityType: 'lead',
                    dealCategoryCode: null,
                    dealStageCode: null,
                    leadWorkKind: passport.leadWorkKind,
                });
                passport.crmCompanyId = this.toId(response.result.COMPANY_ID);
                passport.crmContactId = this.toId(response.result.CONTACT_ID);
                passport.companyTitle = this.cleanText(
                    response.result.COMPANY_TITLE,
                );
                this.appendOpHistory(portal, 'lead', response.result, passport);
                this.applyPersona(response.result, passport);
                // Звонок по лиду: семья сделок — из записи «ОП История»/
                // «ОП KPI» этого звонка (шаг 0 раскладки, доступен только
                // с лидом-владельцем); коды основной сделки — в паспорт.
                await this.fillCodesFromMainDeal(
                    bitrix,
                    portal,
                    row,
                    passport,
                    callType,
                );
            }
        }
    }

    /**
     * Последние записи «ОП История» (op_mhistory) из строки сущности —
     * датированные заметки менеджера; берём хвост массива (свежие записи
     * дописываются в конец). Поле не заведено — тихий скип.
     */
    private appendOpHistory(
        portal: PortalModel,
        entityType: 'deal' | 'lead' | 'company',
        row: Record<string, unknown>,
        passport: CallPassport,
    ): void {
        try {
            const field = portal.getEntityFieldByCode(
                entityType,
                PBX_SALES_EVENT_FIELD_CODES.op_mhistory,
            );
            if (!field) return;
            const raw = row[portal.getFieldBitrixId(field)];
            const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
            const entries = values
                .map(value => this.cleanText(String(value), 200))
                .filter((value): value is string => value !== null);
            passport.opHistory = [...passport.opHistory, ...entries].slice(-6);
        } catch {
            // Поле истории недоступно — паспорт без него.
        }
    }

    /**
     * Карточка компании сделки: название (восстановление искажённых ASR
     * названий) и заметки менеджера. Недоступность — не ошибка.
     */
    private async fillCompanyPersona(
        bitrix: BitrixService,
        portal: PortalModel,
        companyId: string | number | undefined,
        passport: CallPassport,
    ): Promise<void> {
        const id = Number(companyId);
        if (!Number.isFinite(id) || id <= 0) return;
        try {
            const response = (await bitrix.api.call('crm.company.get', {
                id,
            })) as {
                result?: Record<string, unknown> & {
                    TITLE?: string;
                    COMMENTS?: string;
                };
            };
            if (!response?.result) return;
            passport.companyTitle = this.cleanText(response.result.TITLE);
            passport.companyNotes = this.cleanText(
                response.result.COMMENTS,
                400,
            );
            this.appendOpHistory(portal, 'company', response.result, passport);
        } catch {
            // Компания недоступна — паспорт остаётся без неё.
        }
    }

    /** Положительный числовой id или null. */
    private toId(raw: string | number | undefined): number | null {
        const id = Number(raw);
        return Number.isFinite(id) && id > 0 ? id : null;
    }

    /**
     * Персона собеседника из карточки контакта сделки (имя, должность,
     * заметки менеджера) — в карточке часто больше контекста, чем в самой
     * сделке. Недоступность контакта паспорт не роняет.
     */
    private async fillContactPersona(
        bitrix: BitrixService,
        contactId: string | number | undefined,
        passport: CallPassport,
    ): Promise<void> {
        const id = Number(contactId);
        if (!Number.isFinite(id) || id <= 0) return;
        try {
            const response = (await bitrix.api.call('crm.contact.get', {
                id,
            })) as { result?: PersonaFields };
            if (response?.result) this.applyPersona(response.result, passport);
        } catch {
            // Контакт недоступен — паспорт остаётся без персоны.
        }
    }

    /** Имя/должность/заметки из карточки лида или контакта. */
    private applyPersona(row: PersonaFields, passport: CallPassport): void {
        passport.contactName =
            this.cleanText([row.LAST_NAME, row.NAME].join(' ')) ?? null;
        passport.contactPosition = this.cleanText(row.POST);
        passport.crmNotes = this.cleanText(row.COMMENTS, 400);
    }

    /**
     * Текст поля CRM без HTML/BB-разметки, со схлопнутыми пробелами и
     * обрезкой; пусто → null.
     */
    private cleanText(raw: string | undefined, max = 200): string | null {
        if (typeof raw !== 'string') return null;
        const value = raw
            .replace(/<[^>]+>/g, ' ')
            .replace(/\[[^\]]+\]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!value) return null;
        return value.length > max ? `${value.slice(0, max)}…` : value;
    }

    /**
     * Вид работы лида — тем же детектором, что и хук lead-to-work
     * (наше поле вида работы → поля лидогена → метки пути заявки →
     * SOURCE_ID). Ошибка детекта паспорт не роняет: null = «не знаем».
     */
    private detectLeadWork(
        portal: PortalModel,
        lead: Record<string, unknown>,
    ): LeadWorkKind | null {
        try {
            return new LeadRequestDetectorService(portal).detect(lead).kind;
        } catch (error) {
            this.logger.warn(
                `Паспорт: вид работы лида не определён: ${(error as Error).message}`,
            );
            return null;
        }
    }

    /**
     * Направление из активности; для naked-паспорта — best-effort identity
     * по номеру телефона (crm.duplicate.findbycomm), строго suspected.
     */
    private async fillDirectionAndIdentity(
        bitrix: BitrixService,
        row: TranscriptionPipelineView,
        passport: CallPassport,
    ): Promise<void> {
        if (!row.activityId) return;
        const bx = new CallAnalysisBitrixService(bitrix);
        const activity = (await bx
            .getActivityById(Number(row.activityId))
            .catch(() => null)) as {
            DIRECTION?: string | number;
            COMMUNICATIONS?: { VALUE?: string }[];
        } | null;
        if (!activity) return;

        const direction = Number(activity.DIRECTION);
        passport.direction =
            direction === 2 ? 'outgoing' : direction === 1 ? 'incoming' : null;

        if (passport.certainty !== 'naked') return;
        const phone = activity.COMMUNICATIONS?.find(item =>
            Boolean(item?.VALUE),
        )?.VALUE;
        if (!phone) return;
        try {
            const found = (await bitrix.api.call('crm.duplicate.findbycomm', {
                type: 'PHONE',
                values: [phone],
            })) as {
                result?: {
                    CONTACT?: number[];
                    COMPANY?: number[];
                    LEAD?: number[];
                };
            };
            for (const entityType of ['CONTACT', 'COMPANY', 'LEAD'] as const) {
                for (const id of found?.result?.[entityType] ?? []) {
                    passport.identity.push({
                        entityType,
                        entityId: Number(id),
                        confidence: 'suspected',
                    });
                }
            }
        } catch (error) {
            this.logger.warn(
                `Паспорт: findbycomm не выполнен (${row.domain}): ${(error as Error).message}`,
            );
        }
    }

    /** Последние разборы той же сущности с их gigachat-резюме. */
    private async fillHistory(
        row: TranscriptionPipelineView,
        passport: CallPassport,
    ): Promise<void> {
        if (!row.domain || !row.entityType || !row.entityId) return;
        try {
            const previous = await this.transcriptionStore.findRecentByEntity(
                row.domain,
                row.entityType,
                row.entityId,
                row.id,
                3,
            );
            if (!previous.length) return;
            const records = await this.aiService.findByTranscriptionIds(
                previous.map(item => item.id),
            );
            passport.history = previous.map(item => ({
                startedAt: item.callStartedAt
                    ? new Date(item.callStartedAt).toISOString()
                    : null,
                resume:
                    records.find(
                        record =>
                            String(record.transcription_id) === item.id &&
                            record.type === CALL_RESUME_TYPE,
                    )?.result ?? null,
            }));
        } catch (error) {
            this.logger.warn(
                `Паспорт: история не собрана (${row.domain}): ${(error as Error).message}`,
            );
        }
    }
}
