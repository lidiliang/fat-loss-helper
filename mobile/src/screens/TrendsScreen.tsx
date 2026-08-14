import { useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import { Card, EmptyState, Header, ProgressBar, Screen, SectionTitle } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useColors } from '../theme';

export function TrendsScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { profile, weights, dailyIntakes } = useApp();
  const [shareOpen, setShareOpen] = useState(false);
  if (!profile) return null;
  const chartWidth = Math.max(250, width - 58);
  const ordered = [...weights].reverse().slice(-14);
  const recentIntakes = dailyIntakes.slice(0, 30);
  const compliant = recentIntakes.filter(item => item.calories > 0 && item.calories <= profile.calorieGoal * 1.05).length;
  const complianceRate = recentIntakes.length ? Math.round(compliant / recentIntakes.length * 100) : 0;
  const latest = weights[0];
  const oldest = weights[weights.length - 1];
  const weightChange = latest && oldest ? latest.weightKg - oldest.weightKg : 0;
  const achievements = buildAchievements(oldest?.weightKg ?? profile.weightKg, profile.targetWeightKg, profile.calorieGoal, dailyIntakes, weights);
  const unlockedCount = achievements.filter(item => item.unlocked).length;

  return (
    <Screen style={styles.screen}>
      <Header compact eyebrow="进展" title="趋势与复盘" subtitle="看长期方向，不被某一天的起伏影响。" />
      <View style={styles.statsRow}>
        <Stat label="最新体重" value={latest ? `${latest.weightKg.toFixed(1)} kg` : '暂无'} />
        <Stat label="累计变化" value={weights.length > 1 ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg` : '暂无'} accent={weightChange <= 0} />
        <Stat label="摄入达标" value={`${complianceRate}%`} accent />
      </View>

      <SectionTitle compact title="体重趋势" action={<Text style={{ color: colors.textMuted, fontSize: 9.5 }}>最近 14 次记录</Text>} />
      <Card style={styles.compactCard}>
        {ordered.length < 2 ? <EmptyState icon="📈" title="还需要两次记录" detail="在记录页持续打卡体重，这里会生成变化曲线。" /> : (
          <LineChart data={ordered.map(item => item.weightKg)} labels={ordered.map(item => item.recordedDate.slice(5))} width={chartWidth} color={colors.primary} />
        )}
      </Card>

      <SectionTitle compact title="近 30 天摄入达标率" />
      <Card style={[styles.compactCard, { gap: 8 }]}>
        <View style={styles.complianceHeader}>
          <View>
            <Text style={[styles.complianceNumber, { color: colors.text }]}>{complianceRate}%</Text>
            <Text style={[styles.complianceDetail, { color: colors.textMuted }]}>{recentIntakes.length ? `${compliant}/${recentIntakes.length} 个记录日未超过目标的 105%` : '还没有饮食记录'}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}><Text style={{ color: colors.primaryDark, fontWeight: '800', fontSize: 9.5 }}>稳定比极端更重要</Text></View>
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

      <SectionTitle compact title={`减脂里程碑 · 已解锁 ${unlockedCount}/${achievements.length}`} action={<Text style={{ color: colors.textMuted, fontSize: 9 }}>左右滑动</Text>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.achievementList}>
        {achievements.map(item => (
          <View key={item.id} style={[styles.achievementCard, { backgroundColor: item.unlocked ? colors.primarySoft : colors.surface, borderColor: item.unlocked ? colors.primary : colors.border }]}>
            <View style={[styles.achievementIcon, { backgroundColor: item.unlocked ? colors.surface : colors.surfaceMuted }]}>
              <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
            </View>
            <Text style={[styles.achievementName, { color: colors.text }]}>{item.name}</Text>
            <Text numberOfLines={2} style={[styles.achievementDetail, { color: colors.textMuted }]}>{item.detail}</Text>
            <Text style={[styles.achievementProgress, { color: item.unlocked ? colors.primaryDark : colors.textMuted }]}>{item.unlocked ? '已解锁 ✓' : item.progress}</Text>
          </View>
        ))}
      </ScrollView>
      <Pressable onPress={() => setShareOpen(true)} style={({ pressed }) => [styles.shareButton, { backgroundColor: colors.surface, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.shareButtonText, { color: colors.primaryDark }]}>分享我的阶段成绩</Text>
      </Pressable>

      <ShareCardModal
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        latestWeight={latest?.weightKg}
        targetWeight={profile.targetWeightKg}
        weightChange={weightChange}
        complianceRate={complianceRate}
        unlockedCount={unlockedCount}
        totalAchievements={achievements.length}
        achievements={achievements}
      />

      <SectionTitle compact title="阶段提示" />
      <Card style={[styles.compactCard, { gap: 6 }]}>
        <Text style={[styles.insightTitle, { color: colors.text }]}>🌱 {buildInsight(profile.targetWeightKg, latest?.weightKg, complianceRate)}</Text>
        <Text style={[styles.insightBody, { color: colors.textMuted }]}>建议每周固定时间、相似状态下测量体重和腰围，用 2–4 周趋势判断方案是否需要调整。</Text>
      </Card>
    </Screen>
  );
}

function ShareCardModal({
  visible,
  onClose,
  latestWeight,
  targetWeight,
  weightChange,
  complianceRate,
  unlockedCount,
  totalAchievements,
  achievements,
}: {
  visible: boolean;
  onClose: () => void;
  latestWeight?: number;
  targetWeight: number;
  weightChange: number;
  complianceRate: number;
  unlockedCount: number;
  totalAchievements: number;
  achievements: Achievement[];
}) {
  const colors = useColors();
  const shareCardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const unlockedNames = achievements.filter(item => item.unlocked).slice(-3);

  const shareProgressImage = async () => {
    if (sharing) return;
    setSharing(true);
    let imageUri: string | undefined;
    try {
      if (!await Sharing.isAvailableAsync()) {
        Alert.alert('暂时无法分享', '当前设备不支持系统文件分享。');
        return;
      }
      imageUri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(imageUri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: '分享我的阶段成绩',
      });
    } catch (error) {
      console.warn('Unable to share progress card', error);
      Alert.alert('分享失败', '成绩卡生成失败，请稍后再试。');
    } finally {
      if (imageUri) releaseCapture(imageUri);
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.shareModalBackdrop}>
        <View style={styles.shareModalContent}>
          <View ref={shareCardRef} collapsable={false} style={[styles.shareCard, { backgroundColor: colors.primaryDark }]}>
            <View style={styles.shareCardTopline}>
              <Text style={styles.shareCardBrand}>轻脂管家</Text>
              <Text style={styles.shareCardLeaf}>✦</Text>
            </View>
            <Text style={styles.shareCardEyebrow}>MY HEALTHY CUT</Text>
            <Text style={styles.shareCardTitle}>稳稳变轻，持续向前</Text>
            <View style={styles.shareCardHero}>
              <Text style={styles.shareCardHeroNumber}>{complianceRate}<Text style={styles.shareCardHeroUnit}>%</Text></Text>
              <Text style={styles.shareCardHeroLabel}>近30天摄入达标率</Text>
            </View>
            <View style={styles.shareCardStats}>
              <ShareStat label="当前体重" value={latestWeight === undefined ? '—' : `${latestWeight.toFixed(1)} kg`} />
              <ShareStat label="目标体重" value={`${targetWeight.toFixed(1)} kg`} />
              <ShareStat label="阶段变化" value={latestWeight === undefined ? '—' : `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} kg`} />
            </View>
            <View style={styles.shareCardMilestone}>
              <Text style={styles.shareCardMilestoneLabel}>减脂里程碑</Text>
              <Text style={styles.shareCardMilestoneCount}>{unlockedCount}<Text style={styles.shareCardMilestoneTotal}> / {totalAchievements} 已解锁</Text></Text>
              <Text style={styles.shareCardMilestoneNames}>{unlockedNames.length ? unlockedNames.map(item => `${item.emoji} ${item.name}`).join('　') : '从今天的第一条记录开始'}</Text>
            </View>
            <Text style={styles.shareCardFooter}>不追求完美，只把今天做好一点。</Text>
          </View>
          <Text style={[styles.shareModalHint, { color: colors.textMuted }]}>生成高清图片后，通过系统面板分享</Text>
          <View style={styles.shareModalActions}>
            <View style={{ flex: 1 }}><Pressable onPress={onClose} style={[styles.shareModalButton, { borderColor: colors.border }]}><Text style={{ color: colors.textMuted, fontWeight: '800' }}>关闭</Text></Pressable></View>
            <View style={{ flex: 1 }}><Pressable disabled={sharing} onPress={() => void shareProgressImage()} style={[styles.shareModalButton, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: sharing ? 0.65 : 1 }]}><Text style={{ color: colors.white, fontWeight: '800' }}>{sharing ? '生成中…' : '分享图片'}</Text></Pressable></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ShareStat({ label, value }: { label: string; value: string }) {
  return <View style={styles.shareStat}><Text style={styles.shareStatLabel}>{label}</Text><Text style={styles.shareStatValue}>{value}</Text></View>;
}

interface Achievement {
  id: string;
  emoji: string;
  name: string;
  detail: string;
  progress: string;
  unlocked: boolean;
}

function buildAchievements(startWeight: number, targetWeight: number, calorieGoal: number, intakes: Array<{ date: string; calories: number }>, weights: Array<{ weightKg: number }>): Achievement[] {
  const recordDays = new Set(intakes.map(item => item.date)).size;
  const bestStreak = calculateBestStreak(intakes.map(item => item.date));
  const compliantDays = intakes.filter(item => item.calories > 0 && item.calories <= calorieGoal * 1.05).length;
  const latest = weights[0]?.weightKg;
  const plannedLoss = Math.max(0, startWeight - targetWeight);
  const achievedLoss = latest === undefined ? 0 : Math.max(0, startWeight - latest);
  const rawGoalProgress = plannedLoss > 0
    ? achievedLoss / plannedLoss * 100
    : latest !== undefined && latest <= targetWeight ? 100 : 0;
  const goalProgress = Math.min(100, Math.max(0, rawGoalProgress));
  return [
    { id: 'first-log', emoji: '🌱', name: '第一步', detail: '完成第1个饮食记录日', progress: `${Math.min(recordDays, 1)}/1 天`, unlocked: recordDays >= 1 },
    { id: 'streak-3', emoji: '🔥', name: '连续行动', detail: '连续3天记录饮食', progress: `${Math.min(bestStreak, 3)}/3 天`, unlocked: bestStreak >= 3 },
    { id: 'streak-7', emoji: '🏅', name: '一周坚持', detail: '连续7天记录饮食', progress: `${Math.min(bestStreak, 7)}/7 天`, unlocked: bestStreak >= 7 },
    { id: 'compliant-14', emoji: '🎯', name: '稳稳控量', detail: '累计14个摄入达标日', progress: `${Math.min(compliantDays, 14)}/14 天`, unlocked: compliantDays >= 14 },
    { id: 'record-14', emoji: '🗓️', name: '记录成习惯', detail: '累计完成14个饮食记录日', progress: `${Math.min(recordDays, 14)}/14 天`, unlocked: recordDays >= 14 },
    { id: 'near-target', emoji: '🏁', name: '目标在望', detail: '完成超过90%的目标减重进度', progress: latest === undefined ? '先记录体重' : `已完成 ${Math.floor(goalProgress)}%`, unlocked: goalProgress > 90 },
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
  const height = 130;
  const paddingX = 14;
  const paddingY = 20;
  const min = Math.min(...data) - 0.5;
  const max = Math.max(...data) + 0.5;
  const points = useMemo(() => data.map((value, index) => {
    const x = paddingX + (index / (data.length - 1)) * (width - paddingX * 2);
    const y = paddingY + ((max - value) / Math.max(1, max - min)) * (height - paddingY * 2);
    return { x, y, value };
  }), [data, width, min, max]);
  return (
    <Svg width={width} height={height}>
      {[0, 1, 2].map(index => {
        const y = paddingY + index * ((height - paddingY * 2) / 2);
        return <Line key={index} x1="0" x2={width} y1={y} y2={y} stroke={colors.border} strokeWidth="1" />;
      })}
      <Polyline points={points.map(item => `${item.x},${item.y}`).join(' ')} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((item, index) => (
        <Circle key={index} cx={item.x} cy={item.y} r="3" fill={colors.surface} stroke={color} strokeWidth="2.5" />
      ))}
      <SvgText x={paddingX} y={height - 1} fill={colors.textMuted} fontSize="8">{labels[0]}</SvgText>
      <SvgText x={width - paddingX - 25} y={height - 1} fill={colors.textMuted} fontSize="8">{labels[labels.length - 1]}</SvgText>
      <SvgText x={paddingX} y={14} fill={colors.text} fontSize="10" fontWeight="700">{data[data.length - 1].toFixed(1)} kg</SvgText>
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
  screen: { paddingHorizontal: 16, paddingTop: 9, gap: 11 },
  compactCard: { padding: 12, borderRadius: 17 },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 9, borderRadius: 13, borderWidth: 1, gap: 2 },
  statLabel: { fontSize: 8.5, fontWeight: '700' },
  statValue: { fontSize: 13, fontWeight: '900' },
  complianceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  complianceNumber: { fontSize: 24, fontWeight: '900' },
  complianceDetail: { fontSize: 9, marginTop: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  calendarRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  calendarDot: { width: 11, height: 11, borderRadius: 3 },
  ruleHint: { fontSize: 9.5, lineHeight: 14 },
  achievementList: { gap: 8, paddingRight: 4 },
  achievementCard: { width: 140, minHeight: 140, borderRadius: 15, borderWidth: 1, padding: 11 },
  achievementIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  achievementName: { fontSize: 12.5, fontWeight: '900' },
  achievementDetail: { fontSize: 9.5, lineHeight: 13, marginTop: 3, flex: 1 },
  achievementProgress: { fontSize: 9.5, fontWeight: '800', marginTop: 6 },
  shareButton: { minHeight: 38, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  shareButtonText: { fontSize: 11, fontWeight: '900' },
  shareModalBackdrop: { flex: 1, backgroundColor: '#0B1711CC', alignItems: 'center', justifyContent: 'center', padding: 20 },
  shareModalContent: { width: '100%', maxWidth: 380, alignItems: 'center', gap: 11 },
  shareCard: { width: '100%', borderRadius: 28, padding: 23, overflow: 'hidden' },
  shareCardTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shareCardBrand: { color: '#E8F5EC', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  shareCardLeaf: { color: '#A9E4BD', fontSize: 24, fontWeight: '900' },
  shareCardEyebrow: { color: '#9AD4AF', fontSize: 9, fontWeight: '800', letterSpacing: 2, marginTop: 29 },
  shareCardTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 5 },
  shareCardHero: { marginTop: 23, alignItems: 'center' },
  shareCardHeroNumber: { color: '#FFFFFF', fontSize: 65, lineHeight: 72, fontWeight: '900', letterSpacing: -2 },
  shareCardHeroUnit: { fontSize: 25, letterSpacing: 0 },
  shareCardHeroLabel: { color: '#BFE8CB', fontSize: 11, fontWeight: '700', marginTop: 1 },
  shareCardStats: { flexDirection: 'row', gap: 7, marginTop: 24 },
  shareStat: { flex: 1, minHeight: 61, borderRadius: 15, padding: 9, backgroundColor: '#FFFFFF18', justifyContent: 'center' },
  shareStatLabel: { color: '#BFE8CB', fontSize: 9 },
  shareStatValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', marginTop: 4 },
  shareCardMilestone: { marginTop: 20, paddingTop: 15, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF3D' },
  shareCardMilestoneLabel: { color: '#BFE8CB', fontSize: 10, fontWeight: '700' },
  shareCardMilestoneCount: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 3 },
  shareCardMilestoneTotal: { color: '#BFE8CB', fontSize: 11, fontWeight: '700' },
  shareCardMilestoneNames: { color: '#E8F5EC', fontSize: 10.5, marginTop: 7 },
  shareCardFooter: { color: '#BFE8CB', fontSize: 10.5, marginTop: 23, textAlign: 'center' },
  shareModalHint: { fontSize: 10.5, fontWeight: '700' },
  shareModalActions: { width: '100%', flexDirection: 'row', gap: 10 },
  shareModalButton: { minHeight: 45, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  insightTitle: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  insightBody: { fontSize: 10.5, lineHeight: 16 },
});
