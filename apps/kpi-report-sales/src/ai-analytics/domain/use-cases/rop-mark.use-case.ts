import { BadRequestException, Injectable } from '@nestjs/common';
import { shiftDate, toPortalDate } from '@lib/sales-ai-analytics';
import {
    pickRopMarkCalls,
    ropMarkSeed,
    type RopMarkPick,
} from '@lib/sales-ai-analytics/model/rop-mark';
import {
    AI_ROP_MARK_MESSAGES,
    AI_ROP_MARK_WEEKLY_LIMIT,
    mondayOfIsoWeek,
} from '../../constants/ai-rop-mark.const';
import type {
    AiRopMarkListRequestDto,
    AiRopMarkPickRequestDto,
    AiRopMarkSaveRequestDto,
    AiRopMarkWeekRequestDto,
} from '../../dto/ai-rop-mark-request.dto';
import type {
    AiRopMarkSaveResultDto,
    AiRopMarkWeekDto,
} from '../../dto/ai-rop-mark.dto';
import { AiAnalyticsRopMarkStore } from '../../store/ai-analytics-rop-mark.store';
import type { RequesterAccess } from '../access/perimeter.util';
import { RequesterAccessService } from '../access/requester-access.service';
import { CallsLoader } from '../loaders/calls.loader';
import { isoWeekKey, portalRangeUtc } from '../loaders/period.util';
import { SmartLinkLoader } from '../loaders/smart-link.loader';
import { SettingsLoader } from '../loaders/settings.loader';
import {
    presentRopMarkWeek,
    toRopMarkCandidate,
} from '../presenter/rop-mark.presenter';

/** Границы недели проверки в TZ портала. */
interface RopMarkWeek {
    weekKey: string;
    /** Понедельник и воскресенье недели, 'YYYY-MM-DD'. */
    from: string;
    to: string;
    timeZone: string;
}

/**
 * Слепая проверка руководителя «три звонка недели» (план
 * `ai-sales-analytics-plan.md` §12 и §4.11; Фаза 2, поток 15).
 *
 * Система сама подбирает три звонка недели — с неуверенным типом, с
 * лучшим баллом (проверка на подыгрывание метрике) и случайный, — а
 * руководитель ставит метку: согласен ли он с оценкой, своя оценка,
 * разделы, почему так и как лучше. Подбор детерминирован по домену и
 * ключу недели, поэтому повтор запроса отдаёт тот же набор, а ночной шаг
 * конвейера и ручка не спорят друг с другом.
 *
 * ⚠ Слепой режим: до сохранения метки колонки оценки AI из ответа
 * вырезаются (`presentRopMarkWeek`). Гарантия действует ТОЛЬКО на этой
 * ручке — карточку разбора в Битрикс руководитель может открыть и увидеть
 * оценку. Метка руководителя — не для менеджеров: все три метода
 * доступны только ролям cup/op/group, менеджеру — 403.
 *
 * Bitrix здесь не инжектится: звонки приходят из лёгкой выборки call-lib,
 * портал — параметром `domain`.
 */
@Injectable()
export class RopMarkUseCase {
    constructor(
        private readonly store: AiAnalyticsRopMarkStore,
        private readonly access: RequesterAccessService,
        private readonly settings: SettingsLoader,
        private readonly calls: CallsLoader,
        private readonly smartLinks: SmartLinkLoader,
    ) {}

    /**
     * Подбор трёх звонков недели. Сохранённый подбор переиспользуется
     * (тот же набор и то же зерно), `forceRefresh` пересобирает его по
     * текущим звонкам недели.
     */
    async pick(
        dto: AiRopMarkPickRequestDto,
        access: RequesterAccess,
        now: Date = new Date(),
    ): Promise<AiRopMarkWeekDto> {
        this.access.assertLeader(access);
        const week = await this.weekOf(dto, now);
        const saved = await this.store.loadPick(dto.domain, week.weekKey);
        if (saved && !dto.forceRefresh) {
            return this.present(
                dto.domain,
                week,
                saved.calls,
                saved.generatedAt,
                access,
            );
        }
        const seed = ropMarkSeed(dto.domain, week.weekKey);
        const calls = pickRopMarkCalls(
            await this.candidates(dto.domain, week),
            {
                seed,
                limit: AI_ROP_MARK_WEEKLY_LIMIT,
            },
        );
        const generatedAt = now.toISOString();
        await this.store.savePick({
            domain: dto.domain,
            weekKey: week.weekKey,
            seed,
            generatedAt,
            calls,
        });
        return this.present(dto.domain, week, calls, generatedAt, access);
    }

