import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { BitrixOwnerTypeId } from '@lib/bitrix';
import { BxDepartmentService } from 'libs/bx-department/services/bx-department.service';
import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    buildDedupKey,
    CallAnalysisBitrixService,
    CallReportBaseItemService,
    TranscriptionStoreService,
} from '@lib/call-lib';
import {
    VoximplantCallRow,
    VoximplantCallsService,
} from '../services/voximplant-calls.service';
import {
    CallReportJobPayload,
    CallReportPipelineUseCase,
} from './call-report-pipeline.use-case';
import { AnalyzeCallDto } from '../dto/call-report-request.dto';
import {
    AnalyzeCallItemDto,
    AnalyzeCallsResponseDto,
} from '../dto/call-report-response.dto';

/** Дефолты режима подбора. */
const DEFAULT_SELECTION_LIMIT = 1;
const DEFAULT_SELECTION_WINDOW_HOURS = 168;

/**
 * Ручной анализ звонков (смоук/отладка), два режима:
 *
 * 1. Прямой (activityId задан): dealId опционален — определяется по
 *    владельцу активности (владелец обязан быть сделкой: контур 1
 *    работает по сделкам).
 * 2. Подбор (activityId нет): последние записи из voximplant-статистики
 *    по фильтрам dealId ИЛИ userId (bitrix-id менеджера портала),
 *    limit (сколько последних взять) и maxDurationSec («не более»).
 *    Кандидаты обрабатываются синхронно по очереди; ошибка одного
 *    звонка не прерывает остальные (status=error в results).
 *
 * Уже обработанные звонки (dedup_key занят) пропускаются — их данные
 * уже в БД, повторный прогон только жёг бы бюджет транскрибации.
 */
@Injectable()
export class CallReportAnalyzeUseCase {
    private readonly logger = new Logger(CallReportAnalyzeUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly pipeline: CallReportPipelineUseCase,
        private readonly transcriptionStore: TranscriptionStoreService,
        private readonly baseItem: CallReportBaseItemService,
        private readonly bxDepartmentService: BxDepartmentService,
    ) {}

    async execute(dto: AnalyzeCallDto): Promise<AnalyzeCallsResponseDto> {
        if (dto.activityId) {
            return this.runDirect(dto);
        }
        if (!dto.dealId && !dto.userId) {
            // Режим department: менеджеры определяются автоматически из
            // отдела продаж портала — как в cron-сканере, но с диагностикой
            // (salesUserIds в ответе: видно, кого нашёл bx-department).
            return this.runDepartmentSelection(dto);
        }
        return this.runSelection(dto);
    }

    /** Режим department: подбор по всем менеджерам ОП (bx-department). */
    private async runDepartmentSelection(
        dto: AnalyzeCallDto,
    ): Promise<AnalyzeCallsResponseDto> {
        const response = await this.bxDepartmentService.getFullDepartment(
            dto.domain,
            EDepartamentGroup.sales,
        );
        const salesUserIds = Array.from(
            new Set(
                (response.department.allUsers ?? [])
                    .map(user => Number(user.ID))
                    .filter(id => Number.isFinite(id) && id > 0),
            ),
        );
        if (!salesUserIds.length) {
            throw new BadRequestException(
                `Отдел продаж на ${dto.domain} пуст или не настроен ` +
                    '(bx-department) — укажите userId явно',
            );
        }
        this.logger.log(
            `Режим department (${dto.domain}): менеджеры ОП [${salesUserIds.join(', ')}]`,
        );
        const result = await this.runSelection(dto, new Set(salesUserIds));
        return { ...result, mode: 'department', salesUserIds };
    }

