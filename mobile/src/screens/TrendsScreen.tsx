import { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { Card, EmptyState, Header, ProgressBar, Screen, SectionTitle } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useColors } from '../theme';

export function TrendsScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { profile, weights, dailyIntakes } = useApp();
  if (!profile) return null;
  const chartWidth = Math.max(260, width - 78);
  const ordered = [...weights].reverse().slice(-14);
  const compliant = dailyIntakes.filter(item => item.calories >= profile.calorieGoal * 0.85 && item.calories <= profile.calorieGoal * 1.05).length;
  const complianceRate = dailyIntakes.length ? Math.round(compliant / dailyIntakes.length * 100) : 0;
  const latest = weights[0];
  const oldest = weights[weights.length - 1];
  const weightChange = latest && oldest ? latest.weightKg - oldest.weightKg : 0;

  return (
    <Screen>
      <Header eyebrow="进展" title="趋势与复盘" subtitle="看长期方向，不被某一天的起伏影响。" />
      <View style={styles.statsRow}>
        <Stat label="最新体重" value={latest ? `${latest.weightKg.toFixed(1)} kg` : '暂无'} />
        <Stat label="累计变化" value={weights.length > 1 ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg` : '暂无'} accent={weightChange <= 0} />
        <Stat label="摄入达标" value={`${complianceRate}%`} accent />
      </View>

      <SectionTitle title="体重趋势" action={<Text style={{ color: colors.textMuted, fontSize: 11 }}>最近 14 次记录</Text>} />
      <Card>
        {ordered.length < 2 ? <EmptyState icon="📈" title="还需要两次记录" detail="在记录页持续打卡体重，这里会生成变化曲线。" /> : (
          <LineChart data={ordered.map(item => item.weightKg)} labels={ordered.map(item => item.recordedDate.slice(5))} width={chartWidth} color={colors.primary} />
        )}
      </Card>

      <SectionTitle title="近 30 天摄入达标率" />
      <Card style={{ gap: 13 }}>
        <View style={styles.complianceHeader}>
          <View>
            <Text style={[styles.complianceNumber, { color: colors.text }]}>{complianceRate}%</Text>
            <Text style={[styles.complianceDetail, { color: colors.textMuted }]}>{dailyIntakes.length ? `${compliant}/${dailyIntakes.length} 个记录日位于目标的 85%–105%` : '还没有饮食记录'}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}><Text style={{ color: colors.primaryDark, fontWeight: '800', fontSize: 11 }}>稳定比极端更重要</Text></View>
        </View>
        <ProgressBar value={complianceRate / 100} />
        <View style={styles.calendarRow}>
          {Array.from({ length: 14 }).map((_, index) => {
            const item = dailyIntakes[index];
            const ratio = item ? item.calories / profile.calorieGoal : 0;
            const good = ratio >= 0.85 && ratio <= 1.05;
            return <View key={index} style={[styles.calendarDot, { backgroundColor: !item ? colors.surfaceMuted : good ? colors.primary : colors.orange, opacity: !item ? 0.5 : 1 }]} />;
          })}
        </View>
      </Card>

      <SectionTitle title="阶段提示" />
      <Card style={{ gap: 10 }}>
        <Text style={[styles.insightTitle, { color: colors.text }]}>🌱 {buildInsight(profile.targetWeightKg, latest?.weightKg, complianceRate)}</Text>
        <Text style={[styles.insightBody, { color: colors.textMuted }]}>建议每周固定时间、相似状态下测量体重和腰围，用 2–4 周趋势判断方案是否需要调整。</Text>
      </Card>
    </Screen>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: accent ? colors.primary : colors.text }]}>{value}</Text>
    </View>
  );
}

function LineChart({ data, labels, width, color }: { data: number[]; labels: string[]; width: number; color: string }) {
  const colors = useColors();
  const height = 180;
  const paddingX = 16;
  const paddingY = 27;
  const min = Math.min(...data) - 0.5;
  const max = Math.max(...data) + 0.5;
  const points = useMemo(() => data.map((value, index) => {
    const x = paddingX + (index / (data.length - 1)) * (width - paddingX * 2);
    const y = paddingY + ((max - value) / Math.max(1, max - min)) * (height - paddingY * 2);
    return { x, y, value };
  }), [data, width, min, max]);
  return (
    <Svg width={width} height={height}>
      {[0, 1, 2].map(index => <Line key={index} x1="0" x2={width} y1={paddingY + index * 55} y2={paddingY + index * 55} stroke={colors.border} strokeWidth="1" />)}
      <Polyline points={points.map(item => `${item.x},${item.y}`).join(' ')} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((item, index) => (
        <Circle key={index} cx={item.x} cy={item.y} r="4" fill={colors.surface} stroke={color} strokeWidth="3" />
      ))}
      <SvgText x={paddingX} y={height - 2} fill={colors.textMuted} fontSize="9">{labels[0]}</SvgText>
      <SvgText x={width - paddingX - 28} y={height - 2} fill={colors.textMuted} fontSize="9">{labels[labels.length - 1]}</SvgText>
      <SvgText x={paddingX} y={16} fill={colors.text} fontSize="11" fontWeight="700">{data[data.length - 1].toFixed(1)} kg</SvgText>
    </Svg>
  );
}

function buildInsight(target: number, current?: number, rate?: number) {
  if (!current) return '先建立规律记录，再观察变化';
  const remaining = Math.max(0, current - target);
  if (remaining === 0) return '已经达到目标体重，重点转向稳定保持';
  if ((rate ?? 0) >= 70) return `记录习惯很稳定，距离目标约 ${remaining.toFixed(1)} kg`;
  return `距离目标约 ${remaining.toFixed(1)} kg，先把记录稳定下来`;
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 12, borderRadius: 16, borderWidth: 1, gap: 5 },
  statLabel: { fontSize: 9, fontWeight: '700' },
  statValue: { fontSize: 15, fontWeight: '900' },
  complianceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  complianceNumber: { fontSize: 31, fontWeight: '900' },
  complianceDetail: { fontSize: 10, marginTop: 3 },
  badge: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  calendarRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  calendarDot: { width: 14, height: 14, borderRadius: 4 },
  insightTitle: { fontSize: 15, fontWeight: '800', lineHeight: 22 },
  insightBody: { fontSize: 12, lineHeight: 19 },
});