    /** Подбор недели и метки по нему; подбора нет — пустой список. */
    async list(
        dto: AiRopMarkListRequestDto,
        access: RequesterAccess,
        now: Date = new Date(),
    ): Promise<AiRopMarkWeekDto> {
        this.access.assertLeader(access);
        const week = await this.weekOf(dto, now);
        const saved = await this.store.loadPick(dto.domain, week.weekKey);
        return this.present(
            dto.domain,
            week,
            saved?.calls ?? [],
            saved?.generatedAt ?? '',
            access,
        );
    }

    /**
     * Метка по одному звонку подбора. Повторная метка заменяет прежнюю
     * (та уходит в superseded) и слепой уже не считается: к этому моменту
     * ручка оценку AI по звонку раскрыла.
     */
    async save(
        dto: AiRopMarkSaveRequestDto,
        access: RequesterAccess,
        now: Date = new Date(),
    ): Promise<AiRopMarkSaveResultDto> {
        this.access.assertLeader(access);
        const week = await this.weekOf(dto, now);
        const saved = await this.store.loadPick(dto.domain, week.weekKey);
        if (!saved) {
            throw new BadRequestException(AI_ROP_MARK_MESSAGES.pickMissing);
        }
        const call = saved.calls.find(
            item => item.transcriptionId === dto.transcriptionId,
        );
        if (!call) {
            throw new BadRequestException(AI_ROP_MARK_MESSAGES.callNotPicked);
        }
        this.access.assertVisible(access, call.managerId);
        const previous = await this.store.listMarks(dto.domain, week.weekKey);
        const replaced = previous.some(
            mark => mark.transcriptionId === dto.transcriptionId,
        );
        const { id, replacedIds } = await this.store.saveMark({
            domain: dto.domain,
            transcriptionId: dto.transcriptionId,
            managerId: call.managerId,
            requesterUserId: dto.requesterUserId,
            weekKey: week.weekKey,
            reason: call.reason,
            agree: dto.agree,
            ropScore: dto.ropScore ?? null,
            sections: dto.sections ?? [],
            why: dto.why ?? '',
            howTo: dto.howTo ?? '',
            blind: !replaced,
        });
        return {
            id,
            replaced: replaced || replacedIds.length > 0,
            blind: !replaced,
        };
    }

    /** Неделя запроса: ключ, дата или текущая неделя портала. */
    private async weekOf(
        dto: AiRopMarkWeekRequestDto,
        now: Date,
    ): Promise<RopMarkWeek> {
        const { calendar } = await this.settings.load(dto.domain);
        const day = dto.date ?? toPortalDate(now, calendar.timeZone);
        const weekKey = dto.weekKey ?? isoWeekKey(day);
        const from = mondayOfIsoWeek(weekKey);
        return {
            weekKey,
            from,
            to: shiftDate(from, 6),
            timeZone: calendar.timeZone,
        };
    }

    /** Кандидаты недели: лёгкая выборка звонков портала за окно недели. */
    private async candidates(domain: string, week: RopMarkWeek) {
        const { from, to } = portalRangeUtc(week.from, week.to, week.timeZone);
        const rows = await this.calls.loadLite(domain, from, to);
        return rows.flatMap(toRopMarkCandidate);
    }

    /** Ответ ручки: подбор, метки и слепой режим (см. presenter). */
    private async present(
        domain: string,
        week: RopMarkWeek,
        calls: readonly RopMarkPick[],
        generatedAt: string,
        access: RequesterAccess,
    ): Promise<AiRopMarkWeekDto> {
        const marks = calls.length
            ? await this.store.listMarks(domain, week.weekKey)
            : [];
        const presented = presentRopMarkWeek({
            weekKey: week.weekKey,
            from: week.from,
            to: week.to,
            generatedAt,
            calls,
            marks,
            access,
        });
        // Ссылки на карточки разборов (как в повестке): без элемента в
        // смарте — null; ошибка загрузчика не роняет ответ.
        const links = await this.smartLinks.resolveLinks(
            domain,
            presented.calls.map(call => call.transcriptionId),
        );
        return {
            ...presented,
            calls: presented.calls.map(call => ({
                ...call,
                link: links.get(call.transcriptionId) ?? null,
            })),
        };
    }
}
