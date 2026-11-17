import { departmentSectionBenchmarks } from '../attention.sections.util';
import type { AttentionSectionMean } from '../attention.types';
import type { ManagerQualityFacts } from '../quality-facts.types';
import { DIGEST_UNIT } from './period-digest.codes';
import {
    DigestPeer,
    digestStandingsOf,
    withSectionStandings,
} from './period-digest.department';
import {
    DIGEST_DEFAULT_SHIFT,
    DIGEST_MIN_PEERS,
    DigestShift,
    digestShiftOf,
} from './period-digest.thresholds';
import type {
    DigestManagerStandings,
    DigestMetrics,
    DigestSectionStat,
    DigestValue,
} from './period-digest.types';

/**
 * ОТДЕЛ ДЛЯ КАРТОЧЕК: один проход по всем менеджерам выпуска до сборки
 * карточек — положение словами по средней оценке, шагу с датой и разделам
 * и ориентиры разделов для правил «Внимания» (средние отдела, а если в
 * отделе меньше трёх менеджеров с данными — всей структуры). Чистые
 * функции.
 */

/** Менеджер выпуска: отдел, метрики периода и факты качества. */
export interface DigestMember {
    readonly managerId: string;
    readonly departmentId: number | null;
    readonly metrics: DigestMetrics;
    readonly quality: Pick<ManagerQualityFacts, 'presentation' | 'followup'>;
}

/** Что карточка менеджера берёт из сравнения с другими. */
export interface DigestPeerView {
    readonly standings: DigestManagerStandings;
    /** Разделы менеджера с положением в отделе. */
    readonly sections: readonly DigestSectionStat[];
    /** Средние разделов отдела (или структуры) для правил «Внимания». */
    readonly benchmarks: readonly AttentionSectionMean[];
}

export interface DigestPeerOptions {
    /** Минимум наблюдений (3 за неделю, 5 за месяц). */
    readonly minN: number;
    readonly shift?: DigestShift;
    readonly minPeers?: number;
}

const peersOf = (
    members: readonly DigestMember[],
    pick: (metrics: DigestMetrics) => DigestValue,
): DigestPeer[] =>
    members.map(member => ({
        managerId: member.managerId,
        departmentId: member.departmentId,
        value: pick(member.metrics),
    }));

/** С кем считать ориентиры разделов: свой отдел, если в нём хватает менеджеров. */
function benchmarkScopeOf(
    members: readonly DigestMember[],
    member: DigestMember,
    minN: number,
    minPeers: number,
): readonly DigestMember[] {
    const counted = members.filter(item => item.metrics.analyzed >= minN);
    const department =
        member.departmentId === null
            ? []
            : counted.filter(item => item.departmentId === member.departmentId);
    return department.length >= minPeers ? department : counted;
}

/** Сравнение каждого менеджера выпуска с отделом. */
export function digestPeerViewsOf(
    members: readonly DigestMember[],
    options: DigestPeerOptions,
): Map<string, DigestPeerView> {
    const shift = options.shift ?? DIGEST_DEFAULT_SHIFT;
    const minPeers = options.minPeers ?? DIGEST_MIN_PEERS;
    const base = { minN: options.minN, minPeers };
    const score = digestStandingsOf(
        peersOf(members, metrics => metrics.score),
        { ...base, threshold: digestShiftOf(DIGEST_UNIT.score, shift) },
    );
    const nextStepDated = digestStandingsOf(
        peersOf(members, metrics => metrics.nextStepDated),
        { ...base, threshold: digestShiftOf(DIGEST_UNIT.share, shift) },
    );
    const sections = withSectionStandings(
        members.map(member => ({
            managerId: member.managerId,
            departmentId: member.departmentId,
            sections: member.metrics.sections,
        })),
        { ...base, threshold: digestShiftOf(DIGEST_UNIT.score, shift) },
    );
    return new Map(
        members.map(member => [
            member.managerId,
            {
                standings: {
                    score: score.get(member.managerId) ?? null,
                    nextStepDated: nextStepDated.get(member.managerId) ?? null,
                },
                sections:
                    sections.get(member.managerId) ?? member.metrics.sections,
                benchmarks: departmentSectionBenchmarks(
                    benchmarkScopeOf(
                        members,
                        member,
                        options.minN,
                        minPeers,
                    ).map(item => item.quality),
                ),
            },
        ]),
    );
}
