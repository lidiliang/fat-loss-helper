import { Fragment, ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../theme';

function inlineMarkdown(value: string, color: string): ReactNode[] {
  const parts = value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={index} style={{ fontWeight: '900', color }}>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <Text key={index} style={[styles.inlineCode, { color }]}>{part.slice(1, -1)}</Text>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function MarkdownText({ value }: { value: string }) {
  const colors = useColors();
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  return (
    <View style={styles.container}>
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <View key={index} style={styles.blankLine} />;
        if (/^(-{3,}|\*{3,})$/.test(line)) return <View key={index} style={[styles.divider, { backgroundColor: colors.border }]} />;
        const heading = /^(#{1,4})\s+(.+)$/.exec(line);
        if (heading) {
          const level = heading[1].length;
          return <Text key={index} style={[styles.heading, level > 2 && styles.smallHeading, { color: colors.text }]}>{inlineMarkdown(heading[2], colors.text)}</Text>;
        }
        const bullet = /^[-*+]\s+(.+)$/.exec(line);
        const ordered = /^(\d+)[.)]\s+(.+)$/.exec(line);
        if (bullet || ordered) {
          const marker = ordered ? `${ordered[1]}.` : '•';
          const content = ordered ? ordered[2] : bullet![1];
          return (
            <View key={index} style={styles.listRow}>
              <Text style={[styles.marker, { color: colors.primaryDark }]}>{marker}</Text>
              <Text style={[styles.body, styles.listBody, { color: colors.text }]}>{inlineMarkdown(content, colors.text)}</Text>
            </View>
          );
        }
        return <Text key={index} style={[styles.body, { color: colors.text }]}>{inlineMarkdown(line, colors.text)}</Text>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 3 },
  blankLine: { height: 5 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
  heading: { fontSize: 14, lineHeight: 20, fontWeight: '900', marginTop: 5, marginBottom: 2 },
  smallHeading: { fontSize: 12.5, lineHeight: 19 },
  body: { fontSize: 11.5, lineHeight: 19 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  marker: { width: 18, fontSize: 11.5, lineHeight: 19, fontWeight: '900', textAlign: 'right' },
  listBody: { flex: 1 },
  inlineCode: { fontFamily: 'monospace', fontSize: 10.5 },
});
