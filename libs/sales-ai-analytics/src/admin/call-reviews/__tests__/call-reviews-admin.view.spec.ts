import { parseCallReviewRecord } from '../../../model/call-review/call-review.record';
import {
    reviewPayload,
    reviewRecord,
} from '../../../model/call-review/__tests__/call-review.fixtures';
import {
    callReviewsWindow,
    filterCallReviews,
    toCallReviewAdminRow,
} from '../call-reviews-admin.view';

const parsed = (record: ReturnType<typeof reviewRecord>) => {
    const review = parseCallReviewRecord(record);
    if (review === null) throw new Error('fixture');
    return review;
};

describe('callReviewsWindow', () => {
    it('дни по Москве: с 00:00 первого дня до 00:00 дня после последнего', () => {
        expect(callReviewsWindow('2026-11-01', '2026-11-19')).toEqual({
            ok: true,
            from: new Date('2026-10-31T21:00:00.000Z'),
            to: new Date('2026-11-19T21:00:00.000Z'),
        });
    });

    it('обратный, слишком длинный и кривой период — причина словами', () => {
        expect(callReviewsWindow('2026-11-19', '2026-11-01')).toEqual({
            ok: false,
            reason: 'Начало периода позже конца',
        });
        expect(callReviewsWindow('2025-01-01', '2026-11-19')).toMatchObject({
            ok: false,
        });
        expect(callReviewsWindow('2026-11', '2026-11-19')).toMatchObject({
            ok: false,
        });
    });
});

describe('filterCallReviews', () => {
    const reviews = [
        parsed(
            reviewRecord('1', {
                payload: reviewPayload({
                    agree: false,
                    items: [
                        {
                            kind: 'methodology',
                            ref: 'm1',
                            label: 'Шаг',
                            comment: '',
                        },
                    ],
                }),
            }),
        ),
        parsed(reviewRecord('2', { author: '13' })),
        parsed(
            reviewRecord('3', {
                author: '14',
                payload: reviewPayload({
                    items: [
                        { kind: 'section', ref: 's', label: 'Р', comment: '' },
                    ],
                }),
            }),
        ),
    ];
    const ids = (list: { id: string }[]) => list.map(review => review.id);

    it('без фильтров и с all — все', () => {
        expect(ids(filterCallReviews(reviews, {}))).toEqual(['1', '2', '3']);
        expect(ids(filterCallReviews(reviews, { agree: 'all' }))).toEqual([
            '1',
            '2',
            '3',
        ]);
    });

    it('согласие: yes — согласные, no — несогласные', () => {
        expect(ids(filterCallReviews(reviews, { agree: 'yes' }))).toEqual([
            '2',
            '3',
        ]);
        expect(ids(filterCallReviews(reviews, { agree: 'no' }))).toEqual(['1']);
    });

    it('вид «не так» — отзывы, где есть замечание этого вида; вместе с согласием', () => {
        expect(
            ids(filterCallReviews(reviews, { itemKind: 'methodology' })),
        ).toEqual(['1']);
        expect(
            ids(
                filterCallReviews(reviews, {
                    itemKind: 'methodology',
                    agree: 'yes',
                }),
            ),
        ).toEqual([]);
    });
});

describe('toCallReviewAdminRow', () => {
    const review = parsed(
        reviewRecord('5', {
            payload: reviewPayload({
                authorRole: 'superuser',
                comment: 'Длинный рассказ',
                items: [
                    {
                        kind: 'call_type',
                        ref: 'presentation',
                        label: 'Презентация',
                        comment: 'Это был повторный звонок',
                    },
                ],
            }),
        }),
    );

    it('строка: ссылка, менеджер из расшифровки, роль и вид словами, комментарий целиком', () => {
        const row = toCallReviewAdminRow(
            review,
            {
                userId: '447',
                userName: 'Иванова Мария',
                callStartedAt: new Date('2026-11-18T06:00:00.000Z'),
            },
            'https://report.example/call/10245.x',
        );

        expect(row).toMatchObject({
            id: '5',
            createdAt: '2026-11-18T09:00:00.000Z',
            transcriptionId: '10245',
            callStartedAt: '2026-11-18T06:00:00.000Z',
            callUrl: 'https://report.example/call/10245.x',
            managerId: '447',
            managerName: 'Иванова Мария',
            authorRole: 'superuser',
            authorRoleTitle: 'суперпользователь',
            comment: 'Длинный рассказ',
        });
        expect(row.items).toEqual([
            {
                kind: 'call_type',
                kindTitle: 'тип звонка',
                label: 'Презентация',
                comment: 'Это был повторный звонок',
            },
        ]);
    });

    it('имя чужого сотрудника из расшифровки не подставляется; нет расшифровки — null', () => {
        const other = toCallReviewAdminRow(
            review,
            { userId: '999', userName: 'Чужой', callStartedAt: null },
            null,
        );
        expect(other).toMatchObject({ managerId: '447', managerName: null });

        const none = toCallReviewAdminRow(review, undefined, null);
        expect(none).toMatchObject({
            managerId: '447',
            managerName: null,
            callStartedAt: null,
            callUrl: null,
        });
    });

    it('менеджер без записи в отзыве берётся из расшифровки', () => {
        const noManager = parsed(reviewRecord('6', { managerId: null }));
        const row = toCallReviewAdminRow(
            noManager,
            { userId: '448', userName: 'Сидоров', callStartedAt: null },
            null,
        );

        expect(row).toMatchObject({ managerId: '448', managerName: 'Сидоров' });
    });
});
