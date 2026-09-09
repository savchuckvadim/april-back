import { BitrixEntityType } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import {
    EnumColdCallEntityType,
    EnumColdCallForce,
    EnumColdCallIsTmc,
} from '../../dto/cold.dto';
import { ColdStartDecision } from '../../lib/cold-force.decision';
import { ColdCloseResult } from '../relations/cold-relations-closer.service';
import { ColdTarget } from '../target/cold-target.types';
import {
    buildColdStartPushes,
    buildColdStartTimeline,
    ColdStartTimelineInput,
} from './cold-start-timeline.formatter';

/**
 * Записи таймлайна холодного старта: куда пишем и что в них сказано —
 * итог закрытия со ссылками, «уступлено кому» и «попытка взять вашу
 * компанию» владельцу чужой открытой основной.
 */
const hook = {
    entityType: EnumColdCallEntityType.DEAL,
    entityId: '600',
    responsible: '447',
    created: '1',
    deadline: '05.09.2026 11:00:00',
    name: 'ХО',
    isTmc: EnumColdCallIsTmc.N,
    force: EnumColdCallForce.N,
};

const companyTarget: ColdTarget = {
    hookKey: 'h1',
    hook,
    kind: 'company',
    company: { ID: '7' } as never,
    companyId: 7,
    entryDeal: { ID: '600' } as never,
    rootDealId: 600,
};

const dealTarget: ColdTarget = {
    ...companyTarget,
    kind: 'deal',
    company: null,
    companyId: null,
};

const closed = (over: Partial<ColdCloseResult> = {}): ColdCloseResult => ({
    closedDealIds: [510, 520],
    completedTaskIds: [1],
    closedPresIds: [11],
    closedZprIds: [],
    preservedBaseDeal: null,
    ...over,
});

const PROCEED: ColdStartDecision = {
    mode: 'proceed',
    foreign: [],
    takenEntry: null,
    reason: '',
};
const YIELD: ColdStartDecision = {
    mode: 'yield',
    foreign: [
        { dealId: 700, responsibleId: 448 },
        { dealId: 800, responsibleId: 449 },
    ],
    takenEntry: null,
    reason: '',
};

const build = (over: Partial<ColdStartTimelineInput> = {}) =>
    buildColdStartTimeline({
        domain: 'd.b24.ru',
        target: companyTarget,
        decision: PROCEED,
        closed: closed(),
        responsibleId: 447,
        names: { 447: 'Вадим Савчук', 448: 'Иван Петров' },
        ...over,
    });

describe('buildColdStartTimeline — proceed', () => {
    it('компания и входная сделка получают итог закрытия со ссылками', () => {
        const entries = build();
        expect(entries.map(e => [e.entityType, e.entityId])).toEqual([
            [BitrixEntityType.COMPANY, 7],
            [BitrixEntityType.DEAL, 600],
        ]);
        const [company] = entries;
        expect(company.comment).toContain(
            '[B]Холодный старт[/B] — ответственный: Вадим Савчук.',
        );
        expect(company.comment).toContain(
            'Закрыто: сделок — 2, задач — 1, презентаций — 1, ЗПР — 0.',
        );
        expect(company.comment).toContain(
            '[URL=https://d.b24.ru/crm/deal/details/510/]#510[/URL], [URL=https://d.b24.ru/crm/deal/details/520/]#520[/URL]',
        );
        expect(company.comment).toContain('%0A');
    });

    it('клиент без компании: входная сделка и сохранённая основная', () => {
        const entries = build({
            target: dealTarget,
            closed: closed({ preservedBaseDeal: { ID: '77' } as never }),
        });
        expect(entries.map(e => e.entityId)).toEqual([600, 77]);
        expect(entries.every(e => e.entityType === BitrixEntityType.DEAL)).toBe(
            true,
        );
    });

    it('без закрытых сделок строки ссылок нет; больше десяти — «и ещё N»', () => {
        expect(
            build({ closed: closed({ closedDealIds: [] }) })[0].comment,
        ).not.toContain('Закрытые сделки');
        const many = build({
            closed: closed({
                closedDealIds: Array.from({ length: 12 }, (_, i) => 100 + i),
            }),
        });
        expect(many[0].comment).toContain('и ещё 2.');
    });

    it('имени нет в карте — честный id', () => {
        expect(build({ names: {} })[0].comment).toContain('сотрудник #447');
    });
});

describe('buildColdStartTimeline — proceed с force=Y (забрали у другого)', () => {
    const TAKEN: ColdStartDecision = {
        mode: 'proceed',
        foreign: YIELD.foreign,
        takenEntry: null,
        reason: '',
    };

    it('владельцу чужой основной — «забрали в работу» со ссылками и итогом', () => {
        const entries = build({ decision: TAKEN });
        const foreign = entries.filter(e => [700, 800].includes(e.entityId));
        expect(foreign).toHaveLength(2);
        expect(foreign[0].comment).toContain(
            '[B]Вашу компанию забрали в работу[/B]: Вадим Савчук (ответственный холодного старта).',
        );
        expect(foreign[0].comment).toContain(
            'Входная сделка: [URL=https://d.b24.ru/crm/deal/details/600/]#600[/URL]; компания:',
        );
        expect(foreign[0].comment).toContain(
            'Ваша работа по клиенту закрыта или переназначена: сделок — 2, задач — 1, презентаций — 1, ЗПР — 0.',
        );
        // Входные сущности при этом получают обычный итог старта.
        expect(entries[0].comment).toContain('[B]Холодный старт[/B]');
    });
});