    /** Прямой режим: конкретная активность, сделка — из владельца при необходимости. */
    private async runDirect(
        dto: AnalyzeCallDto,
    ): Promise<AnalyzeCallsResponseDto> {
        const activityId = dto.activityId as number;
        this.logger.log(
            `Прямой анализ: ${dto.domain}, activity ${activityId}, deal ${dto.dealId ?? 'по владельцу'}`,
        );

        let dealId = dto.dealId;
        let entityType: 'deal' | 'lead' = 'deal';
        if (!dealId) {
            const { bitrix } = await this.pbxService.init(dto.domain);
            const bx = new CallAnalysisBitrixService(bitrix);
            const activity = await bx.getActivityById(activityId);
            if (!activity) {
                throw new NotFoundException(
                    `Активность ${activityId} не найдена (${dto.domain})`,
                );
            }
            const resolved = this.resolveOwner(activity.OWNER_TYPE_ID);
            if (!resolved) {
                throw new BadRequestException(
                    `Активность ${activityId} принадлежит не сделке и не лиду ` +
                        `(OWNER_TYPE_ID=${activity.OWNER_TYPE_ID}) — укажите dealId явно`,
                );
            }
            entityType = resolved;
            dealId = Number(activity.OWNER_ID);
            this.logger.log(`Владелец активности: ${entityType} ${dealId}`);
        }

        const item = await this.runPipelineSafe(
            {
                domain: dto.domain,
                activityId,
                dealId,
                entityType,
                durationSec: dto.durationSec,
            },
            dto.createSmartItem,
        );
        return {
            domain: dto.domain,
            mode: 'direct',
            found: 1,
            skippedAlreadyProcessed: 0,
            skippedNonDeal: 0,
            skippedNoAudio: 0,
            results: [item],
        };
    }

    /**
     * Режим подбора: последние записи по dealId/userId из voximplant.
     * salesFilter (режим department) — допустимые PORTAL_USER_ID менеджеров ОП.
     */
    private async runSelection(
        dto: AnalyzeCallDto,
        salesFilter?: Set<number>,
    ): Promise<AnalyzeCallsResponseDto> {
        const limit = dto.limit ?? DEFAULT_SELECTION_LIMIT;
        const windowHours = dto.windowHours ?? DEFAULT_SELECTION_WINDOW_HOURS;
        const sinceIso = new Date(
            Date.now() - windowHours * 60 * 60 * 1000,
        ).toISOString();
        this.logger.log(
            `Подбор звонков: ${dto.domain}, deal=${dto.dealId ?? '—'}, ` +
                `user=${dto.userId ?? '—'}, limit=${limit}, ` +
                `duration=${dto.minDurationSec ?? 0}..${dto.maxDurationSec ?? '∞'}с, окно ${windowHours}ч`,
        );

        const { bitrix } = await this.pbxService.init(dto.domain);
        const voximplant = new VoximplantCallsService(bitrix);
        const bx = new CallAnalysisBitrixService(bitrix);

        const rows = await voximplant.findRecentCalls({
            sinceIso,
            minDurationSec: dto.minDurationSec ?? 0,
        });

        // Свежие первыми: «последние N записей».
        const candidates = rows
            .filter(row => this.matchesSelection(row, dto, salesFilter))
            .sort(
                (a, b) =>
                    new Date(b.CALL_START_DATE ?? 0).getTime() -
                    new Date(a.CALL_START_DATE ?? 0).getTime(),
            );

        const response: AnalyzeCallsResponseDto = {
            domain: dto.domain,
            mode: 'selection',
            found: candidates.length,
            skippedAlreadyProcessed: 0,
            skippedNonDeal: 0,
            skippedNoAudio: 0,
            results: [],
        };

        const busy = await this.transcriptionStore.filterBusyDedupKeys(
            candidates.map(row =>
                buildDedupKey(dto.domain, String(row.CRM_ACTIVITY_ID)),
            ),
        );

        for (const row of candidates) {
            if (response.results.length >= limit) break;
            const activityId = Number(row.CRM_ACTIVITY_ID);

            if (busy.has(buildDedupKey(dto.domain, activityId))) {
                response.skippedAlreadyProcessed++;
                this.logger.log(
                    `Пропуск activity ${activityId}: уже обработан (данные в БД)`,
                );
                continue;
            }

            const activity = await bx.getActivityById(activityId);
            if (!activity) {
                this.logger.warn(
                    `Активность ${activityId} не найдена — пропуск`,
                );
                continue;
            }
            // Звонки берём и по сделкам, и по лидам (активные продажи).
            const entityType = this.resolveOwner(activity.OWNER_TYPE_ID);
            if (!entityType) {
                response.skippedNonDeal++;
                continue;
            }
            // Фильтр по сделке проверяем по владельцу активности — надёжнее,
            // чем CRM_ENTITY_TYPE строки статистики (формат зависит от портала).
            if (dto.dealId && Number(activity.OWNER_ID) !== dto.dealId) {
                continue;
            }
            if (!activity.FILES?.length) {
                response.skippedNoAudio++;
                continue;
            }

            const item = await this.runPipelineSafe(
                {
                    domain: dto.domain,
                    activityId,
                    dealId: Number(activity.OWNER_ID),
                    entityType,
                    callId: row.CALL_ID,
                    callStartedAtIso: row.CALL_START_DATE,
                    durationSec: row.CALL_DURATION
                        ? Number(row.CALL_DURATION)
                        : undefined,
                },
                dto.createSmartItem,
            );
            // Чей звонок реально взялся — диагностика режима department.
            item.userId = Number(row.PORTAL_USER_ID) || undefined;
            response.results.push(item);
        }

        this.logger.log(
            `Подбор завершён: кандидатов ${response.found}, обработано ${response.results.length}, ` +
                `уже обработано ${response.skippedAlreadyProcessed}, не сделки ${response.skippedNonDeal}, ` +
                `без аудио ${response.skippedNoAudio}`,
        );
        return response;
    }

