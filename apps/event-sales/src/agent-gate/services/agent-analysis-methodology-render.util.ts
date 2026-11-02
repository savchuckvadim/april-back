import { CALL_REPORT_SECTIONS } from '@lib/call-lib';
import type { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import type {
    AgentCapTriggeredDto,
    AgentCheckpointResultDto,
} from '../dto/agent-analysis-request/agent-methodology.dto';

/**
 * Записи таймлайна по методике (01.11.2026): пункты со статусами и
 * цитатами, спирали и сработавшие ограничители — то, что в поля карточки
 * не помещается. Только русские формулировки, без кодов. Чистые функции.
 */

const SECTION_TITLES: Readonly<Record<string, string>> = Object.fromEntries(
    CALL_REPORT_SECTIONS.map(section => [section.code, section.title]),
);

const STATUS_MARK: Readonly<
    Record<AgentCheckpointResultDto['status'], string>
> = {
    done: '✓',
    missed: '✗',
    not_applicable: '–',
};

/** Секунды → «мм:сс». */
const mmss = (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
};

function checkpointLine(checkpoint: AgentCheckpointResultDto): string {
    const mark = STATUS_MARK[checkpoint.status];
    const optional = checkpoint.mandatory ? '' : ' (по желанию)';
    if (checkpoint.status === 'not_applicable') {
        return `${mark} ${checkpoint.title}${optional} — не применимо к этому разговору`;
    }
    const quote = checkpoint.quote
        ? ` — «${checkpoint.quote}»${
              checkpoint.startSec !== null
                  ? ` (${mmss(checkpoint.startSec)})`
                  : ''
          }`
        : checkpoint.status === 'missed'
          ? ' — пропущено'
          : '';
    return `${mark} ${checkpoint.title}${optional}${quote}`;
}

/** Запись «Методика …: пунктов N из M» со списком пунктов и спиралями; нет методики — null. */
export function renderMethodologyCheckpointsComment(
    dto: AgentCallAnalysisDto,
): string | null {
    const outcome = dto.methodology;
    if (!outcome || outcome.checkpoints.length === 0) return null;
    const header = `📋 [b]Методика «${outcome.title}»: пунктов выполнено ${outcome.checkpointsDone} из ${outcome.checkpointsTotal}[/b]`;
    const lines = outcome.checkpoints.map(checkpointLine);
    const spirals =
        outcome.spirals !== null && outcome.spiralsFull !== null
            ? `\n\nСпирали презентации (потребность → свойство → связка → выгода → вопрос): полных ${outcome.spiralsFull} из ${outcome.spirals.length}`
            : '';
    return `${header}\n\n${lines.join('\n')}${spirals}`;
}

function capLine(cap: AgentCapTriggeredDto): string {
    const target =
        cap.target === 'total'
            ? 'Итоговая оценка'
            : (SECTION_TITLES[cap.target] ?? cap.target);
    const change =
        cap.before !== null && cap.after !== null
            ? `${cap.before} → ${cap.after}`
            : `не выше ${cap.max}`;
    return `• ${cap.title}: ${target} ${change} (потолок ${cap.max})`;
}

/** Запись «Оценка ограничена» по сработавшим ограничителям; ничего не срезано — null. */
export function renderCapsComment(dto: AgentCallAnalysisDto): string | null {
    const applied = (dto.capsTriggered ?? []).filter(cap => cap.applied);
    if (!applied.length) return null;
    return `⛔ [b]Оценка ограничена[/b]\n\n${applied.map(capLine).join('\n')}`;
}

/** Записи методики для таймлайна в порядке показа: пункты, затем ограничители. */
export function renderMethodologyCheckpointComments(
    dto: AgentCallAnalysisDto,
): string[] {
    return [
        renderMethodologyCheckpointsComment(dto),
        renderCapsComment(dto),
    ].filter((comment): comment is string => comment !== null);
}
