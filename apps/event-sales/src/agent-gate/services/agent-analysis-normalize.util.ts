import { isTimecodeWithinDuration } from '@lib/call-lib';
import { Logger } from '@nestjs/common';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import {
    fiveKChecklistLines,
    hasChecklistAnswer,
    hvostChecklistLines,
} from './agent-analysis-checklist.util';
import { computeSpeechMetrics } from './speech-metrics.util';
import { sanitizeLatexDeep } from './text-sanitize.util';

/**
 * Разбор и проверка входящего анализа агента (гигиена строк, метрики кодом,
 * консистентность, достройка разборов) — вынесены из intake по лимиту файла.
 */

/** Вся входная нормализация — в прежнем порядке шагов intake. */
export function normalizeAgentAnalysis(
    transcriptionId: string,
    agentName: string,
    dto: AgentCallAnalysisDto,
    logger: Logger,
): AgentCallAnalysisDto {
    // Гигиена входа от LLM-агента: LaTeX-артефакты (\rightarrow → «→»)
    // и литеральные "null"-строки (боевые кейсы 2026-07-30).
    const sanitized = sanitizeLatexDeep(dto);
    warnStaleChecklistShape(transcriptionId, agentName, sanitized, logger);
    const withMetrics = applySpeechMetrics(transcriptionId, sanitized, logger);
    const consistent = enforceConsistency(transcriptionId, withMetrics, logger);
    return fillMethodologyAnalysis(consistent, logger);
}

/**
 * «Code computes numbers»: talkRatioPct и questionsCount считаются
 * кодом по размеченному агентом диалогу и перекрывают значения LLM
 * (LLM систематически ошибается в арифметике на длинных диалогах).
 * Без диалога метрики остаются агентскими. Исходный dto не мутируем.
 */
export function applySpeechMetrics(
    transcriptionId: string,
    dto: AgentCallAnalysisDto,
    logger: Logger,
): AgentCallAnalysisDto {
    const metrics = computeSpeechMetrics(dto.dialog);
    if (!metrics) return dto;
    if (
        dto.talkRatioPct !== undefined &&
        dto.talkRatioPct !== metrics.talkRatioPct
    ) {
        logger.log(
            `talkRatioPct агента ${dto.talkRatioPct} → ${metrics.talkRatioPct} (пересчёт кодом, transcription ${transcriptionId})`,
        );
    }
    if (
        dto.questionsCount !== undefined &&
        dto.questionsCount !== metrics.questionsCount
    ) {
        logger.log(
            `questionsCount агента ${dto.questionsCount} → ${metrics.questionsCount} (пересчёт кодом, transcription ${transcriptionId})`,
        );
    }
    return {
        ...dto,
        talkRatioPct: metrics.talkRatioPct,
        questionsCount: metrics.questionsCount,
    };
}

/**
 * Таймкоды цитат возражений (П6) сверяются с длительностью записи:
 * секунда за пределами записи (с запасом в секунду) обнуляется с
 * предупреждением — разбор принимается, ссылка на запись не ставится.
 * Длительность неизвестна — проверять нечем, таймкоды остаются.
 */
export function clampObjectionTimecodes(
    transcriptionId: string,
    dto: AgentCallAnalysisDto,
    durationSec: number | null,
    logger: Logger,
): AgentCallAnalysisDto {
    if (!dto.objections?.length) return dto;
    let dropped = 0;
    const objections = dto.objections.map(objection => {
        const start = objection.startSec ?? null;
        const end = objection.endSec ?? null;
        const startOk =
            start === null || isTimecodeWithinDuration(start, durationSec);
        const endOk =
            end === null ||
            (isTimecodeWithinDuration(end, durationSec) &&
                (start === null || end >= start));
        if (startOk && endOk) return objection;
        dropped += 1;

        return { ...objection, startSec: null, endSec: null };
    });
    if (dropped > 0) {
        logger.warn(
            `Таймкоды ${dropped} возражений вне записи ` +
                `(${durationSec ?? '?'} с) обнулены (transcription ${transcriptionId})`,
        );
    }

    return { ...dto, objections };
}

/**
 * Агент прислал разбор, но чек-лист приехал ПУСТЫМ — предупредить.
 *
 * ПОЧЕМУ ЭТО НЕ ПАРАНОЙЯ. Валидация приложения настроена как
 * `whitelist: true, forbidNonWhitelisted: false` (libs/core,
 * bootstrap-app): неизвестные ключи тела ВЫРЕЗАЮТСЯ МОЛЧА, без ошибки и
 * без 400. После переделки состава анкеты 01.09.2026 ключи
 * `hvostSteps` и `fiveKItems` сменились целиком (было offer/complect/
 * price/decisionDate/dateAgreed и clientWhat/clientReady/…, стало
 * desire/offered/priceReaction/decisionProcess/decisionWay и
 * client/company/colleagues/competitor/criteria).
 *
 * Внешний агент выкатывается ОТДЕЛЬНО от нас. Пока он на старом наборе,
 * его ответ приходит, проходит валидацию, теряет весь чек-лист по
 * дороге — и в карточке выглядит как «AI не смог разобрать звонок».
 * Отличить это от настоящего «модель не ответила» без этой строки
 * нечем.
 *
 * Симптом ловим по расхождению: итог (`hvostDone`/`fiveKDone`) или
 * текст разбора есть, а гранулярной структуры нет ни одной.
 */
