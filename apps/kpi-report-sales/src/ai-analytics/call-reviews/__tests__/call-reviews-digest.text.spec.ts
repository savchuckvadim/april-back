import { toTelegramMarkdownText } from '@lib/telegram';
import {
    summarizeCallReviews,
    type AiAnalyticsCallReviewRecord,
} from '@lib/sales-ai-analytics';
import { CALL_REVIEWS_DIGEST_PART_LIMIT } from '../call-reviews-digest.parts';
import {
    buildCallReviewsDigest,
    commentLine,
    pickDigestReviews,
    portalSummaryLine,
    shortComment,
    type CallReviewsDigestComment,
    type CallReviewsDigestPortal,
} from '../call-reviews-digest.text';

const record = (
    id: string,
    fields: Partial<AiAnalyticsCallReviewRecord> = {},
): AiAnalyticsCallReviewRecord => ({
    id,
    createdAt: new Date(`2026-11-18T0${id}:00:00.000Z`),
    authorId: '12',
    transcriptionId: `100${id}`,
    managerId: '447',
    agree: true,
    leaderScore: 6,
    aiScore: 7.2,
    analysisId: '900',
    items: [],
    comment: `Комментарий ${id}`,
    authorRole: 'leader',
    authorName: 'Петров Пётр',
    ...fields,
});

const comment = (
    fields: Partial<CallReviewsDigestComment> = {},
): CallReviewsDigestComment => ({
    authorName: 'Петров Пётр',
    agree: false,
    aiScore: 7.2,
    leaderScore: 4,
    comment: 'Потребность не выявлена',
    transcriptionId: '10245',
    url: 'https://report.example/call/10245.abc',
    ...fields,
});

const portal = (
    domain: string,
    reviews: AiAnalyticsCallReviewRecord[],
    comments: CallReviewsDigestComment[] = [],
): CallReviewsDigestPortal => ({
    domain,
    stats: summarizeCallReviews(reviews, 3),
    comments,
});

describe('сводка отзывов о разборах в Telegram', () => {
    it('нет отзывов ни у одного портала — null (не слать)', () => {
        expect(buildCallReviewsDigest('2026-11-18', [])).toBeNull();
        expect(
            buildCallReviewsDigest('2026-11-18', [
                portal('gsr.bitrix24.ru', []),
            ]),
        ).toBeNull();
    });

    it('строка портала: отзывы, несогласия, средние, разница и частые «не так»', () => {
        const line = portalSummaryLine(
            portal('gsr.bitrix24.ru', [
                record('1', {
                    agree: false,
                    aiScore: 8,
                    leaderScore: 5,
                    items: [
                        {
                            kind: 'section',
                            ref: 's1',
                            label: 'Выявление потребности',
                            comment: '',
                        },
                    ],
                }),
                record('2', { aiScore: 6, leaderScore: 6 }),
            ]),
        );

        expect(line).toBe(
            'gsr.bitrix24.ru: отзывов 2, не согласны 1; оценка AI в среднем 7, ' +
                'руководителей 5,5 (разница −1,5); чаще всего «не так»: ' +
                '«Выявление потребности» (раздел) — 1',
        );
    });

    it('без замечаний и без оценок руководителей — прочерк и «замечаний нет»', () => {
        const line = portalSummaryLine(
            portal('garant.bitrix24.ru', [record('1', { leaderScore: null })]),
        );

        expect(line).toContain('руководителей —;');
        expect(line).toContain('замечаний «не так» нет');
        expect(line).not.toContain('разница');
    });

    it('комментарий — первые 200 знаков в одну строку, со ссылкой; без ссылки — номер звонка', () => {
        const long = `${'а'.repeat(150)}\n\n${'б'.repeat(100)}`;
        const line = commentLine(comment({ comment: long }));

        expect(line).toContain('• Петров Пётр, не согласен, AI 7,2 → 4: ');
        expect(line).not.toContain('\n');
        expect(shortComment(long)).toHaveLength(201);
        expect(shortComment(long).endsWith('…')).toBe(true);
        expect(line.endsWith(' https://report.example/call/10245.abc')).toBe(
            true,
        );
        expect(commentLine(comment({ url: null }))).toMatch(/ звонок 10245$/);
    });

    it('спецсимволы Markdown в комментарии не экранируются сводкой (это делает отправка) и не ломают лимит', () => {
        const parts = buildCallReviewsDigest('2026-11-18', [
            portal(
                'gsr.bitrix24.ru',
                [record('1')],
                [comment({ comment: 'Цена *дорого* _сейчас_ [см] `код`' })],
            ),
        ]);

        expect(parts).toHaveLength(1);
        const [text] = parts ?? [];
        expect(text).toContain('Цена *дорого* _сейчас_ [см] `код`');
        expect(text).not.toContain('\\');
        expect(toTelegramMarkdownText(text)).toContain('\\*дорого\\*');
    });

    it('несколько порталов — заголовок с днём и блок на портал', () => {
        const parts = buildCallReviewsDigest('2026-11-18', [
            portal('gsr.bitrix24.ru', [record('1')], [comment()]),
            portal('empty.bitrix24.ru', []),
            portal('garant.bitrix24.ru', [record('2'), record('3')]),
        ]);

        expect(parts).toHaveLength(1);
        const text = (parts ?? [])[0];
        expect(
            text.startsWith(
                'Отзывы руководителей о разборах звонков за 18.11.2026\n\n',
            ),
        ).toBe(true);
        expect(text).toContain('\n\ngsr.bitrix24.ru: отзывов 1');
        expect(text).toContain('\n• Петров Пётр');
        expect(text).toContain('\n\ngarant.bitrix24.ru: отзывов 2');
        expect(text).not.toContain('empty.bitrix24.ru');
    });

    it('длинная сводка режется на части не длиннее лимита Telegram после экранирования', () => {
        const noisy = comment({ comment: '_*'.repeat(100) });
        const portals = Array.from({ length: 30 }, (_, index) =>
            portal(
                `p${index}.bitrix24.ru`,
                [record('1')],
                [noisy, noisy, noisy, noisy, noisy],
            ),
        );

        const parts = buildCallReviewsDigest('2026-11-18', portals) ?? [];

        expect(parts.length).toBeGreaterThan(1);
        for (const part of parts) {
            expect(toTelegramMarkdownText(part).length).toBeLessThanOrEqual(
                CALL_REVIEWS_DIGEST_PART_LIMIT,
            );
        }
        expect(
            parts[1].startsWith(
                'Отзывы руководителей о разборах звонков за 18.11.2026 (продолжение)',
            ),
        ).toBe(true);
        const all = parts.join('\n');
        expect(all.match(/bitrix24\.ru: отзывов/g)).toHaveLength(30);
    });
});

describe('pickDigestReviews', () => {
    it('с комментарием, сначала «не согласен», затем свежие; не больше пяти', () => {
        const reviews = [
            record('1', { agree: false }),
            record('2'),
            record('3', { comment: '  \n ' }),
            record('4'),
            record('5', { agree: false }),
            record('6'),
            record('7'),
            record('8'),
        ];

        expect(pickDigestReviews(reviews).map(review => review.id)).toEqual([
            '5',
            '1',
            '8',
            '7',
            '6',
        ]);
    });
});
