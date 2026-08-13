import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Field, Header, PrimaryButton, ProgressBar, Screen, SectionTitle } from '../components/ui';
import { MarkdownText } from '../components/MarkdownText';
import { CONVENIENT_FAT_LOSS_FOODS, FATTY_LIVER_LEVELS, MEAL_LABELS } from '../data/seed';
import { calculateGoals, dateKey, getMealRecommendation, getSaturatedFatLimit, summarizeDay } from '../lib/calculations';
import { buildMiniMealRecommendations, MiniMealRecommendation } from '../lib/mealRecommendations';
import { askNutritionAI, generateDailyAIPlan, generateDailyAISummary, getAIHistory, getDailyAISummary } from '../lib/api';
import { buildAIDailyContext } from '../lib/ai';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { AIDailyContext, AIHistoryItem, AISummaryRecord, MealType, RootTab } from '../types';
import { useColors } from '../theme';

export function DashboardScreen({ onNavigate }: { onNavigate: (tab: RootTab) => void }) {
  const colors = useColors();
  const { profile, foods, foodPreferences, meals, exercises, summary, selectedDate, reminders, addTemplate, setSelectedDate } = useApp();
  if (!profile) return null;

  const plannedMealTypes: MealType[] = reminders?.snack.trim()
    ? ['breakfast', 'lunch', 'dinner', 'snack']
    : ['breakfast', 'lunch', 'dinner'];
  const mealCount = new Set(meals.filter(item => plannedMealTypes.includes(item.mealType)).map(item => item.mealType)).size;
  const recommendation = getMealRecommendation(profile, summary, mealCount, plannedMealTypes.length);
  const recordedMealTypes = new Set(meals.map(item => item.mealType));
  const nextMealType = plannedMealTypes.find(type => !recordedMealTypes.has(type)) ?? plannedMealTypes[plannedMealTypes.length - 1];
  const miniMeals = buildMiniMealRecommendations({ foods, preferences: foodPreferences, mealType: nextMealType, calorieBudget: recommendation.calories });
  const goalComparison = calculateGoals({
    gender: profile.gender,
    age: profile.age,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    activityLevel: profile.activityLevel,
    weeklyLossKg: profile.weeklyLossKg,
    fattyLiverLevel: profile.fattyLiverLevel,
  });
  const remaining = Math.max(0, profile.calorieGoal - summary.calories);
  const isToday = selectedDate === dateKey();
  const todayLabel = isToday ? '今天' : selectedDate;
  const macroEnergy = summary.protein * 4 + summary.carb * 4 + summary.fat * 9;
  const macroShares = {
    protein: macroEnergy ? Math.round(summary.protein * 4 / macroEnergy * 100) : 0,
    carb: macroEnergy ? Math.round(summary.carb * 4 / macroEnergy * 100) : 0,
    fat: macroEnergy ? Math.max(0, 100 - Math.round(summary.protein * 4 / macroEnergy * 100) - Math.round(summary.carb * 4 / macroEnergy * 100)) : 0,
  };

  const moveDate = (days: number) => {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    setSelectedDate(dateKey(date));
  };

  const confirmMiniMeal = (item: MiniMealRecommendation) => {
    Alert.alert(
      `添加到${MEAL_LABELS[nextMealType]}？`,
      `${item.template.name}\n${item.template.description}\n约 ${item.calories} kcal · 蛋白质 ${item.protein}g`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认添加',
          onPress: () => {
            void addTemplate(item.template, nextMealType)
              .then(() => Alert.alert('记录成功', `“${item.template.name}”已添加到${MEAL_LABELS[nextMealType]}。`))
              .catch(error => Alert.alert('无法添加', error instanceof Error ? error.message : '请稍后重试'));
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Header
        eyebrow={`轻脂管家 · ${todayLabel}`}
        title={`你好，${profile.name}`}
        subtitle={`${todayLabel}也不用追求完美，完成一次真实记录就很好。`}
        right={<View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}><Text style={{ fontSize: 23 }}>🌿</Text></View>}
      />

      <View style={[styles.dateNav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable onPress={() => moveDate(-1)} hitSlop={12} accessibilityLabel="查看前一天">
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Pressable disabled={isToday} onPress={() => setSelectedDate(dateKey())} style={{ alignItems: 'center' }} accessibilityLabel="返回今天">
          <Text style={[styles.dateText, { color: colors.text }]}>{todayLabel}</Text>
          <Text style={[styles.dateHint, { color: colors.textMuted }]}>{isToday ? selectedDate : '历史摄入复盘 · 点此回今天'}</Text>
        </Pressable>
        <Pressable disabled={isToday} onPress={() => moveDate(1)} hitSlop={12} accessibilityLabel="查看后一天" style={{ opacity: isToday ? 0.25 : 1 }}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>{isToday ? '今日剩余预算' : '当日剩余预算'}</Text>
          <Text style={styles.heroNumber}>{remaining}<Text style={styles.heroUnit}> kcal</Text></Text>
          <Text style={styles.heroMeta}>已摄入 {Math.round(summary.calories)} · 运动消耗 {Math.round(summary.burned)}</Text>
        </View>
        <View style={styles.ring}>
          <Text style={styles.ringNumber}>{Math.round(Math.min(100, summary.calories / profile.calorieGoal * 100))}%</Text>
          <Text style={styles.ringLabel}>摄入进度</Text>
        </View>
      </View>

      <View style={styles.macroGrid}>
        <MacroCard label="蛋白质" value={summary.protein} goal={profile.proteinGoal} unit="g" color={colors.primary} energyShare={macroShares.protein} />
        <MacroCard label="碳水" value={summary.carb} goal={profile.carbGoal} unit="g" color={colors.blue} energyShare={macroShares.carb} />
        <MacroCard label="脂肪" value={summary.fat} goal={profile.fatGoal} unit="g" color={colors.orange} energyShare={macroShares.fat} />
      </View>

      {isToday ? <DailyPlanCard /> : null}

      {isToday && summary.calories > 0 && summary.carb < profile.carbGoal * 0.65 ? (
        <View style={[styles.carbHint, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.carbHintIcon, { backgroundColor: colors.primarySoft }]}><Text style={{ fontSize: 20 }}>🍠</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.carbHintTitle, { color: colors.text }]}>碳水进度偏低，别只顾补蛋白质</Text>
            <Text style={[styles.carbHintText, { color: colors.textMuted }]}>碳水是身体的重要能量来源，适量摄入有助于训练和日常状态，也能减少身体把蛋白质用于供能。可优先补充蒸红薯 1 个（约150g、脂肪极低），其次煮玉米 1 根（约180g）；仍需计入全天热量和碳水目标。</Text>
          </View>
        </View>
      ) : null}

      {profile.fattyLiverLevel !== 'none' ? (
        <View style={[styles.goalComparison, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.goalComparisonIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="shield-checkmark-outline" size={17} color={colors.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.goalComparisonTitle, { color: colors.text }]}>{FATTY_LIVER_LEVELS.find(item => item.value === profile.fattyLiverLevel)?.label}脂肪肝护肝目标已启用</Text>
            <Text style={[styles.goalComparisonText, { color: colors.textMuted }]}>普通脂肪 {goalComparison.standardFatGoal}g → 推荐 {profile.fatGoal}g；蛋白质 {goalComparison.standardProteinGoal}g → {profile.proteinGoal}g</Text>
          </View>
        </View>
      ) : null}

      {isToday ? <Card style={{ gap: 14, backgroundColor: colors.primarySoft }}>
        <View style={styles.recommendTitle}>
          <View style={[styles.recommendIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.recommendEyebrow, { color: colors.primaryDark }]}>下一餐建议</Text>
            <Text style={[styles.recommendBudget, { color: colors.text }]}>≤ {recommendation.calories} kcal · 蛋白质约 {recommendation.protein}g · 碳水约 {recommendation.carb}g</Text>
          </View>
        </View>
        <Text style={[styles.recommendText, { color: colors.text }]}>{recommendation.message}</Text>
        <Text style={[styles.limit, { color: colors.textMuted }]}>建议脂肪不超过 {recommendation.fat}g</Text>
        <View style={[styles.liverHint, { backgroundColor: colors.surface }]}>
          <Ionicons name="leaf-outline" size={15} color={colors.primary} />
          <Text style={[styles.liverHintText, { color: colors.textMuted }]}>饱和脂肪建议 ≤ {getSaturatedFatLimit(profile.fatGoal)}g/天；少用猪油、黄油和肥肉，优先鱼类、少量坚果及植物油。</Text>
        </View>
        <View style={[styles.miniDivider, { backgroundColor: colors.border }]} />
        <View style={styles.miniHeadingRow}>
          <View>
            <Text style={[styles.miniHeading, { color: colors.text }]}>{MEAL_LABELS[nextMealType]}迷你套餐</Text>
            <Text style={[styles.miniSubheading, { color: colors.textMuted }]}>结合历史偏好与本餐预算，可确认后一键记录</Text>
          </View>
          <Text style={[styles.miniCount, { color: colors.primaryDark }]}>{miniMeals.length ? `${miniMeals.length} 套` : '预算不足'}</Text>
        </View>
        {miniMeals.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.miniMealList}>
            {miniMeals.map(item => (
              <View key={item.template.id} style={[styles.miniMealCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.miniBadge, { color: colors.primaryDark, backgroundColor: colors.primarySoft }]}>{item.badge}</Text>
                <Text style={[styles.miniMealName, { color: colors.text }]}>{item.template.name}</Text>
                <Text style={[styles.miniMealDescription, { color: colors.textMuted }]} numberOfLines={3}>{item.template.description}</Text>
                <Text style={[styles.miniNutrition, { color: colors.text }]}>{item.calories} kcal · 蛋白质 {item.protein}g</Text>
                <Pressable onPress={() => confirmMiniMeal(item)} style={({ pressed }) => [styles.miniAddButton, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}>
                  <Text style={styles.miniAddButtonText}>一键记录</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={[styles.miniEmpty, { color: colors.textMuted }]}>本餐剩余建议不足 80 kcal，先查看今天已记录的食物，避免重复添加。</Text>
        )}
      </Card> : (
        <Card style={{ gap: 8, backgroundColor: colors.primarySoft }}>
          <Text style={[styles.recommendEyebrow, { color: colors.primaryDark }]}>历史日期复盘</Text>
          <Text style={[styles.recommendText, { color: colors.text }]}>当前正在查看 {selectedDate}，热量、营养素供能占比和下方摄入清单均已联动。返回今天后可继续使用下一餐建议和一键套餐。</Text>
        </Card>
      )}

      <AIAssistantCard />

      <SectionTitle title="方便常备的减脂友好食物" action={<Text style={{ color: colors.textMuted, fontSize: 10 }}>左右滑动</Text>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.foodTipsList}>
        {CONVENIENT_FAT_LOSS_FOODS.map(item => (
          <View key={item.foodId} style={[styles.foodTipCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.foodTipIcon, { backgroundColor: colors.primarySoft }]}><Text style={{ fontSize: 22 }}>{item.emoji}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.foodTipName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.foodTipPortion, { color: colors.primaryDark }]}>{item.portion}</Text>
              <Text style={[styles.foodTipReason, { color: colors.textMuted }]}>{item.reason}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <Text style={[styles.foodTipsDisclaimer, { color: colors.textMuted }]}>这些食物便于控制份量和坚持记录；减脂效果仍取决于全天总热量与长期执行。</Text>

      <SectionTitle title={`${todayLabel}摄入与运动明细`} />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {meals.length === 0 && exercises.length === 0 ? (
          <View style={styles.noRecords}>
            <Text style={{ fontSize: 28 }}>🥣</Text>
            <Text style={[styles.noRecordTitle, { color: colors.text }]}>还没有记录</Text>
            <Text style={[styles.noRecordDetail, { color: colors.textMuted }]}>从第一口开始记录，不需要等到“完美的一餐”。</Text>
          </View>
        ) : (
          <>
            {(Object.keys(MEAL_LABELS) as Array<keyof typeof MEAL_LABELS>).map(type => {
              const items = meals.filter(item => item.mealType === type);
              if (!items.length) return null;
              const mealSummary = items.reduce((sum, item) => ({
                calories: sum.calories + item.calories,
                protein: sum.protein + item.protein,
                fat: sum.fat + item.fat,
                carb: sum.carb + item.carb,
              }), { calories: 0, protein: 0, fat: 0, carb: 0 });
              return (
                <View key={type} style={[styles.mealSection, { borderBottomColor: colors.border }]}>
                  <View style={styles.mealHeader}>
                    <View style={[styles.recordIcon, { backgroundColor: colors.surfaceMuted }]}><Text>{type === 'breakfast' ? '☀️' : type === 'lunch' ? '🍚' : type === 'dinner' ? '🌙' : '🍎'}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.recordName, { color: colors.text }]}>{MEAL_LABELS[type]}</Text>
                      <Text style={[styles.recordFoods, { color: colors.textMuted }]}>蛋白质 {mealSummary.protein.toFixed(1)}g · 脂肪 {mealSummary.fat.toFixed(1)}g · 碳水 {mealSummary.carb.toFixed(1)}g</Text>
                    </View>
                    <Text style={[styles.recordCalories, { color: colors.text }]}>{Math.round(mealSummary.calories)} kcal</Text>
                  </View>
                  <View style={[styles.mealItems, { backgroundColor: colors.surfaceMuted }]}>
                    {items.map(item => (
                      <View key={item.id} style={styles.mealItemRow}>
                        <Text style={[styles.mealItemName, { color: colors.text }]}>{item.foodName}</Text>
                        <Text style={[styles.mealItemNutrition, { color: colors.textMuted }]}>{Math.round(item.calories)} kcal · 蛋 {item.protein.toFixed(1)}g · 脂 {item.fat.toFixed(1)}g · 碳 {item.carb.toFixed(1)}g</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
            {exercises.map(item => (
              <View key={item.id} style={[styles.recordRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.recordIcon, { backgroundColor: colors.primarySoft }]}><Text>🏃</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recordName, { color: colors.text }]}>{item.exerciseType}</Text>
                  <Text style={[styles.recordFoods, { color: colors.textMuted }]}>{item.durationMin} 分钟</Text>
                </View>
                <Text style={[styles.recordCalories, { color: colors.primary }]}>−{Math.round(item.caloriesBurned)} kcal</Text>
              </View>
            ))}
          </>
        )}
      </Card>
      <PrimaryButton label="记录饮食或运动" onPress={() => onNavigate('record')} />
    </Screen>
  );
}

function AIAssistantCard() {
  const colors = useColors();
  const { token } = useAuth();
  const app = useApp();
  const [summaryRecord, setSummaryRecord] = useState<AISummaryRecord | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyType, setHistoryType] = useState<'all' | 'daily_summary' | 'question'>('all');
  const [history, setHistory] = useState<AIHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState('');
  const context = useMemo(() => app.profile ? buildAIDailyContext({
    date: app.selectedDate,
    profile: app.profile,
    summary: app.summary,
    meals: app.meals,
    exercises: app.exercises,
  }) : null, [app.selectedDate, app.profile, app.summary, app.meals, app.exercises]);

  useEffect(() => {
    setAnswer('');
    if (!token) return;
    getDailyAISummary(token, app.selectedDate)
      .then(result => {
        setSummaryRecord(result.summary);
        setRemaining(result.remaining);
      })
      .catch(() => {
        setSummaryRecord(null);
        setRemaining(null);
      });
  }, [token, app.selectedDate]);

  const generate = async () => {
    if (!token || !context) return Alert.alert('请先登录');
    setSummaryLoading(true);
    try {
      const result = await generateDailyAISummary(token, context, Boolean(summaryRecord));
      setSummaryRecord(result.summary);
      setRemaining(result.remaining);
      if (historyOpen) void loadHistory();
    } catch (error) {
      Alert.alert('无法生成总结', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setSummaryLoading(false);
    }
  };

  const ask = async () => {
    if (!token || !context || !question.trim()) return Alert.alert('请先输入问题');
    setAsking(true);
    try {
      const result = await askNutritionAI(token, question.trim(), context);
      setAnswer(result.answer);
      setRemaining(result.remaining);
      if (historyOpen) void loadHistory();
    } catch (error) {
      Alert.alert('暂时无法回答', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setAsking(false);
    }
  };

  const loadHistory = async (type = historyType) => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const result = await getAIHistory(token, type);
      setHistory(result.items);
    } catch (error) {
      Alert.alert('无法读取历史对话', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && !history.length) void loadHistory();
  };

  const changeHistoryType = (type: 'all' | 'daily_summary' | 'question') => {
    setHistoryType(type);
    setExpandedHistoryId('');
    void loadHistory(type);
  };

  const isLatest = Boolean(summaryRecord && context && summaryRecord.contextVersion === context.version);
  return (
    <Card style={styles.aiCard}>
      <View style={styles.aiHeader}>
        <View style={[styles.recommendIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="sparkles" size={18} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.aiTitle, { color: colors.text }]}>DeepSeek 营养助手</Text>
          <Text style={[styles.aiMeta, { color: colors.textMuted }]}>当日总结与问答会永久保存在服务端{remaining === null ? '' : ` · 今日剩余 ${remaining}/50 次`}</Text>
        </View>
      </View>
      {summaryRecord ? (
        <View style={[styles.aiAnswer, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.aiStatus, { color: isLatest ? colors.primaryDark : colors.orange }]}>{isLatest ? '已按当前记录生成' : '饮食或运动已变化，可重新生成'}</Text>
          <MarkdownText value={summaryRecord.responseText} />
        </View>
      ) : <Text style={[styles.aiHint, { color: colors.textMuted }]}>记录饮食和运动后，可让 AI 从热量与三大营养素角度做一次温和复盘。</Text>}
      <PrimaryButton label={summaryRecord ? '重新生成今日总结' : '生成今日总结'} onPress={generate} loading={summaryLoading} secondary={Boolean(summaryRecord)} />
      <View style={[styles.miniDivider, { backgroundColor: colors.border }]} />
      <Text style={[styles.aiQuestionTitle, { color: colors.text }]}>结合当天记录提问</Text>
      <View style={styles.aiExamples}>
        {['今天再吃一个130克的小苹果可以吗？', '今天需要少吃一个蛋黄吗？'].map(value => (
          <Pressable key={value} onPress={() => setQuestion(value)} style={[styles.aiExample, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
            <Text style={[styles.aiExampleText, { color: colors.textMuted }]}>{value}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="你的问题" value={question} onChangeText={setQuestion} placeholder="例如：今晚还能喝一杯脱脂牛奶吗？" multiline />
      <PrimaryButton label="发送给 DeepSeek" onPress={ask} loading={asking} disabled={!question.trim()} />
      {answer ? <View style={[styles.aiAnswer, { backgroundColor: colors.primarySoft }]}><MarkdownText value={answer} /></View> : null}
      <View style={[styles.miniDivider, { backgroundColor: colors.border }]} />
      <Pressable onPress={toggleHistory} style={styles.historyToggle}>
        <View>
          <Text style={[styles.aiQuestionTitle, { color: colors.text }]}>历史对话</Text>
          <Text style={[styles.aiMeta, { color: colors.textMuted }]}>查看已保存的每日总结与营养问答</Text>
        </View>
        <Ionicons name={historyOpen ? 'chevron-up' : 'chevron-down'} size={19} color={colors.textMuted} />
      </Pressable>
      {historyOpen ? (
        <View style={styles.historyArea}>
          <View style={styles.aiExamples}>
            {([['all', '全部'], ['daily_summary', '每日总结'], ['question', '问答']] as const).map(([value, label]) => (
              <Pressable key={value} onPress={() => changeHistoryType(value)} style={[styles.historyFilter, { borderColor: historyType === value ? colors.primary : colors.border, backgroundColor: historyType === value ? colors.primarySoft : colors.surfaceMuted }]}>
                <Text style={{ color: historyType === value ? colors.primaryDark : colors.textMuted, fontSize: 10, fontWeight: '800' }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {historyLoading ? <Text style={[styles.aiHint, { color: colors.textMuted }]}>正在加载历史…</Text> : history.length ? history.map(item => {
            const expanded = expandedHistoryId === item.id;
            return (
              <Pressable key={item.id} onPress={() => setExpandedHistoryId(expanded ? '' : item.id)} style={[styles.historyItem, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                <View style={styles.historyItemHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyKind, { color: colors.primaryDark }]}>{item.interactionType === 'daily_summary' ? '每日总结' : '营养问答'} · {item.dayKey || item.createdAt.slice(0, 10)}</Text>
                    <Text numberOfLines={expanded ? undefined : 2} style={[styles.historyPreview, { color: colors.text }]}>{item.question || item.responseText}</Text>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                </View>
                {expanded ? <View style={[styles.historyAnswer, { borderTopColor: colors.border }]}>{item.question ? <Text style={[styles.historyQuestion, { color: colors.text }]}>问题：{item.question}</Text> : null}<MarkdownText value={item.responseText} /></View> : null}
              </Pressable>
            );
          }) : <Text style={[styles.aiHint, { color: colors.textMuted }]}>还没有这一类历史记录。</Text>}
        </View>
      ) : null}
      <Text style={[styles.aiDisclaimer, { color: colors.textMuted }]}>AI 建议仅供饮食记录与生活方式参考，不替代医生诊断；重度脂肪肝、血糖异常或明显不适请及时就医。</Text>
    </Card>
  );
}

function DailyPlanCard() {
  const colors = useColors();
  const { token } = useAuth();
  const app = useApp();
  const [plan, setPlan] = useState<AISummaryRecord | null>(null);
  const [contexts, setContexts] = useState<AIDailyContext[]>([]);
  const [loading, setLoading] = useState(false);
  const [insufficient, setInsufficient] = useState(false);

  const loadOrGenerate = async (force = false) => {
    if (!token || !app.profile) return;
    setLoading(true);
    try {
      const days = [-2, -1].map(offset => {
        const value = new Date(`${dateKey()}T12:00:00`);
        value.setDate(value.getDate() + offset);
        return dateKey(value);
      });
      const records = await Promise.all(days.map(day => app.getDayRecords(day)));
      const nextContexts = records.map((record, index) => buildAIDailyContext({
        date: days[index], profile: app.profile!, summary: summarizeDay(record.meals, record.exercises), meals: record.meals, exercises: record.exercises,
      }));
      setContexts(nextContexts);
      const hasRecords = records.some(record => record.meals.length || record.exercises.length);
      setInsufficient(!hasRecords);
      if (!hasRecords) return;
      const result = await generateDailyAIPlan(token, dateKey(), nextContexts, force);
      setPlan(result.plan);
    } catch (error) {
      if (force) Alert.alert('无法生成今日方案', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrGenerate(false);
  }, [token, app.profile?.updatedAt]);

  return (
    <Card style={[styles.dailyPlanCard, { backgroundColor: colors.surface }]}>
      <View style={styles.aiHeader}>
        <View style={[styles.recommendIcon, { backgroundColor: colors.primarySoft }]}><Ionicons name="calendar-outline" size={18} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.aiTitle, { color: colors.text }]}>今日控制方案</Text>
          <Text style={[styles.aiMeta, { color: colors.textMuted }]}>根据昨天与前天的饮食、运动记录生成 · 每日自动一次</Text>
        </View>
      </View>
      {loading && !plan ? <Text style={[styles.aiHint, { color: colors.textMuted }]}>正在分析前两天的记录…</Text> : plan ? <View style={[styles.aiAnswer, { backgroundColor: colors.primarySoft }]}><MarkdownText value={plan.responseText} /></View> : <Text style={[styles.aiHint, { color: colors.textMuted }]}>{insufficient ? '前两天记录不足，先完成今天的真实记录；有历史数据后会自动生成方案。' : '暂时无法读取今日方案，可稍后手动重试。'}</Text>}
      {!insufficient ? <PrimaryButton label={plan ? '根据最新记录重新生成' : '生成今日方案'} onPress={() => loadOrGenerate(Boolean(plan))} loading={loading} secondary /> : null}
      {contexts.length ? <Text style={[styles.aiDisclaimer, { color: colors.textMuted }]}>数据范围：{contexts[0].date} 至 {contexts[contexts.length - 1].date}</Text> : null}
    </Card>
  );
}

function MacroCard({ label, value, goal, unit, color, energyShare }: { label: string; value: number; goal: number; unit: string; color: string; energyShare: number }) {
  const colors = useColors();
  return (
    <View style={[styles.macroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.macroLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.macroValue, { color: colors.text }]}>{Math.round(value)}<Text style={styles.macroUnit}>{unit}</Text></Text>
      <ProgressBar value={value / goal} color={color} />
      <Text style={[styles.macroGoal, { color: colors.textMuted }]}>目标 {goal}{unit} · 供能 {energyShare}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dateNav: { minHeight: 58, borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { fontSize: 14, fontWeight: '900' },
  dateHint: { fontSize: 9.5, marginTop: 3 },
  hero: { padding: 22, borderRadius: 25, flexDirection: 'row', alignItems: 'center' },
  heroLabel: { color: '#D9F1E4', fontSize: 12, fontWeight: '700' },
  heroNumber: { color: '#fff', fontSize: 42, lineHeight: 50, fontWeight: '900', letterSpacing: -1 },
  heroUnit: { fontSize: 14, fontWeight: '700', letterSpacing: 0 },
  heroMeta: { color: '#D9F1E4', fontSize: 11, marginTop: 3 },
  ring: { width: 84, height: 84, borderRadius: 42, borderWidth: 8, borderColor: '#FFFFFF45', backgroundColor: '#FFFFFF18', alignItems: 'center', justifyContent: 'center' },
  ringNumber: { color: '#fff', fontSize: 20, fontWeight: '900' },
  ringLabel: { color: '#D9F1E4', fontSize: 9, marginTop: 2 },
  macroGrid: { flexDirection: 'row', gap: 9 },
  macroCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 13, gap: 7 },
  macroLabel: { fontSize: 11, fontWeight: '700' },
  macroValue: { fontSize: 21, fontWeight: '900' },
  macroUnit: { fontSize: 10, fontWeight: '600' },
  macroGoal: { fontSize: 9 },
  carbHint: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  carbHintIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  carbHintTitle: { fontSize: 12, fontWeight: '900' },
  carbHintText: { fontSize: 10.5, lineHeight: 16, marginTop: 4 },
  goalComparison: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalComparisonIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  goalComparisonTitle: { fontSize: 11.5, fontWeight: '800' },
  goalComparisonText: { fontSize: 9.5, lineHeight: 15, marginTop: 2 },
  recommendTitle: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  recommendIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  recommendEyebrow: { fontSize: 11, fontWeight: '800' },
  recommendBudget: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  recommendText: { fontSize: 13, lineHeight: 20 },
  limit: { fontSize: 11 },
  liverHint: { borderRadius: 13, padding: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  liverHintText: { flex: 1, fontSize: 10.5, lineHeight: 16 },
  miniDivider: { height: StyleSheet.hairlineWidth },
  miniHeadingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  miniHeading: { fontSize: 13, fontWeight: '900' },
  miniSubheading: { fontSize: 9.5, marginTop: 3 },
  miniCount: { fontSize: 10, fontWeight: '800' },
  miniMealList: { gap: 10, paddingRight: 3 },
  miniMealCard: { width: 226, minHeight: 190, borderWidth: 1, borderRadius: 17, padding: 12 },
  miniBadge: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: '800' },
  miniMealName: { fontSize: 13, fontWeight: '900', marginTop: 8 },
  miniMealDescription: { fontSize: 10, lineHeight: 15, marginTop: 5, flex: 1 },
  miniNutrition: { fontSize: 10.5, fontWeight: '800', marginTop: 8 },
  miniAddButton: { minHeight: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  miniAddButtonText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  miniEmpty: { fontSize: 10.5, lineHeight: 16 },
  foodTipsList: { gap: 10, paddingRight: 4 },
  foodTipCard: { width: 270, minHeight: 126, borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  foodTipIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  foodTipName: { fontSize: 14, fontWeight: '900' },
  foodTipPortion: { fontSize: 11, fontWeight: '800', marginTop: 3 },
  foodTipReason: { fontSize: 10.5, lineHeight: 16, marginTop: 5 },
  foodTipsDisclaimer: { fontSize: 10, lineHeight: 15, marginTop: -6 },
  aiCard: { gap: 13 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  aiTitle: { fontSize: 15, fontWeight: '900' },
  aiMeta: { fontSize: 9.5, lineHeight: 14, marginTop: 3 },
  aiHint: { fontSize: 11, lineHeight: 17 },
  aiStatus: { fontSize: 10, fontWeight: '900', marginBottom: 7 },
  aiAnswer: { borderRadius: 14, padding: 13 },
  aiQuestionTitle: { fontSize: 13, fontWeight: '900' },
  aiExamples: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  aiExample: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  aiExampleText: { fontSize: 9.5 },
  aiDisclaimer: { fontSize: 9.5, lineHeight: 15 },
  dailyPlanCard: { gap: 12, borderWidth: 1 },
  historyToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  historyArea: { gap: 9 },
  historyFilter: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  historyItem: { borderWidth: 1, borderRadius: 14, padding: 11 },
  historyItemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  historyKind: { fontSize: 9.5, fontWeight: '900', marginBottom: 4 },
  historyPreview: { fontSize: 11, lineHeight: 17 },
  historyAnswer: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 10 },
  historyQuestion: { fontSize: 11, lineHeight: 17, fontWeight: '800', marginBottom: 7 },
  noRecords: { padding: 30, alignItems: 'center', gap: 6 },
  noRecordTitle: { fontSize: 15, fontWeight: '800' },
  noRecordDetail: { fontSize: 12, textAlign: 'center' },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  recordIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  recordName: { fontSize: 14, fontWeight: '800' },
  recordFoods: { fontSize: 11, marginTop: 3 },
  recordCalories: { fontSize: 12, fontWeight: '800' },
  mealSection: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  mealItems: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 5 },
  mealItemRow: { paddingVertical: 7, gap: 3 },
  mealItemName: { fontSize: 11.5, fontWeight: '800' },
  mealItemNutrition: { fontSize: 9.5, lineHeight: 14 },
});
