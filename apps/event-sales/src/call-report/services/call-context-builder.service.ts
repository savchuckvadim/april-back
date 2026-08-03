import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { BitrixService } from '@lib/bitrix';
import {
    AiService,
    CALL_RESUME_TYPE,
    CallAnalysisBitrixService,
    TranscriptionPipelineView,
    TranscriptionStoreService,
} from '@lib/call-lib';

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
            direction: null,
            identity: [],
            history: [],
        };
        if (!row.domain) return passport;

        try {
            const { bitrix } = await this.pbxService.init(row.domain);
            await this.fillCrmContext(bitrix, row, passport);
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
        } else {
            lines.push(
                '- CRM-контекст НЕИЗВЕСТЕН (сырой лид или звонок без привязки). ' +
                    'ВАЖНО: это может быть действующий клиент с незнакомого номера — ' +
                    'этап определяй только по содержанию разговора и НЕ штрафуй за «неуместность» этапов.',
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

    /** Сделка/лид: стадия или статус. */
    private async fillCrmContext(
        bitrix: BitrixService,
        row: TranscriptionPipelineView,
        passport: CallPassport,
    ): Promise<void> {
        if (!row.entityId) return;
        const entityId = Number(row.entityId);
        if (row.entityType === 'deal') {
            const response = (await bitrix.api.call('crm.deal.get', {
                id: entityId,
            })) as {
                result?: { STAGE_ID?: string; CATEGORY_ID?: string | number };
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
            }
            return;
        }
        if (row.entityType === 'lead') {
            const response = (await bitrix.api.call('crm.lead.get', {
                id: entityId,
            })) as { result?: { STATUS_ID?: string } };
            if (response?.result) {
                passport.certainty = 'lead';
                passport.entityType = 'lead';
                passport.entityId = entityId;
                passport.leadStatusId = response.result.STATUS_ID ?? null;
            }
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
