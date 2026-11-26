export const rawThread = (overrides: Record<string, unknown> = {}) => ({
    kind: 'objection',
    topic: 'Цена слишком высокая',
    status: 'resolved',
    moments: [300, 900],
    note: 'Менеджер назвал рассрочку, клиент согласился.',
    ...overrides,
});

export const rawWindow = (overrides: Record<string, unknown> = {}) => ({
    fromSec: 100,
    toSec: 180,
    why: 'Вход в разговор',
    ...overrides,
});

export const rawWindows = (overrides: Record<string, unknown> = {}) => ({
    form: [rawWindow()],
    content: [],
    movement: [],
    closing: [],
    methodology: [],
    ...overrides,
});

export const rawSummary = (overrides: Record<string, unknown> = {}) => ({
    story: 'Начали с задачи клиента, показали систему, договорились о счёте.',
    threads: [rawThread()],
    result: 'Договорились о счёте.',
    endedAbruptly: false,
    windows: rawWindows(),
    ...overrides,
});
