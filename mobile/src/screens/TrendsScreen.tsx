import { useMemo } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  const recentIntakes = dailyIntakes.slice(0, 30);
  const compliant = recentIntakes.filter(item => item.calories > 0 && item.calories <= profile.calorieGoal * 1.05).length;
  const complianceRate = recentIntakes.length ? Math.round(compliant / recentIntakes.length * 100) : 0;
  const latest = weights[0];
  const oldest = weights[weights.length - 1];
  const weightChange = latest && oldest ? latest.weightKg - oldest.weightKg : 0;
  const achievements = buildAchievements(profile.targetWeightKg, profile.calorieGoal, dailyIntakes, weights);
  const unlockedCount = achievements.filter(item => item.unlocked).length;

  const shareProgress = () => {
    const changeText = weights.length > 1
      ? `阶段体重变化 ${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg，`
      : '';
    void Share.share({
      message: `我正在用轻脂管家坚持健康减脂：${changeText}近30个记录日达标率 ${complianceRate}%，已解锁 ${unlockedCount}/${achievements.length} 个减脂里程碑。一起稳稳坚持！`,
    });
  };

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
            <Text style={[styles.complianceDetail, { color: colors.textMuted }]}>{recentIntakes.length ? `${compliant}/${recentIntakes.length} 个记录日未超过目标的 105%` : '还没有饮食记录'}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}><Text style={{ color: colors.primaryDark, fontWeight: '800', fontSize: 11 }}>稳定比极端更重要</Text></View>
        </View>
        <ProgressBar value={complianceRate / 100} />
        <View style={styles.calendarRow}>
          {Array.from({ length: 14 }).map((_, index) => {
            const item = recentIntakes[index];
            const ratio = item ? item.calories / profile.calorieGoal : 0;
            const good = ratio > 0 && ratio <= 1.05;
            return <View key={index} style={[styles.calendarDot, { backgroundColor: !item ? colors.surfaceMuted : good ? colors.primary : colors.orange, opacity: !item ? 0.5 : 1 }]} />;
          })}
        </View>
        <Text style={[styles.ruleHint, { color: colors.textMuted }]}>减脂期不要求“吃满”目标：当天有饮食记录且总摄入 ≤ 目标的105%，即视为达标。</Text>
      </Card>

      <SectionTitle title={`减脂里程碑 · 已解锁 ${unlockedCount}/${achievements.length}`} action={<Text style={{ color: colors.textMuted, fontSize: 10 }}>左右滑动</Text>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.achievementList}>
        {achievements.map(item => (
          <View key={item.id} style={[styles.achievementCard, { backgroundColor: item.unlocked ? colors.primarySoft : colors.surface, borderColor: item.unlocked ? colors.primary : colors.border }]}>
            <View style={[styles.achievementIcon, { backgroundColor: item.unlocked ? colors.surface : colors.surfaceMuted }]}>
              <Text style={{ fontSize: 25 }}>{item.emoji}</Text>
            </View>
            <Text style={[styles.achievementName, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.achievementDetail, { color: colors.textMuted }]}>{item.detail}</Text>
            <Text style={[styles.achievementProgress, { color: item.unlocked ? colors.primaryDark : colors.textMuted }]}>{item.unlocked ? '已解锁 ✓' : item.progress}</Text>
          </View>
        ))}
      </ScrollView>
      <Pressable onPress={shareProgress} style={({ pressed }) => [styles.shareButton, { backgroundColor: colors.surface, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.shareButtonText, { color: colors.primaryDark }]}>分享我的阶段成绩</Text>
      </Pressable>

      <SectionTitle title="阶段提示" />
      <Card style={{ gap: 10 }}>
        <Text style={[styles.insightTitle, { color: colors.text }]}>🌱 {buildInsight(profile.targetWeightKg, latest?.weightKg, complianceRate)}</Text>
        <Text style={[styles.insightBody, { color: colors.textMuted }]}>建议每周固定时间、相似状态下测量体重和腰围，用 2–4 周趋势判断方案是否需要调整。</Text>
      </Card>
    </Screen>
  );
}

interface Achievement {
  id: string;
  emoji: string;
  name: string;
  detail: string;
  progress: string;
  unlocked: boolean;
}

function buildAchievements(targetWeight: number, calorieGoal: number, intakes: Array<{ date: string; calories: number }>, weights: Array<{ weightKg: number }>): Achievement[] {
  const recordDays = new Set(intakes.map(item => item.date)).size;
  const bestStreak = calculateBestStreak(intakes.map(item => item.date));
  const compliantDays = intakes.filter(item => item.calories > 0 && item.calories <= calorieGoal * 1.05).length;
  const latest = weights[0]?.weightKg;
  const oldest = weights[weights.length - 1]?.weightKg;
  const lostWeight = latest !== undefined && oldest !== undefined ? Math.max(0, oldest - latest) : 0;
  const distanceToTarget = latest === undefined ? Number.POSITIVE_INFINITY : Math.max(0, latest - targetWeight);
  return [
    { id: 'first-log', emoji: '🌱', name: '第一步', detail: '完成第1个饮食记录日', progress: `${Math.min(recordDays, 1)}/1 天`, unlocked: recordDays >= 1 },
    { id: 'streak-3', emoji: '🔥', name: '连续行动', detail: '连续3天记录饮食', progress: `${Math.min(bestStreak, 3)}/3 天`, unlocked: bestStreak >= 3 },
    { id: 'streak-7', emoji: '🏅', name: '一周坚持', detail: '连续7天记录饮食', progress: `${Math.min(bestStreak, 7)}/7 天`, unlocked: bestStreak >= 7 },
    { id: 'compliant-7', emoji: '🎯', name: '稳稳控量', detail: '累计7个摄入达标日', progress: `${Math.min(compliantDays, 7)}/7 天`, unlocked: compliantDays >= 7 },
    { id: 'lose-1kg', emoji: '🪶', name: '轻盈1公斤', detail: '阶段体重下降1公斤', progress: `${Math.min(lostWeight, 1).toFixed(1)}/1.0 kg`, unlocked: lostWeight >= 1 },
    { id: 'near-target', emoji: '🏁', name: '目标在望', detail: '距离目标体重不超过3公斤', progress: Number.isFinite(distanceToTarget) ? `还差 ${distanceToTarget.toFixed(1)} kg` : '先记录体重', unlocked: distanceToTarget <= 3 },
  ];
}

function calculateBestStreak(dates: string[]) {
  const ordered = [...new Set(dates)].sort();
  let best = 0;
  let current = 0;
  let previous = Number.NaN;
  for (const date of ordered) {
    const day = Date.parse(`${date}T00:00:00Z`) / 86400000;
    current = day - previous === 1 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = day;
  }
  return best;
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
  ruleHint: { fontSize: 10.5, lineHeight: 16 },
  achievementList: { gap: 10, paddingRight: 4 },
  achievementCard: { width: 164, minHeight: 180, borderRadius: 19, borderWidth: 1, padding: 14 },
  achievementIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  achievementName: { fontSize: 14, fontWeight: '900' },
  achievementDetail: { fontSize: 10.5, lineHeight: 16, marginTop: 5, flex: 1 },
  achievementProgress: { fontSize: 10.5, fontWeight: '800', marginTop: 10 },
  shareButton: { minHeight: 45, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  shareButtonText: { fontSize: 12, fontWeight: '900' },
  insightTitle: { fontSize: 15, fontWeight: '800', lineHeight: 22 },
  insightBody: { fontSize: 12, lineHeight: 19 },
});
