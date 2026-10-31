import type { FC } from 'react';
import { StyleSheet, Text } from '@react-pdf/renderer';
import { parseRichTextParagraphs } from './rich-text';
import { PdfStyle, sx } from './style.util';

interface RichTextProps {
    text: string;
    /** Стиль абзаца (размер, цвет, выравнивание) */
    style: PdfStyle;
    accentColor: string;
    dangerColor: string;
    paragraphGap?: number;
}

/** Текст с разметкой `<color>/<bold>/<red>` абзацами. */
export const RichText: FC<RichTextProps> = ({
    text,
    style,
    accentColor,
    dangerColor,
    paragraphGap = 6,
}) => {
    const styles = StyleSheet.create({
        paragraph: { marginBottom: paragraphGap },
        bold: { fontWeight: 'bold' },
        color: { color: accentColor, fontWeight: 'bold' },
        red: { color: dangerColor, fontWeight: 'bold' },
    });
    const paragraphs = parseRichTextParagraphs(text);
    return (
        <>
            {paragraphs.map((runs, index) => (
                <Text key={index} style={[style, styles.paragraph]}>
                    {runs.map((run, runIndex) => (
                        <Text
                            key={runIndex}
                            style={sx(
                                run.bold && styles.bold,
                                run.color && styles.color,
                                run.red && styles.red,
                            )}
                        >
                            {run.text}
                        </Text>
                    ))}
                </Text>
            ))}
        </>
    );
};