    /** Фильтры режима подбора, применимые к строке voximplant-статистики. */
    private matchesSelection(
        row: VoximplantCallRow,
        dto: AnalyzeCallDto,
        salesFilter?: Set<number>,
    ): boolean {
        if (!row.CRM_ACTIVITY_ID) return false;
        if (dto.userId && Number(row.PORTAL_USER_ID) !== dto.userId) {
            return false;
        }
        if (salesFilter && !salesFilter.has(Number(row.PORTAL_USER_ID))) {
            return false;
        }
        if (
            dto.maxDurationSec !== undefined &&
            Number(row.CALL_DURATION ?? 0) > dto.maxDurationSec
        ) {
            return false;
        }
        return true;
    }

    /** Владелец активности → тип сущности конвейера; null — не поддержан. */
    private resolveOwner(
        ownerTypeId: string | number | undefined,
    ): 'deal' | 'lead' | null {
        const id = Number(ownerTypeId);
        if (id === Number(BitrixOwnerTypeId.DEAL)) return 'deal';
        if (id === Number(BitrixOwnerTypeId.LEAD)) return 'lead';
        return null;
    }

    /** Пайплайн одного звонка; ошибка → item со status=error (батч продолжается). */
    private async runPipelineSafe(
        payload: CallReportJobPayload,
        createSmartItem?: boolean,
    ): Promise<AnalyzeCallItemDto> {
        try {
            const result = await this.pipeline.execute(payload);
            const item: AnalyzeCallItemDto = {
                activityId: payload.activityId,
                dealId: payload.dealId,
                status: 'done',
                transcriptionId: result.transcriptionId,
                provider: result.provider,
                callType: result.callType,
                resumeSaved: result.resumeSaved,
                recomendationSaved: result.recomendationSaved,
            };
            // Полный flow одним вызовом: базовый смарт-элемент (транскрипт,
            // связи, gigachat, запись звонка) без глубокого анализа агента —
            // агент потом дополнит тот же элемент (upsert по xmlId).
            if (createSmartItem) {
                item.smartItemId = await this.baseItem
                    .createBaseItem(result.transcriptionId, result.callType)
                    .catch((error: Error) => {
                        this.logger.warn(
                            `Базовый смарт-элемент не создан (transcription ${result.transcriptionId}): ${error.message}`,
                        );
                        return null;
                    });
            }
            return item;
        } catch (error) {
            this.logger.error(
                `Анализ activity ${payload.activityId} упал: ${(error as Error).message}`,
            );
            return {
                activityId: payload.activityId,
                dealId: payload.dealId,
                status: 'error',
                error: (error as Error).message,
            };
        }
    }
}
