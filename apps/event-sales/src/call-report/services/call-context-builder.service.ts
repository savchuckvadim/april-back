import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
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
import { LeadRequestDetectorService } from '../../sales-hooks/lead-to-work/services/lead-request-detector.service';
import { LeadWorkKind } from '../../shared/event-title';

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

    constructor(
        private readonly pbxService: PBXService,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly aiService: AiService,
    ) {}

    async build(row: TranscriptionPipelineView): Promise<CallPassport> {
        const passport: CallPassport = {
            certainty: 'naked',
            entityType: null,
            entityId: null,
            stageId: null,
            categoryId: null,
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
            direction: null,
            identity: [],
            history: [],
        };
        if (!row.domain) return passport;

        try {
            const { bitrix, PortalModel } = await this.pbxService.init(
                row.domain,
            );
            await this.fillCrmContext(bitrix, PortalModel, row, passport);
            await this.fillDirectionAndIdentity(bitrix, row, passport);
        } catch (error) {
            this.logger.warn(
                `Паспорт: CRM-контекст не собран (${row.domain}): ${(error as Error).message}`,
            );
        }
        await this.fillHistory(row, passport);
        return passport;
    }

    /** Текстовый блок паспорта для user-части промпта разбора. */
    renderForPrompt(passport: CallPassport): string {
        const lines: string[] = ['', 'КОНТЕКСТ ИЗ CRM (паспорт звонка):'];
        if (passport.certainty === 'rich') {
            lines.push(
                `- Звонок по СДЕЛКЕ #${passport.entityId}, стадия ${passport.stageId ?? '—'}` +
                    (passport.categoryId
                        ? `, воронка ${passport.categoryId}`
                        : '') +
                    '. Этап переговоров известен ДОСТОВЕРНО — оценивай уместность разделов относительно него.',
            );
        } else if (passport.certainty === 'lead') {
            lines.push(
                `- Звонок по ЛИДУ #${passport.entityId}, статус ${passport.leadStatusId ?? '—'}. ` +
                    'Стадии переговоров нет — этап определяй по содержанию разговора, уместность оценивай мягко.',
            );
            if (passport.leadWorkKind === 'request') {
                lines.push(
                    '- Лид создан ВХОДЯЩЕЙ ЗАЯВКОЙ (клиент сам оставил контакты на сайте: прайс, демо-доступ, документ, семинар). ' +
                        'Клиент ждёт звонка, но может оказаться не-ЦА — оценивай по регламенту заявок: легализация, фильтр ЦА, предложение зайти в систему.',
                );
            } else if (passport.leadWorkKind === 'lead') {
                lines.push(
                    '- Лид создан ВХОДЯЩИМ ОБРАЩЕНИЕМ клиента (звонок/письмо/чат) — это не холодный выход менеджера.',
                );
            }
        } else {
            lines.push(
                '- CRM-контекст НЕИЗВЕСТЕН (сырой лид или звонок без привязки). ' +
                    'ВАЖНО: это может быть действующий клиент с незнакомого номера — ' +
                    'этап определяй только по содержанию разговора и НЕ штрафуй за «неуместность» этапов.',
            );
        }
        const persona: string[] = [];
        if (passport.contactName) persona.push(passport.contactName);
        if (passport.contactPosition) {
            persona.push(`должность «${passport.contactPosition}»`);
        }
        if (persona.length) {
            lines.push(
                `- Собеседник по данным CRM: ${persona.join(', ')}. ` +
                    'Подсказка для специализации показа (бухгалтер/юрист/кадровик) и восстановления искажённых распознаванием имён; лексика разговора важнее.',
            );
        }
        if (passport.crmNotes) {
            lines.push(
                `- Заметки менеджера из CRM: «${passport.crmNotes}». Фон для разбора; могут быть устаревшими.`,
            );
        }
        if (passport.companyTitle) {
            lines.push(
                `- Компания клиента по данным CRM: «${passport.companyTitle}». ` +
                    'Используй для восстановления искажённого распознаванием названия.',
            );
        }
        if (passport.companyNotes) {
            lines.push(
                `- Заметки менеджера о компании: «${passport.companyNotes}». Могут быть устаревшими.`,
            );
        }
        if (passport.opHistory.length) {
            lines.push(
                '- «ОП История» из CRM — последние записи менеджера о касаниях клиента:',
            );
            for (const entry of passport.opHistory) {
                lines.push(`  • ${entry}`);
            }
            lines.push(
                '  Сверь разговор с этими записями: прошлые договорённости и обещания — фон для оценки; записи могут быть неполными.',
            );
        }
        if (passport.direction) {
            lines.push(
                passport.direction === 'outgoing'
                    ? '- Звонок ИСХОДЯЩИЙ: инициатор — менеджер. Приветствие оценивай как вход менеджера: представление, цель звонка в первые секунды, опора на прошлую договорённость.'
                    : '- Звонок ВХОДЯЩИЙ (редкий случай): оценивай скорость включения менеджера в запрос клиента.',
            );
        }
        if (passport.identity.length) {
            const found = passport.identity
                .map(item => `${item.entityType} #${item.entityId}`)
                .join(', ');
            lines.push(
                `- По номеру телефона ПРЕДПОЛОЖИТЕЛЬНО найдены: ${found}. Это догадка (suspected), не факт — не выдавай её за установленную связь.`,
            );
        }
        if (passport.history.length) {
            lines.push(
                '- История прошлых звонков этой сущности (новые первыми):',
            );
            for (const item of passport.history) {
                const date = item.startedAt
                    ? new Date(item.startedAt).toLocaleDateString('ru-RU')
                    : 'дата неизвестна';
                lines.push(
                    `  • [${date}] ${this.trim(item.resume ?? 'резюме отсутствует', 400)}`,
                );
            }
            lines.push(
                '  Сверь этот разговор с историей: невыполненные обещания и потерянные договорённости — обязательный флаг в разборе.',
            );
        }
        return lines.join('\n');
    }

    /**
     * Короткая CRM-подсказка для дешёвого классификатора типа звонка:
     * только факты, влияющие на выбор типа (заявка/обращение/сделка).
     * null — подсказать нечего, инструкция классификатора не меняется.
     */
    renderClassifyHint(passport: CallPassport): string | null {
        const facts: string[] = [];
        if (passport.leadWorkKind === 'request') {
            facts.push(
                'звонок идёт по лиду, созданному ВХОДЯЩЕЙ ЗАЯВКОЙ с сайта ' +
                    '(клиент сам оставил контакты) — если менеджер ссылается ' +
                    "на заявку/оставленные контакты, это тип 'site_lead'",
            );
        } else if (passport.leadWorkKind === 'lead') {
            facts.push(
                'звонок идёт по лиду из входящего обращения клиента ' +
                    '(звонок/письмо/чат) — это НЕ холодный выход менеджера',
            );
        }
        if (passport.certainty === 'rich') {
            facts.push(
                'звонок привязан к сделке — переговоры уже идут, первый ' +
                    'холодный контакт маловероятен',
            );
        }
        if (!facts.length) return null;
        return `\n\nКОНТЕКСТ ИЗ CRM (подсказка, не приговор — решает содержание разговора):\n- ${facts.join('\n- ')}`;
    }

    /** Сделка/лид: стадия или статус. */
    private async fillCrmContext(
        bitrix: BitrixService,
        portal: PortalModel,
        row: TranscriptionPipelineView,
        passport: CallPassport,
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
                passport.crmCompanyId = this.toId(response.result.COMPANY_ID);
                passport.crmContactId = this.toId(response.result.CONTACT_ID);
                passport.companyTitle = this.cleanText(
                    response.result.COMPANY_TITLE,
                );
                this.appendOpHistory(portal, 'lead', response.result, passport);
                this.applyPersona(response.result, passport);
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

    private trim(value: string, max: number): string {
        return value.length > max ? `${value.slice(0, max)}…` : value;
    }
}
