import {
    DIGEST_COMPARE_SCOPE,
    DIGEST_DIRECTION,
    DIGEST_POSITION,
    DigestDirection,
    DigestPosition,
} from './period-digest.codes';
import {
    DIGEST_DEFAULT_SHIFT,
    DIGEST_MIN_PEERS,
} from './period-digest.thresholds';
import type {
    DigestSectionStat,
    DigestStanding,
    DigestValue,
} from './period-digest.types';

/**
 * СРАВНЕНИЕ С ОТДЕЛОМ — только словами («ниже середины отдела»), без мест
 * и таблиц лидеров (решение владельца 07.09.2026). Середина — медиана
 * значений менеджеров своего отдела с достаточным объёмом данных. В
 * отделе таких меньше трёх — сравнение по всей структуре продаж; и там
 * меньше трёх — сравнения нет. Чистые функции.
 */

/** Значение одного менеджера для сравнения. */
export interface DigestPeer {
    readonly managerId: string;
    /** Отдел менеджера в структуре; null — вне структуры (сравнение по всей). */
    readonly departmentId: number | null;
    readonly value: DigestValue;
}

export interface DigestStandingOptions {
    /** Минимум наблюдений, с которого значение менеджера участвует. */
    readonly minN: number;
    /** Порог «выше / ниже середины» в единицах метрики. */
    readonly threshold: number;
    readonly direction?: DigestDirection;
    /** Минимум менеджеров с данными для сравнения (по умолчанию 3). */
    readonly minPeers?: number;
}

/** Медиана непустого списка. */
export function digestMedian(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Положение значения относительно середины с порогом и направлением. */
export function digestPositionOf(
    value: number,
    middle: number,
    threshold: number,
    direction: DigestDirection = DIGEST_DIRECTION.up,
): DigestPosition {
    const gap = (value - middle) * (direction === DIGEST_DIRECTION.up ? 1 : -1);
    // Погрешность дробей (0,1 + 0,2): порог на границе считается достигнутым.
    const epsilon = 1e-9;
    if (gap >= threshold - epsilon) return DIGEST_POSITION.above;
    if (gap <= -threshold + epsilon) return DIGEST_POSITION.below;
    return DIGEST_POSITION.middle;
}

/** Менеджер с достаточным объёмом данных: значение есть. */
type CountedPeer = DigestPeer & {
    readonly value: { readonly value: number; readonly n: number };
};

const isCounted = (peer: DigestPeer, minN: number): peer is CountedPeer =>
    peer.value.value !== null && peer.value.n >= minN;

/**
 * Положение каждого менеджера в своём отделе (или во всей структуре,
 * если в отделе меньше трёх с данными). Менеджер без достаточных данных —
 * null: сравнивать нечего.
 */
export function digestStandingsOf(
    peers: readonly DigestPeer[],
    options: DigestStandingOptions,
): Map<string, DigestStanding | null> {
    const minPeers = options.minPeers ?? DIGEST_MIN_PEERS;
    const counted = peers.filter((peer): peer is CountedPeer =>
        isCounted(peer, options.minN),
    );
    const structureMiddle =
        counted.length >= minPeers
            ? digestMedian(counted.map(peer => peer.value.value))
            : null;
    const result = new Map<string, DigestStanding | null>();
    for (const peer of peers) {
        if (!isCounted(peer, options.minN)) {
            result.set(peer.managerId, null);
            continue;
        }
        const department =
            peer.departmentId === null
                ? []
                : counted.filter(
                      item => item.departmentId === peer.departmentId,
                  );
        const scope =
            department.length >= minPeers
                ? DIGEST_COMPARE_SCOPE.department
                : DIGEST_COMPARE_SCOPE.structure;
        const middle =
            scope === DIGEST_COMPARE_SCOPE.department
                ? digestMedian(department.map(item => item.value.value))
                : structureMiddle;
        result.set(
            peer.managerId,
            middle === null
                ? null
                : {
                      position: digestPositionOf(
                          peer.value.value,
                          middle,
                          options.threshold,
                          options.direction,
                      ),
                      scope,
                      middle,
                  },
        );
    }
    return result;
}

/** Разделы менеджера для сравнения: код раздела, его средняя и отдел. */
export interface DigestSectionPeer {
    readonly managerId: string;
    readonly departmentId: number | null;
    readonly sections: readonly DigestSectionStat[];
}

/**
 * Положение по каждому разделу: середина считается отдельно по разделу
 * (у разных менеджеров разный набор оценённых разделов). Порог — 0,5
 * балла по умолчанию.
 */
export function withSectionStandings(
    members: readonly DigestSectionPeer[],
    options: Omit<DigestStandingOptions, 'threshold' | 'direction'> & {
        readonly threshold?: number;
    },
): Map<string, DigestSectionStat[]> {
    const codes = [
        ...new Set(
            members.flatMap(member =>
                member.sections.map(section => section.section),
            ),
        ),
    ];
    const standings = new Map(
        codes.map(code => [
            code,
            digestStandingsOf(
                members.map(member => {
                    const section = member.sections.find(
                        item => item.section === code,
                    );
                    return {
                        managerId: member.managerId,
                        departmentId: member.departmentId,
                        value: section
                            ? { value: section.mean, n: section.n }
                            : { value: null, n: 0 },
                    };
                }),
                {
                    ...options,
                    threshold: options.threshold ?? DIGEST_DEFAULT_SHIFT.score,
                },
            ),
        ]),
    );
    return new Map(
        members.map(member => [
            member.managerId,
            member.sections.map(section => ({
                ...section,
                standing:
                    standings.get(section.section)?.get(member.managerId) ??
                    null,
            })),
        ]),
    );
}