describe('buildColdStartPushes', () => {
    it('proceed без чужой работы — пушей нет', () => {
        expect(
            buildColdStartPushes({
                domain: 'd.b24.ru',
                target: companyTarget,
                decision: PROCEED,
                closed: closed(),
                responsibleId: 447,
                names: {},
            }),
        ).toEqual([]);
    });

    it('force=Y: «у вас забрали» — по одному на сотрудника, с его сделками и тегом', () => {
        const pushes = buildColdStartPushes({
            domain: 'd.b24.ru',
            target: companyTarget,
            decision: {
                mode: 'proceed',
                foreign: [
                    { dealId: 700, responsibleId: 448 },
                    { dealId: 710, responsibleId: 448 },
                    { dealId: 800, responsibleId: 449 },
                ],
                takenEntry: null,
                reason: '',
            },
            closed: closed(),
            responsibleId: 447,
            names: { 447: 'Вадим Савчук' },
        });
        expect(pushes.map(p => p.userId)).toEqual([448, 449]);
        expect(pushes[0].message).toContain(
            '[B]У вас забрали компанию в работу[/B]: Вадим Савчук',
        );
        expect(pushes[0].message).toContain(
            'Ваши сделки: [URL=https://d.b24.ru/crm/deal/details/700/]#700[/URL], [URL=https://d.b24.ru/crm/deal/details/710/]#710[/URL].',
        );
        expect(pushes[0].message).toContain(
            'Ваша работа по клиенту закрыта или переназначена.',
        );
        expect(pushes[0].message).toContain('\n');
        expect(pushes[0].message).not.toContain('%0A');
        // Тег — по клиенту (компания 7), не по ключу хука: ключ уникален
        // только внутри окна тишины, и push другого клиента затирал бы этот.
        expect(pushes[0].tag).toBe('xo2_cold_start_co_7_448');
    });

    it('входная — чужая основная: её владельцу «забрали» в любом режиме, «забрали» сильнее «попытались»', () => {
        const decision: ColdStartDecision = {
            mode: 'yield',
            foreign: [{ dealId: 700, responsibleId: 448 }],
            takenEntry: { dealId: 600, responsibleId: 448 },
            reason: '',
        };
        const entries = buildColdStartTimeline({
            domain: 'd.b24.ru',
            target: dealTarget,
            decision,
            closed: closed(),
            responsibleId: 447,
            names: {},
        });
        // Входная получает «уступлен», чужая 700 — «попытка», и входная же — «забрали» её владельцу.
        expect(entries.map(e => e.entityId)).toEqual([600, 700, 600]);
        expect(entries[2].comment).toContain(
            '[B]Вашего клиента забрали в работу[/B]',
        );
        const pushes = buildColdStartPushes({
            domain: 'd.b24.ru',
            target: dealTarget,
            decision,
            closed: closed(),
            responsibleId: 447,
            names: {},
        });
        expect(pushes).toHaveLength(1);
        expect(pushes[0].message).toContain(
            '[B]У вас забрали клиента в работу[/B]',
        );
        expect(pushes[0].message).toContain(
            '#700[/URL], [URL=https://d.b24.ru/crm/deal/details/600/]#600[/URL]',
        );
        expect(pushes[0].tag).toBe('xo2_cold_start_d_600_448');
    });

    it('yield: «у вас попытались забрать», клиент без компании — «клиента»', () => {
        const pushes = buildColdStartPushes({
            domain: 'd.b24.ru',
            target: dealTarget,
            decision: YIELD,
            closed: closed(),
            responsibleId: 447,
            names: {},
        });
        expect(pushes[0].message).toContain(
            '[B]У вас попытались забрать клиента в работу[/B]: сотрудник #447',
        );
        expect(pushes[0].message).toContain(
            'Уступлено — ваша работа не тронута.',
        );
        expect(pushes[0].message).not.toContain('компания:');
    });
});

describe('buildColdStartTimeline — yield', () => {
    it('входные сущности: уступлено кому, что закрыто, новой работы нет', () => {
        const entries = build({ decision: YIELD });
        const [company, entry] = entries;
        expect([company.entityId, entry.entityId]).toEqual([7, 600]);
        expect(company.comment).toContain(
            '[B]Холодный старт уступлен[/B]: клиент в работе у Иван Петров ([URL=https://d.b24.ru/crm/deal/details/700/]сделка #700[/URL]).',
        );
        expect(company.comment).toContain(
            'Закрыты только входная сделка и её связи: сделок — 2, задач — 1, презентаций — 1, ЗПР — 0. Новая работа не создана.',
        );
    });

    it('каждому владельцу чужой основной — «попытка взять вашу компанию» со ссылками', () => {
        const entries = build({ decision: YIELD });
        const foreign = entries.filter(e => [700, 800].includes(e.entityId));
        expect(foreign).toHaveLength(2);
        expect(foreign[0].comment).toContain(
            '[B]Попытка взять вашу компанию в работу[/B]: Вадим Савчук (ответственный холодного старта).',
        );
        expect(foreign[0].comment).toContain(
            'Входная сделка: [URL=https://d.b24.ru/crm/deal/details/600/]#600[/URL]; компания: [URL=https://d.b24.ru/crm/company/details/7/]#7[/URL].',
        );
        expect(foreign[0].comment).toContain(
            'Уступлено — ваша работа не тронута.',
        );
        expect(foreign[1].entityId).toBe(800);
    });

    it('клиент без компании: «вашего клиента», ссылка только на входную', () => {
        const entries = build({ decision: YIELD, target: dealTarget });
        const foreign = entries.find(e => e.entityId === 700);
        expect(foreign?.comment).toContain('вашего клиента');
        expect(foreign?.comment).not.toContain('компания:');
        expect(entries.map(e => e.entityId)).toEqual([600, 700, 800]);
    });
});
