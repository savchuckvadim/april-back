import { formatTimecode } from '@lib/call-lib';
import { LONG_CALL_EVENT_KIND_LABELS } from './long-call.const';
import { LONG_CALL_REASON_SEPARATOR } from './long-call-input.const';
import type {
    ExcerptCandidate,
    ExcerptSource,
    TimeSpan,
} from './long-call-input.types';
import type { FlatDigestEvent } from './long-call.types';

/**
 * Заголовки отрывков. Отрывок, который ни с кем не слит, подписан по своему
 * виду: отрезок сводки — границы и why, событие — время и вид, часть без
 * конспекта — номер. У слитого отрывка — границы по времени и причины всех
 * слитых через «; ».
 */

/** Какие причины идут в заголовке слитого первыми: сначала why, затем виды событий. */
const SOURCE_ORDER: readonly ExcerptSource[] = ['window', 'event', 'part'];

/** «12:05–13:40»; границы совпали — «12:05». */
export const spanText = (span: TimeSpan): string =>
    span.fromSec === span.toSec
        ? formatTimecode(span.fromSec)
        : `${formatTimecode(span.fromSec)}–${formatTimecode(span.toSec)}`;

/** «12:05–13:40: зачем читать»; why пусто — только границы. */
export function windowHeading(span: TimeSpan, why: string): string {
    return why ? `${spanText(span)}: ${why}` : spanText(span);
}

/** «21:30, возражение»; у события без времени — только вид. */
export function eventHeading(event: FlatDigestEvent): string {
    const label = LONG_CALL_EVENT_KIND_LABELS[event.kind];

    return event.startSec === null
        ? label
        : `${formatTimecode(event.startSec)}, ${label}`;
}

/** «часть 3, конспекта нет». */
export const partWithoutDigestReason = (partNumber: number): string =>
    `часть ${partNumber}, конспекта нет`;

/** Причины слитых отрывков без повторов: why отрезков, виды событий, части. */
function mergedReasons(members: readonly ExcerptCandidate[]): string[] {
    const reasons = SOURCE_ORDER.flatMap(source =>
        members
            .filter(member => member.source === source)
            .map(member => member.reason),
    );

    return [...new Set(reasons.filter(reason => reason.length > 0))];
}

/** Границы по времени всех слитых отрывков; времени ни у кого нет — null. */
function unionSpan(members: readonly ExcerptCandidate[]): TimeSpan | null {
    const spans = members.flatMap(member => (member.span ? [member.span] : []));
    if (spans.length === 0) return null;

    return {
        fromSec: Math.min(...spans.map(span => span.fromSec)),
        toSec: Math.max(...spans.map(span => span.toSec)),
    };
}

/** Заголовок отрывка, собранного из одного или нескольких кандидатов. */
export function mergedHeading(members: readonly ExcerptCandidate[]): string {
    if (members.length === 1) return members[0].heading;
    const span = unionSpan(members);
    const reasons = mergedReasons(members).join(LONG_CALL_REASON_SEPARATOR);
    if (span === null) return reasons;

    return reasons ? `${spanText(span)}: ${reasons}` : spanText(span);
}
