import type { OwnerReportText } from './owner-report.text.types';

/**
 * Блоки воронки и презентаций для модели-нарратива и их числа для
 * факт-чека. Вынесено из owner-report.narrative.ts по лимиту файла.
 */

const keyValueLines = (rows: readonly { label: string; value: string }[]) =>
    rows.map(row => `- ${row.label}: ${row.value}`).join('\n');

export function narrativeExtraBlocks(text: OwnerReportText): string[] {
    const { funnel, crmFunnel, presentations } = text;
    const funnelBlock =
        'ВОРОНКА ПО РАЗГОВОРАМ:\n' +
        funnel.rows
            .map(
                row =>
                    `- ${row.label}: ${row.calls}; шаг вперёд ${row.advanced}; без решения ${row.undecided}; отказ ${row.refused}; без контакта ${row.noContact}; согласие на счёт ${row.invoiceAgreed}`,
            )
            .join('\n') +
        (funnel.chain ? `\n- ${funnel.chain}` : '') +
        (funnel.afterOffer ? `\n- ${funnel.afterOffer}` : '') +
        `\n- ${funnel.invoice}`;
    const crmBlock = crmFunnel
        ? 'ВОРОНКА ПО CRM:\n' +
          crmFunnel.rows
              .map(
                  row =>
                      `- ${row.label}: ${row.value}${row.previous !== null ? ` (прошлый период ${row.previous})` : ''}`,
              )
              .join('\n') +
          `\n- ${crmFunnel.conversions}\n- ${crmFunnel.note}`
        : null;
    const presentationsBlock =
        'ПРЕЗЕНТАЦИИ:\n' +
        `- ${presentations.intro}` +
        (presentations.rows.length > 0
            ? `\n${keyValueLines(presentations.rows)}`
            : '') +
        (presentations.comparison ? `\n- ${presentations.comparison}` : '') +
        (presentations.sections.length > 0
            ? `\n${keyValueLines(presentations.sections)}`
            : '') +
        (presentations.people ? `\n- ${presentations.people}` : '');
    const qualityBlock =
        'СВЯЗЬ КАЧЕСТВА ПОКАЗА И ПРОДАЖ:\n' +
        text.qualityLink.lines.map(line => `- ${line}`).join('\n');
    return [
        funnelBlock,
        ...(crmBlock ? [crmBlock] : []),
        presentationsBlock,
        qualityBlock,
    ];
}

/** Числа этих блоков — в разрешённые для модели. */
export function addNarrativeExtraNumbers(
    text: OwnerReportText,
    addText: (value: string) => void,
    addCount: (value: number) => void,
): void {
    const { funnel, crmFunnel, presentations } = text;
    text.qualityLink.lines.forEach(addText);
    for (const row of funnel.rows) {
        addCount(row.calls);
        [
            row.advanced,
            row.undecided,
            row.refused,
            row.noContact,
            row.invoiceAgreed,
        ].forEach(addText);
    }
    [funnel.chain ?? '', funnel.afterOffer ?? '', funnel.invoice].forEach(
        addText,
    );
    if (crmFunnel) {
        for (const row of crmFunnel.rows) {
            addCount(row.value);
            if (row.previous !== null) addCount(row.previous);
        }
        addText(crmFunnel.conversions);
    }
    addText(presentations.intro);
    [...presentations.rows, ...presentations.sections].forEach(row =>
        addText(row.value),
    );
    [presentations.comparison ?? '', presentations.people ?? ''].forEach(
        addText,
    );
}
