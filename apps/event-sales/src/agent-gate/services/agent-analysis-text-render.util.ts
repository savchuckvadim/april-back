import {
    CALL_REPORT_CALL_TYPE_ITEMS,
    CALL_REPORT_SECTIONS,
} from '@lib/call-lib';
import {
    AgentCallAnalysisDto,
    AgentDialogTurnDto,
    AgentSectionAnalysisDto,
} from '../dto/agent-analysis-request.dto';
import {
    fiveKChecklistLines,
    hvostChecklistLines,
} from './agent-analysis-checklist.util';
import { AgentCallDirection } from './agent-analysis-intake.types';

/**
 * Тексты разбора для таймлайна и полей транскрипта (разделы, методология,
 * диалог, дубль в сущность, аудио) — вынесены из intake; чистые функции.
 */

/** Строка без LLM-мусора: null/'null'/'undefined'/пусто → undefined. */
export function cleanText(
    value: string | null | undefined,
): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    // Пустышки от LLM: literal null/N/A и прочерки любых видов
    // («-», «—», «–», «−») — прод-кейс 18.08.2026: «Как было: —».
    if (!trimmed || /^(null|undefined|n\/a|[-—–−.]+)$/i.test(trimmed)) {
        return undefined;
    }
    return trimmed;
}

export function dialogRoleLabel(role: AgentDialogTurnDto['role']): string {
    if (role === 'manager') return 'Менеджер';
    if (role === 'client') return 'Клиент';
    return 'Другой участник';
}

/** Диалог с ролями одной строкой (для полей TRANSCRIPT_N); null — нет разметки. */
export function renderDialogText(
    dialog: AgentDialogTurnDto[] | undefined,
): string | null {
    if (!dialog?.length) return null;
    return dialog
        .map(turn => `${dialogRoleLabel(turn.role)}: ${turn.text}`)
        .join('\n');
}

/**
 * Диалог для таймлайна: реплики «Менеджер/Клиент» с выделением ролей,
 * разбитые на комменты по ~8к символов (лимиты таймлайна).
 */
export function renderDialogComments(
    dialog: AgentDialogTurnDto[] | undefined,
): string[] {
    if (!dialog?.length) return [];
    const lines = dialog.map(
        turn => `[b]${dialogRoleLabel(turn.role)}:[/b] ${turn.text}`,
    );
    const chunks: string[] = [];
    let current = '';
    for (const line of lines) {
        if (current && current.length + line.length + 2 > 8000) {
            chunks.push(current);
            current = '';
        }
        current += (current ? '\n\n' : '') + line;
    }
    if (current) chunks.push(current);
    return chunks.map(
        (chunk, index) =>
            `💬 [b]Диалог${chunks.length > 1 ? ` (часть ${index + 1}/${chunks.length})` : ''}[/b]\n\n${chunk}`,
    );
}

/** Русское название раздела рубрики по коду; код — если его нет в справочнике. */
function sectionTitle(code: string): string {
    return CALL_REPORT_SECTIONS.find(item => item.code === code)?.title ?? code;
}

/**
 * Одна таймлайн-запись раздела: как было / слабые места / варианты.
 * null — раздел-пустышка (агент прислал relevance>0 без содержимого,
 * например REFUSAL при звонке без отказов) — коммент не постится.
 */
export function renderSectionComment(
    section: AgentSectionAnalysisDto,
): string | null {
    const asWas = cleanText(section.asWas ?? section.analysis);
    const weaknesses = cleanText(section.weaknesses);
    const alternatives = (section.alternatives ?? [])
        .map(variant => cleanText(variant))
        .filter((variant): variant is string => Boolean(variant));
    const advice = cleanText(section.advice);
    if (!asWas && !weaknesses && !alternatives.length && !advice) {
        return null;
    }

    const score = Number.isFinite(Number(section.score))
        ? ` — ${section.score}/10`
        : '';
    let text = `[b]${sectionTitle(section.section)}[/b]${score}\n`;

    if (asWas) {
        text += `\n[b]Как было:[/b]\n${asWas}\n`;
    } else if (weaknesses || alternatives.length || advice) {
        // Разбор есть, а описания «как было» нет — честная строка
        // вместо прочерка (модель обязана иначе, но защищаемся).
        text += `\n[b]Как было:[/b]\nЭтап в разговоре не прозвучал.\n`;
    }
    if (weaknesses) {
        text += `\n[b]Что в таком подходе не самое лучшее:[/b]\n${weaknesses}\n`;
    }
    if (alternatives.length) {
        text +=
            `\n[b]Как можно было по-другому:[/b]\n` +
            alternatives
                .map((variant, index) => `${index + 1}) ${variant}`)
                .join('\n');
    } else if (advice) {
        text += `\n[b]Как можно было по-другому:[/b]\n${advice}`;
    }
    return text;
}