export function warnStaleChecklistShape(
    transcriptionId: string,
    agentName: string,
    dto: AgentCallAnalysisDto,
    logger: Logger,
): void {
    const check = (
        block: 'hvostSteps' | 'fiveKItems',
        done: boolean | null | undefined,
        analysis: string | null | undefined,
    ): void => {
        const claimed =
            (done !== undefined && done !== null) || Boolean(analysis?.trim());
        if (!claimed) return;
        if (hasChecklistAnswer(dto[block])) return;
        logger.warn(
            `Агент «${agentName}» прислал разбор, но ${block} пуст ` +
                `(transcription ${transcriptionId}). Вероятная причина — ` +
                `СТАРЫЙ набор ключей: с 01.09.2026 состав анкеты сменился, ` +
                `а неизвестные ключи вырезаются валидацией молча. ` +
                `Актуальные ключи — в CALL_DEEP_ANALYSIS_SCHEMA.`,
        );
    };

    check('hvostSteps', dto.hvostDone, dto.hvostAnalysis);
    check('fiveKItems', dto.fiveKDone, dto.fiveKAnalysis);
}

/**
 * «Code fixes contradictions»: LLM иногда отдаёт внутренне
 * противоречивый ответ — правим кодом, не переспрашивая модель
 * (прод-кейсы 25.08.2026):
 * - дата и описание следующего шага есть, а set=false («созвон завтра
 *   в 14:00», но «шаг не назначен») → set=true;
 * - hvostDone/fiveKDone=true, а в их же разборе есть пункты «✗»
 *   (правило «частично = НЕ пройден») → false;
 * - гранулярный чеклист главнее итога: заполнен — итог «все пункты true».
 */
export function enforceConsistency(
    transcriptionId: string,
    dto: AgentCallAnalysisDto,
    logger: Logger,
): AgentCallAnalysisDto {
    const fixed = { ...dto };

    if (
        fixed.nextStep &&
        !fixed.nextStep.set &&
        fixed.nextStep.date &&
        fixed.nextStep.description
    ) {
        logger.log(
            `Консистентность: у шага есть дата (${fixed.nextStep.date}) и описание — ` +
                `set исправлен на true (transcription ${transcriptionId})`,
        );
        fixed.nextStep = { ...fixed.nextStep, set: true };
    }

    // Только явные крестики формата разбора («1. … — ✗ …»): текстовые
    // обороты вроде «— не потребовалось» дают ложные срабатывания.
    const hasFailMark = (text: string | null | undefined): boolean =>
        typeof text === 'string' && /[✗✘]/.test(text);
    if (fixed.hvostDone === true && hasFailMark(fixed.hvostAnalysis)) {
        logger.log(
            `Консистентность: hvostDone=true при «✗» в разборе хвоста — ` +
                `исправлен на false (частично ≠ пройден; transcription ${transcriptionId})`,
        );
        fixed.hvostDone = false;
    }
    if (fixed.fiveKDone === true && hasFailMark(fixed.fiveKAnalysis)) {
        logger.log(
            `Консистентность: fiveKDone=true при «✗» в разборе 5К — ` +
                `исправлен на false (transcription ${transcriptionId})`,
        );
        fixed.fiveKDone = false;
    }

    // Гранулярка главнее эвристик и мнения модели: если чеклист
    // заполнен (есть хоть один boolean-ответ), итог = «все пункты true».
    const recomputeDone = (
        items: Record<string, boolean | null | undefined> | null | undefined,
    ): boolean | undefined => {
        if (!items) return undefined;
        const values = Object.values(items);
        if (!values.some(v => typeof v === 'boolean')) return undefined;
        return values.every(v => v === true);
    };
    const hvostFromSteps = recomputeDone(
        fixed.hvostSteps as Record<string, boolean | null | undefined> | null,
    );
    if (hvostFromSteps !== undefined && fixed.hvostDone !== hvostFromSteps) {
        logger.log(
            `Консистентность: hvostDone ${fixed.hvostDone} → ${hvostFromSteps} ` +
                `(пересчёт по гранулярному чеклисту; transcription ${transcriptionId})`,
        );
        fixed.hvostDone = hvostFromSteps;
    }
    const fiveKFromItems = recomputeDone(
        fixed.fiveKItems as Record<string, boolean | null | undefined> | null,
    );
    if (fiveKFromItems !== undefined && fixed.fiveKDone !== fiveKFromItems) {
        logger.log(
            `Консистентность: fiveKDone ${fixed.fiveKDone} → ${fiveKFromItems} ` +
                `(пересчёт по гранулярному чеклисту; transcription ${transcriptionId})`,
        );
        fixed.fiveKDone = fiveKFromItems;
    }
    return fixed;
}

/**
 * Достройка разборов хвоста и 5К КОДОМ.
 *
 * Модель иногда возвращает итог (hvostDone/fiveKDone) и гранулярный
 * чеклист, но текст разбора оставляет пустым — в карточке появлялось
 * «5К: разбор AI — не заполнено» при заполненном хвосте (прод
 * 28.08.2026). Текст из чеклиста собирается детерминированно: он и так
 * состоит из тех же пунктов, что менеджер видит в своём отчёте.
 */
export function fillMethodologyAnalysis(
    dto: AgentCallAnalysisDto,
    logger: Logger,
): AgentCallAnalysisDto {
    const fixed = { ...dto };
    if (!fixed.hvostAnalysis?.trim() && hasChecklistAnswer(fixed.hvostSteps)) {
        fixed.hvostAnalysis = hvostChecklistLines(fixed.hvostSteps).join('\n');
        logger.log(
            'Разбор хвоста собран кодом из чеклиста (модель текст не прислала)',
        );
    }
    if (!fixed.fiveKAnalysis?.trim() && hasChecklistAnswer(fixed.fiveKItems)) {
        fixed.fiveKAnalysis = fiveKChecklistLines(fixed.fiveKItems).join('\n');
        logger.log(
            'Разбор 5К собран кодом из чеклиста (модель текст не прислала)',
        );
    }
    return fixed;
}