/**
 * Отдельные методологические записи таймлайна: «хвост», «5К» и сверка
 * с отчётом менеджера (порядок в массиве = порядок в ленте сверху вниз).
 * null/пустые — не постятся.
 */
export function renderMethodologyComments(dto: AgentCallAnalysisDto): string[] {
    const comments: string[] = [];
    const checklist = (lines: string[]): string =>
        '\n\nЧеклист (как в отчёте менеджера):\n' + lines.join('\n');
    const hvost = cleanText(dto.hvostAnalysis ?? undefined);
    if (dto.hvostDone !== undefined && dto.hvostDone !== null && hvost) {
        const steps = dto.hvostSteps
            ? checklist(hvostChecklistLines(dto.hvostSteps))
            : '';
        comments.push(
            `🏁 [b]Хвост (завершение презентации): ${
                dto.hvostDone ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'
            }[/b]\n\n${hvost}${steps}`,
        );
    }
    const fiveK = cleanText(dto.fiveKAnalysis ?? undefined);
    if (dto.fiveKDone !== undefined && dto.fiveKDone !== null && fiveK) {
        const items = dto.fiveKItems
            ? checklist(fiveKChecklistLines(dto.fiveKItems))
            : '';
        comments.push(
            `🎯 [b]5К (контроль после встречи): ${
                dto.fiveKDone ? 'ЗАКРЫТО' : 'НЕ ЗАКРЫТО'
            }[/b]\n\n${fiveK}${items}`,
        );
    }
    const comparison = cleanText(dto.reportComparison ?? undefined);
    if (comparison) {
        comments.push(`⚖️ [b]Сверка с отчётом менеджера[/b]\n\n${comparison}`);
    }
    return comments;
}

/**
 * Дубль анализа для таймлайна сделки/лида. В таймлайне — ТОЛЬКО русские
 * названия: внутренние коды (GREETING, cold, call-report-analyzer)
 * читателю ничего не говорят.
 */
export function renderAnalysisDuplicateComment(
    activityId: string | null,
    dto: AgentCallAnalysisDto,
): string {
    const sectionLines = (dto.sections ?? [])
        .filter(section => section.relevance > 0)
        .map(section => {
            const score =
                section.score !== undefined ? `${section.score}/10` : '—';
            return `• ${sectionTitle(section.section)}: ${score} (актуальность ${section.relevance}%)`;
        })
        .join('\n');
    const callTypeLabel =
        CALL_REPORT_CALL_TYPE_ITEMS.find(item => item.CODE === dto.callType)
            ?.VALUE ?? dto.callType;

    return (
        `🤖 [b]Глубокий AI-анализ звонка[/b] (активность #${activityId ?? '?'})\n\n` +
        `[b]Тип:[/b] ${callTypeLabel}\n` +
        (dto.score !== undefined
            ? `[b]Оценка:[/b] ${dto.score}/10${dto.scoreExplanation ? ` — ${dto.scoreExplanation.slice(0, 500)}` : ''}\n`
            : '') +
        `\n[b]Резюме:[/b]\n${dto.summary.slice(0, 1500)}\n` +
        (sectionLines ? `\n[b]Разделы:[/b]\n${sectionLines}\n` : '') +
        (dto.recommendations?.length
            ? `\n[b]Рекомендации:[/b]\n${dto.recommendations
                  .map(r => `• ${r}`)
                  .join('\n')
                  .slice(0, 1000)}\n`
            : '') +
        (dto.employeeRecommendations
            ? `\n[b]Сотруднику:[/b] ${dto.employeeRecommendations.slice(0, 500)}`
            : '')
    );
}

/**
 * Заголовок записи с аудио — человеческий, как у записей телефонии:
 * «Исходящий звонок · от 21.07.2026 13:00 · 12 мин».
 */
export function renderAudioCommentTitle(
    direction: AgentCallDirection | undefined,
    callStartedAt: Date | null,
    durationSec: string | null,
): string {
    const label =
        direction === 'outgoing'
            ? 'Исходящий звонок'
            : direction === 'incoming'
              ? 'Входящий звонок'
              : 'Запись разговора';
    const startedAt = callStartedAt
        ? new Date(callStartedAt).toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Europe/Moscow',
          })
        : null;
    const minutes = durationSec
        ? `${Math.max(1, Math.round(Number(durationSec) / 60))} мин`
        : null;
    return [label, startedAt ? `от ${startedAt}` : null, minutes]
        .filter(Boolean)
        .join(' · ');
}
