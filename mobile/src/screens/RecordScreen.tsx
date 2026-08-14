import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppText, Card, Chip, EmptyState, Field, Header, PrimaryButton, Screen, SectionTitle } from '../components/ui';
import { EXERCISES, MEAL_LABELS } from '../data/seed';
import { dateKey, estimateStairClimbingMinutes } from '../lib/calculations';
import { estimateFoodWithAI, generateDailyAISummary } from '../lib/api';
import { buildAIDailyContext } from '../lib/ai';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { AIFoodEstimate, FoodItem, FoodMeasureUnit, FoodServing, MealTemplate, MealType } from '../types';
import { useColors } from '../theme';

type RecordMode = 'food' | 'exercise' | 'body';

function servingAmount(serving: FoodServing) {
  return serving.amount ?? serving.grams ?? 0;
}

function measureLabels(food: FoodItem | null) {
  const isLiquid = food?.nutritionUnit === 'ml';
  return { short: isLiquid ? 'mL' : 'g', long: isLiquid ? '毫升' : '克' };
}

export function RecordScreen() {
  const colors = useColors();
  const app = useApp();
  const [mode, setMode] = useState<RecordMode>('food');
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [query, setQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [customFoodOpen, setCustomFoodOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MealTemplate | null>(null);
  const [foodsExpanded, setFoodsExpanded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const searchY = useRef(0);
  const historyY = useRef(0);

  const moveDate = (days: number) => {
    const date = new Date(`${app.selectedDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    app.setSelectedDate(dateKey(date));
  };

  const filteredFoods = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return app.foods.filter(food => !normalized || food.name.toLowerCase().includes(normalized));
  }, [app.foods, query]);
  const visibleFoods = filteredFoods.slice(0, query.trim() ? 8 : foodsExpanded ? 8 : 4);

  const scrollToHistory = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, historyY.current - 12), animated: true }), 120);
  };

  const revealSearchResults = () => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, searchY.current - 10), animated: true }), 180);
  };

  const confirmAddTemplate = (template: MealTemplate) => {
    Alert.alert(
      `添加“${template.name}”？`,
      `将组合中的 ${template.items.length} 项食物添加到${MEAL_LABELS[mealType]}。同一组合在该餐次只能添加一次。`,
      [
        { text: '取消', style: 'cancel' },
        { text: '确认添加', onPress: async () => {
          try {
            await app.addTemplate(template, mealType);
            scrollToHistory();
          } catch (error) {
            Alert.alert('无法添加', error instanceof Error ? error.message : '请稍后重试');
          }
        } },
      ],
    );
  };

  const confirmDeleteTemplate = (template: MealTemplate) => {
    Alert.alert(
      `删除“${template.name}”？`,
      '组合将从当前账号的常用组合中移除，已经记录的饮食明细不会被删除。',
      [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: () => app.deleteTemplate(template).catch(error => Alert.alert('删除失败', error.message)) },
      ],
    );
  };

  const saveSelectedFood = async (weightG: number, portionLabel?: string | null) => {
    if (!selectedFood || weightG <= 0) return;
    setSaving(true);
    try {
      await app.addMeal(selectedFood, weightG, mealType, portionLabel);
      setSelectedFood(null);
    } finally {
      setSaving(false);
    }
  };

  const updateSelectedServing = async (servingIndex: number, baseAmount: number) => {
    if (!selectedFood?.servings?.[servingIndex]) return;
    const nextServings = selectedFood.servings.map((serving, index) => (
      index === servingIndex ? { label: serving.label, amount: baseAmount } : serving
    ));
    await app.saveFoodServings(selectedFood.id, nextServings);
    setSelectedFood({ ...selectedFood, servings: nextServings });
  };

  return (
    <Screen scrollRef={scrollRef}>
      <Header eyebrow="快速记录" title="今天记录什么？" subtitle="餐次 → 食物 → 份量，三步完成。" />
      <View style={[styles.modeBar, { backgroundColor: colors.surfaceMuted }]}>
        <ModeButton label="饮食" icon="restaurant-outline" selected={mode === 'food'} onPress={() => setMode('food')} />
        <ModeButton label="运动" icon="walk-outline" selected={mode === 'exercise'} onPress={() => setMode('exercise')} />
        <ModeButton label="身体" icon="body-outline" selected={mode === 'body'} onPress={() => setMode('body')} />
      </View>

      <View style={[styles.dateNav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable onPress={() => moveDate(-1)} hitSlop={12}><Ionicons name="chevron-back" size={20} color={colors.text} /></Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.dateText, { color: colors.text }]}>{app.selectedDate === dateKey() ? '今天' : app.selectedDate}</Text>
          <Text style={[styles.dateHint, { color: colors.textMuted }]}>记录日期</Text>
        </View>
        <Pressable disabled={app.selectedDate >= dateKey()} onPress={() => moveDate(1)} hitSlop={12} style={{ opacity: app.selectedDate >= dateKey() ? 0.25 : 1 }}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      {mode === 'food' ? (
        <>
          <View style={styles.chipRow}>
            {(Object.keys(MEAL_LABELS) as MealType[]).map(type => (
              <Chip key={type} label={MEAL_LABELS[type]} selected={mealType === type} onPress={() => setMealType(type)} />
            ))}
          </View>

          <SectionTitle title="常用组合" action={<Text style={{ color: colors.textMuted, fontSize: 10 }}>左右滑动</Text>} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateList}>
            {app.templates.map(template => (
              <Card key={template.id} style={styles.templateCard}>
                <View style={[styles.templateIcon, { backgroundColor: colors.primarySoft }]}><Text style={{ fontSize: 20 }}>🥗</Text></View>
                <Pressable onPress={() => setEditingTemplate(template)} style={{ flex: 1 }} accessibilityLabel={`查看或编辑${template.name}`}>
                  <Text style={[styles.templateName, { color: colors.text }]}>{template.name}</Text>
                  <Text numberOfLines={1} style={[styles.templateDescription, { color: colors.textMuted }]}>{template.description}</Text>
                </Pressable>
                <View style={styles.templateActions}>
                  <Pressable onPress={() => setEditingTemplate(template)} hitSlop={6} style={styles.templateDelete}>
                    <Ionicons name="create-outline" size={17} color={colors.primary} />
                  </Pressable>
                  <Pressable onPress={() => confirmDeleteTemplate(template)} hitSlop={6} style={styles.templateDelete}>
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => confirmAddTemplate(template)} style={[styles.roundAdd, { backgroundColor: colors.primary }]}>
                    <Ionicons name="add" size={21} color="#fff" />
                  </Pressable>
                </View>
              </Card>
            ))}
          </ScrollView>

          <View style={styles.searchSection} onLayout={event => { searchY.current = event.nativeEvent.layout.y; }}>
            <SectionTitle
              title="搜索食物"
              action={<View style={styles.sectionActions}>
                {!query.trim() && filteredFoods.length > 4 ? <Pressable onPress={() => setFoodsExpanded(value => !value)}><Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 11 }}>{foodsExpanded ? '收起' : '显示更多'}</Text></Pressable> : null}
                <Pressable onPress={() => setCustomFoodOpen(true)}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>＋ 自定义</Text></Pressable>
              </View>}
            />
            <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <Field value={query} onChangeText={setQuery} onFocus={revealSearchResults} onPressIn={revealSearchResults} placeholder="米饭、鸡胸肉、苹果…" />
            </View>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {!visibleFoods.length ? <EmptyState icon="🔎" title="没有找到食物" detail="换个关键词，或添加自定义食物。" /> : visibleFoods.map((food, index) => (
                <View key={food.id} style={[styles.foodRow, index < visibleFoods.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.foodName, { color: colors.text }]}>{food.name}{food.ownerId ? <Text style={{ color: colors.primary, fontSize: 9 }}>  自定义</Text> : null}</Text>
                    <Text style={[styles.foodNutrition, { color: colors.textMuted }]}>
                      {food.calories} kcal · 蛋白质 {food.protein}g · 脂肪 {food.fat}g / 100{measureLabels(food).short}
                      {food.servings?.length ? ` · ${food.servings[0].label}≈${servingAmount(food.servings[0])}${measureLabels(food).short}` : ''}
                    </Text>
                  </View>
                  <View style={styles.foodActions}>
                    {food.ownerId ? (
                      <Pressable
                        hitSlop={8}
                        onPress={() => Alert.alert('删除自定义食物？', `“${food.name}”将从食物库移除，既往饮食记录会保留。`, [
                          { text: '取消', style: 'cancel' },
                          { text: '删除', style: 'destructive', onPress: () => app.deleteCustomFood(food.id).catch(error => Alert.alert('删除失败', error.message)) },
                        ])}
                        style={styles.foodDelete}
                      >
                        <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => setSelectedFood(food)} style={[styles.foodAdd, { backgroundColor: colors.primarySoft }]}>
                      <Ionicons name="add" size={20} color={colors.primaryDark} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </Card>
          </View>

          <View onLayout={event => { historyY.current = event.nativeEvent.layout.y; }}>
            <MealHistory mealType={mealType} />
          </View>
        </>
      ) : mode === 'exercise' ? <ExerciseForm /> : <BodyForm />}

      <FoodWeightModal food={selectedFood} onClose={() => setSelectedFood(null)} onSave={saveSelectedFood} onUpdateServing={updateSelectedServing} saving={saving} mealType={mealType} />
      <CustomFoodModal visible={customFoodOpen} onClose={() => setCustomFoodOpen(false)} />
      <TemplateEditorModal template={editingTemplate} onClose={() => setEditingTemplate(null)} />
    </Screen>
  );
}

function TemplateEditorModal({ template, onClose }: { template: MealTemplate | null; onClose: () => void }) {
  const colors = useColors();
  const app = useApp();
  const [name, setName] = useState('');
  const [items, setItems] = useState<MealTemplate['items']>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setItems(Array.from(template.items.reduce((combined, item) => {
      combined.set(item.foodId, (combined.get(item.foodId) ?? 0) + item.weightG);
      return combined;
    }, new Map<string, number>())).map(([foodId, weightG]) => ({ foodId, weightG })));
    setQuery('');
  }, [template]);

  if (!template) return null;
  const availableFoods = app.foods.filter(food => (
    !items.some(item => item.foodId === food.id)
    && (!query.trim() || food.name.toLowerCase().includes(query.trim().toLowerCase()))
  )).slice(0, 6);
  const updateAmount = (foodId: string, value: string) => {
    const amount = Number(value.replace(/[^0-9.]/g, ''));
    setItems(current => current.map(item => item.foodId === foodId ? { ...item, weightG: amount } : item));
  };
  const save = async () => {
    if (!name.trim()) return Alert.alert('请填写组合名称');
    if (!items.length || items.some(item => !Number.isFinite(item.weightG) || item.weightG <= 0)) return Alert.alert('请保留至少一种食物，并填写正确份量');
    setSaving(true);
    try {
      await app.saveTemplateChanges(template, name, items);
      onClose();
      Alert.alert(template.builtIn ? '已保存为我的组合' : '组合已更新', template.builtIn ? '内置组合保持不变，新组合可以继续编辑和复用。' : '下次添加时会使用新的食物与份量。');
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <ScrollView style={[styles.sheet, { backgroundColor: colors.surface }]} contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.sheetTitle, { color: colors.text }]}>{template.builtIn ? '查看内置组合' : '编辑常用组合'}</Text>
        <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>{template.builtIn ? '调整后会另存为你的组合，不会改变系统示例。' : '可改名称、份量，或增删食物；既往记录不会变化。'}</Text>
        <Field label="组合名称" value={name} onChangeText={setName} placeholder="例如：我的简易早餐" />
        <Text style={[styles.customUnitTitle, { color: colors.text }]}>组合内容</Text>
        <View style={[styles.templateEditorList, { borderColor: colors.border }]}>
          {items.map(item => {
            const food = app.foods.find(candidate => candidate.id === item.foodId);
            if (!food) return null;
            const unit = food.nutritionUnit === 'ml' ? 'mL' : 'g';
            return (
              <View key={item.foodId} style={[styles.templateEditorRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.foodName, { color: colors.text }]}>{food.name}</Text>
                  <Text style={[styles.foodNutrition, { color: colors.textMuted }]}>约 {Math.round(food.calories * item.weightG / 100)} kcal</Text>
                </View>
                <View style={[styles.templateAmountWrap, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
                  <Field value={String(item.weightG || '')} onChangeText={value => updateAmount(item.foodId, value)} keyboardType="decimal-pad" suffix={unit} />
                </View>
                <Pressable onPress={() => setItems(current => current.filter(candidate => candidate.foodId !== item.foodId))} hitSlop={8}>
                  <Ionicons name="close-circle-outline" size={21} color={colors.textMuted} />
                </Pressable>
              </View>
            );
          })}
        </View>
        <Field label="添加食物" value={query} onChangeText={setQuery} placeholder="搜索食物名称" />
        {query.trim() ? (
          <View style={[styles.templateSearchResults, { borderColor: colors.border }]}>
            {availableFoods.length ? availableFoods.map(food => (
              <Pressable key={food.id} onPress={() => { setItems(current => [...current, { foodId: food.id, weightG: food.servings?.[0] ? servingAmount(food.servings[0]) : 100 }]); setQuery(''); }} style={[styles.templateSearchRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.foodName, { color: colors.text }]}>{food.name}</Text>
                <Text style={{ color: colors.primary, fontWeight: '900' }}>＋ 添加</Text>
              </Pressable>
            )) : <Text style={[styles.aiEstimateNotice, { color: colors.textMuted }]}>没有可添加的匹配食物。</Text>}
          </View>
        ) : null}
        <PrimaryButton label={template.builtIn ? '另存为我的组合' : '保存修改'} onPress={save} loading={saving} />
      </ScrollView>
    </Modal>
  );
}

function ModeButton({ label, icon, selected, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; selected: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.modeButton, selected && { backgroundColor: colors.surface }]}>
      <Ionicons name={icon} size={17} color={selected ? colors.primary : colors.textMuted} />
      <Text style={{ color: selected ? colors.primary : colors.textMuted, fontWeight: '800', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

function MealHistory({ mealType }: { mealType: MealType }) {
  const colors = useColors();
  const app = useApp();
  const { token } = useAuth();
  const items = app.meals.filter(item => item.mealType === mealType);
  const [aiLoading, setAILoading] = useState(false);
  const saveAsTemplate = async () => {
    try {
      await app.createTemplateFromMeal(mealType, `我的${MEAL_LABELS[mealType]}组合`);
      Alert.alert('已保存', '这个餐次已加入常用组合。');
    } catch (error) {
      Alert.alert('无法保存', error instanceof Error ? error.message : '请稍后再试');
    }
  };
  const completeDinner = () => {
    if (!token || !app.profile) return Alert.alert('请先登录');
    Alert.alert('完成晚餐并生成总结？', '会将今天必要的健康档案、饮食与运动数据发送给 DeepSeek，结果永久保存在服务端。', [
      { text: '取消', style: 'cancel' },
      { text: '同意并生成', onPress: async () => {
        setAILoading(true);
        try {
          const context = buildAIDailyContext({ date: app.selectedDate, profile: app.profile!, summary: app.summary, meals: app.meals, exercises: app.exercises });
          await generateDailyAISummary(token, context);
          Alert.alert('今日总结已生成', '可前往首页的“DeepSeek 营养助手”查看。');
        } catch (error) {
          Alert.alert('无法生成总结', error instanceof Error ? error.message : '请稍后重试');
        } finally {
          setAILoading(false);
        }
      } },
    ]);
  };
  return (
    <>
      <SectionTitle
        title={`${MEAL_LABELS[mealType]}明细`}
        action={items.length ? <Pressable onPress={saveAsTemplate}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>存为组合</Text></Pressable> : undefined}
      />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {!items.length ? <EmptyState icon="✍️" title="这个餐次还未记录" detail="从上方食物库或常用组合添加。" /> : items.map(item => (
          <View key={item.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.foodName, { color: colors.text }]}>{item.foodName} · {item.portionLabel || `${item.weightG}g`}</Text>
              <Text style={[styles.foodNutrition, { color: colors.textMuted }]}>热量 {Math.round(item.calories)} kcal · 蛋白质 {item.protein.toFixed(1)}g</Text>
              <Text style={[styles.foodNutrition, { color: colors.textMuted }]}>脂肪 {item.fat.toFixed(1)}g · 碳水 {item.carb.toFixed(1)}g</Text>
            </View>
            <Pressable onPress={() => Alert.alert('删除这条记录？', `${item.foodName} ${item.portionLabel || `${item.weightG}g`}`, [
              { text: '取消', style: 'cancel' },
              { text: '删除', style: 'destructive', onPress: () => app.deleteMeal(item.id) },
            ])}><Ionicons name="trash-outline" size={18} color={colors.textMuted} /></Pressable>
          </View>
        ))}
      </Card>
      {mealType === 'dinner' && items.length > 0 && app.selectedDate === dateKey() ? (
        <PrimaryButton label="完成晚餐并生成今日总结" onPress={completeDinner} loading={aiLoading} secondary />
      ) : null}
    </>
  );
}

function ExerciseForm() {
  const colors = useColors();
  const app = useApp();
  const [exercise, setExercise] = useState(EXERCISES[0]);
  const [duration, setDuration] = useState('30');
  const [distance, setDistance] = useState('');
  const [floors, setFloors] = useState('7');
  const [stairRepetitions, setStairRepetitions] = useState('1');
  const [saving, setSaving] = useState(false);
  const isStairClimbing = Boolean(exercise.stairMode);
  const stairMinutes = estimateStairClimbingMinutes(Number(floors), Number(stairRepetitions));
  const exerciseMinutes = isStairClimbing ? stairMinutes : Number(duration) || 0;
  const estimated = Math.round(exercise.met * (app.profile?.weightKg ?? 70) * (exerciseMinutes / 60));
  const submit = async () => {
    if (isStairClimbing && (Number(floors) <= 0 || !Number.isInteger(Number(floors)))) {
      return Alert.alert('请填写楼层数', '每次爬楼层数需要填写大于 0 的整数。');
    }
    if (isStairClimbing && (Number(stairRepetitions) <= 0 || !Number.isInteger(Number(stairRepetitions)))) {
      return Alert.alert('请填写次数', '爬楼次数需要填写大于 0 的整数。');
    }
    if (!isStairClimbing && Number(duration) <= 0) return Alert.alert('请填写时长', '运动时长需要大于 0 分钟。');
    setSaving(true);
    try {
      const exerciseName = isStairClimbing
        ? `爬楼梯（${Number(floors)}层×${Number(stairRepetitions)}次）`
        : exercise.name;
      await app.addExercise(exerciseName, exercise.met, exerciseMinutes, isStairClimbing ? undefined : Number(distance) || undefined);
      setDuration('30');
      setDistance('');
      setFloors('7');
      setStairRepetitions('1');
    } finally { setSaving(false); }
  };
  return (
    <>
      <Card style={{ gap: 16 }}>
        <AppText style={styles.formTitle}>运动类型</AppText>
        <View style={styles.chipRow}>
          {EXERCISES.map(item => <Chip key={item.name} label={item.name} selected={exercise.name === item.name} onPress={() => setExercise(item)} small />)}
        </View>
        {isStairClimbing ? (
          <>
            <View style={styles.fieldRow}>
              <Field label="每次爬楼层数" value={floors} onChangeText={setFloors} keyboardType="number-pad" suffix="层" />
              <Field label="爬楼次数" value={stairRepetitions} onChangeText={setStairRepetitions} keyboardType="number-pad" suffix="次" />
            </View>
            <AppText muted style={{ fontSize: 10.5, lineHeight: 17 }}>共 {Math.max(0, Number(floors) || 0) * Math.max(0, Number(stairRepetitions) || 0)} 层，按上楼约 8.8 MET、每层约 0.35 分钟估算为 {stairMinutes} 分钟。实际消耗会随速度、台阶高度和是否负重变化。</AppText>
          </>
        ) : (
          <View style={styles.fieldRow}>
            <Field label="运动时长" value={duration} onChangeText={setDuration} keyboardType="number-pad" suffix="分钟" />
            <Field label="距离（可选）" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" suffix="km" />
          </View>
        )}
        <View style={[styles.estimate, { backgroundColor: colors.primarySoft }]}>
          <Text style={{ color: colors.primaryDark, fontSize: 12, fontWeight: '700' }}>预计消耗</Text>
          <Text style={{ color: colors.primaryDark, fontSize: 22, fontWeight: '900' }}>{estimated} kcal</Text>
        </View>
        <PrimaryButton label="保存运动记录" onPress={submit} loading={saving} />
      </Card>
      <SectionTitle title="当日运动" />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {!app.exercises.length ? <EmptyState icon="🏃" title="今天还没有运动记录" detail="散步也算，把每一次行动都记下来。" /> : app.exercises.map(item => (
          <View key={item.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.foodName, { color: colors.text }]}>{item.exerciseType} · 约 {item.durationMin} 分钟</Text>
              <Text style={[styles.foodNutrition, { color: colors.textMuted }]}>MET {item.met} · 消耗约 {Math.round(item.caloriesBurned)} kcal</Text>
            </View>
            <Pressable onPress={() => Alert.alert('删除运动记录？', item.exerciseType, [
              { text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => app.deleteExercise(item.id) },
            ])}><Ionicons name="trash-outline" size={18} color={colors.textMuted} /></Pressable>
          </View>
        ))}
      </Card>
    </>
  );
}

function BodyForm() {
  const app = useApp();
  const colors = useColors();
  const [weight, setWeight] = useState(app.profile?.weightKg.toString() ?? '');
  const [waist, setWaist] = useState(app.profile?.waistCm.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (Number(weight) <= 0) return Alert.alert('请填写体重');
    setSaving(true);
    try {
      await app.addWeight(Number(weight), Number(waist) || undefined);
      Alert.alert('打卡成功', '今天的身体数据已记录。');
    } finally { setSaving(false); }
  };
  return (
    <>
      <Card style={{ gap: 16 }}>
        <AppText style={styles.formTitle}>身体数据打卡</AppText>
        <View style={styles.fieldRow}>
          <Field label="体重" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix="kg" />
          <Field label="腰围（可选）" value={waist} onChangeText={setWaist} keyboardType="decimal-pad" suffix="cm" />
        </View>
        <AppText muted style={{ fontSize: 11, lineHeight: 17 }}>建议每周固定 2–3 次，在起床如厕后、进食前测量，趋势更有参考价值。</AppText>
        <PrimaryButton label="保存身体数据" onPress={submit} loading={saving} />
      </Card>
      <SectionTitle title="最近记录" />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {!app.weights.length ? <EmptyState icon="⚖️" title="暂无身体记录" detail="第一次打卡后，趋势页就会开始积累数据。" /> : app.weights.slice(0, 8).map(item => (
          <View key={item.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.recordDate, { color: colors.textMuted }]}>{item.recordedDate.slice(5)}</Text>
            <Text style={[styles.bodyValue, { color: colors.text }]}>{item.weightKg.toFixed(1)} kg</Text>
            <Text style={[styles.waistValue, { color: colors.textMuted }]}>{item.waistCm ? `腰围 ${item.waistCm.toFixed(1)} cm` : '未记腰围'}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function FoodWeightModal({ food, onClose, onSave, onUpdateServing, saving, mealType }: {
  food: FoodItem | null;
  onClose: () => void;
  onSave: (weightG: number, portionLabel?: string | null) => void;
  onUpdateServing: (servingIndex: number, baseAmount: number) => Promise<void>;
  saving: boolean;
  mealType: MealType;
}) {
  const colors = useColors();
  const [amount, setAmount] = useState('1');
  const [servingIndex, setServingIndex] = useState(-1);
  const [editingServing, setEditingServing] = useState(false);
  const [servingDraft, setServingDraft] = useState('');
  const [servingSaving, setServingSaving] = useState(false);
  const servings = food?.servings ?? [];
  const serving = servingIndex >= 0 ? servings[servingIndex] : undefined;
  const numericAmount = Number(amount) || 0;
  const labels = measureLabels(food);
  const weightG = serving ? numericAmount * servingAmount(serving) : numericAmount;
  const estimated = food ? Math.round(food.calories * weightG / 100) : 0;

  useEffect(() => {
    if (!food) return;
    const hasServings = Boolean(food.servings?.length);
    setServingIndex(hasServings ? 0 : -1);
    setAmount(hasServings ? '1' : '100');
    setEditingServing(false);
  }, [food?.id]);

  const chooseServing = (index: number) => {
    setServingIndex(index);
    setAmount(index >= 0 ? '1' : '100');
    setEditingServing(false);
  };
  const startServingEdit = () => {
    if (!serving) return;
    setServingDraft(String(servingAmount(serving)));
    setEditingServing(true);
  };
  const saveServingEdit = async () => {
    const nextAmount = Number(servingDraft);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0 || nextAmount > 10000) {
      return Alert.alert('请检查份量', `每${serving?.label ?? '份'}换算需要大于 0 且不超过 10000 ${labels.long}。`);
    }
    setServingSaving(true);
    try {
      await onUpdateServing(servingIndex, nextAmount);
      setEditingServing(false);
      Alert.alert('份量已更新', `以后记录“${food?.name}”时，每${serving?.label}按 ${nextAmount}${labels.short} 计算。`);
    } catch (error) {
      Alert.alert('修改失败', error instanceof Error ? error.message : '请稍后重试');
    } finally { setServingSaving(false); }
  };
  const submit = () => {
    if (weightG <= 0) return Alert.alert('请填写份量', '食用份量需要大于 0。');
    const portionLabel = serving
      ? `${numericAmount}${serving.label}（约${Math.round(weightG)}${labels.short}）`
      : `${numericAmount}${labels.short}`;
    onSave(weightG, portionLabel);
  };
  return (
    <Modal visible={Boolean(food)} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <ScrollView
        style={[styles.sheet, { backgroundColor: colors.surface }]}
        contentContainerStyle={styles.sheetScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.sheetTitle, { color: colors.text }]}>{food?.name}</Text>
        <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>添加到{MEAL_LABELS[mealType]} · 约 {estimated} kcal</Text>
        {servings.length ? (
          <View style={styles.quickWeights}>
            {servings.map((item, index) => (
              <Chip key={`${item.label}-${servingAmount(item)}`} label={`${item.label}（约${servingAmount(item)}${labels.short}）`} selected={servingIndex === index} onPress={() => chooseServing(index)} small />
            ))}
            <Chip label={labels.long} selected={servingIndex === -1} onPress={() => chooseServing(-1)} small />
          </View>
        ) : null}
        <Field label={serving ? `数量（${serving.label}）` : `食用${labels.long}数`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" suffix={serving?.label ?? labels.long} />
        <View style={styles.quickWeights}>
          {(serving ? [0.5, 1, 2, 3] : [50, 100, 150, 200, 250]).map(value => (
            <Chip key={value} label={`${value}${serving?.label ?? labels.short}`} selected={numericAmount === value} onPress={() => setAmount(String(value))} small />
          ))}
        </View>
        {serving ? (
          <View style={styles.conversionRow}>
            <Text style={[styles.conversionHint, { color: colors.textMuted }]}>换算约 {Math.round(weightG)} {labels.long}，营养数据将自动计算</Text>
            <Pressable onPress={startServingEdit} hitSlop={8}>
              <Text style={[styles.editServingLink, { color: colors.primary }]}>调整每{serving.label}换算</Text>
            </Pressable>
          </View>
        ) : null}
        {editingServing && serving ? (
          <View style={[styles.servingEditor, { backgroundColor: colors.surfaceMuted }]}>
            <Text style={[styles.servingEditorTitle, { color: colors.text }]}>我的每{serving.label}实际是多少？</Text>
            <Field label={`每${serving.label}约合`} value={servingDraft} onChangeText={setServingDraft} keyboardType="decimal-pad" suffix={labels.long} />
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}><PrimaryButton label="取消" onPress={() => setEditingServing(false)} secondary compact /></View>
              <View style={{ flex: 1 }}><PrimaryButton label="保存换算" onPress={saveServingEdit} loading={servingSaving} compact /></View>
            </View>
            <Text style={[styles.servingEditorHint, { color: colors.textMuted }]}>仅影响当前账号，并会随云端备份保存。</Text>
          </View>
        ) : null}
        <PrimaryButton label="确认记录" onPress={submit} loading={saving} />
      </ScrollView>
    </Modal>
  );
}

function CustomFoodModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const app = useApp();
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carb, setCarb] = useState('');
  const [nutritionUnit, setNutritionUnit] = useState<FoodMeasureUnit>('g');
  const [unit, setUnit] = useState('');
  const [unitAmount, setUnitAmount] = useState('');
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState<AIFoodEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const unitLabel = nutritionUnit === 'ml' ? '毫升' : '克';
  const submit = async () => {
    if (!name.trim() || Number(calories) <= 0) return Alert.alert(`请填写名称和每 100${nutritionUnit === 'ml' ? 'mL' : 'g'} 热量`);
    if (Boolean(unit.trim()) !== Boolean(Number(unitAmount) > 0)) return Alert.alert('份量信息不完整', `常用单位和每单位${unitLabel}数需要同时填写，或同时留空。`);
    await app.addCustomFood({
      name: name.trim(), calories: Number(calories), protein: Number(protein) || 0,
      fat: Number(fat) || 0, carb: Number(carb) || 0, isCommon: false,
      nutritionUnit,
      servings: unit.trim() ? [{ label: unit.trim(), amount: Number(unitAmount) }] : [],
    });
    setName(''); setCalories(''); setProtein(''); setFat(''); setCarb(''); setNutritionUnit('g'); setUnit(''); setUnitAmount(''); setDescription(''); setEstimate(null); onClose();
  };
  const estimateWithAI = async () => {
    if (!name.trim()) return Alert.alert('请先填写食物名称');
    if (!token) return Alert.alert('请先登录');
    setEstimating(true);
    try {
      const result = await estimateFoodWithAI(token, name.trim(), description.trim());
      const value = result.estimate;
      setEstimate(value);
      setName(value.name || name.trim());
      setNutritionUnit(value.nutritionUnit);
      setCalories(String(value.calories));
      setProtein(String(value.protein));
      setFat(String(value.fat));
      setCarb(String(value.carb));
      setUnit(value.servingLabel || '');
      setUnitAmount(value.servingLabel && value.servingAmount > 0 ? String(value.servingAmount) : '');
    } catch (error) {
      Alert.alert('无法估算', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setEstimating(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <ScrollView
        style={[styles.sheet, { backgroundColor: colors.surface }]}
        contentContainerStyle={styles.sheetScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.sheetTitle, { color: colors.text }]}>添加自定义食物</Text>
        <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>先选择营养标签基准；常见食物请先搜索内置食物库</Text>
        <View style={styles.quickWeights}>
          <Chip label="每100克" selected={nutritionUnit === 'g'} onPress={() => setNutritionUnit('g')} small />
          <Chip label="每100毫升" selected={nutritionUnit === 'ml'} onPress={() => setNutritionUnit('ml')} small />
        </View>
        <Field label="食物名称" value={name} onChangeText={setName} placeholder="例如：自制杂粮饼" />
        <Field label="品牌、包装或烹饪方式（可选）" value={description} onChangeText={setDescription} placeholder="例如：每袋240克、清蒸、无糖" multiline />
        <PrimaryButton label="让 DeepSeek 估算并填入" onPress={estimateWithAI} loading={estimating} secondary />
        {estimate ? (
          <View style={[styles.aiEstimate, { backgroundColor: colors.primarySoft }]}>
            <Text style={[styles.aiEstimateTitle, { color: colors.primaryDark }]}>AI 估算 · 置信度 {estimate.confidence === 'high' ? '高' : estimate.confidence === 'medium' ? '中' : '低'}</Text>
            <Text style={[styles.aiEstimateText, { color: colors.text }]}>{estimate.basis}</Text>
            <Text style={[styles.aiEstimateText, { color: colors.textMuted }]}>{estimate.notice}</Text>
          </View>
        ) : null}
        <View style={styles.fieldRow}><Field label="热量" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" suffix="kcal" /><Field label="蛋白质" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" suffix="g" /></View>
        <View style={styles.fieldRow}><Field label="脂肪" value={fat} onChangeText={setFat} keyboardType="decimal-pad" suffix="g" /><Field label="碳水" value={carb} onChangeText={setCarb} keyboardType="decimal-pad" suffix="g" /></View>
        <Text style={[styles.customUnitTitle, { color: colors.text }]}>常用份量（可选）</Text>
        <View style={styles.quickWeights}>
          {['个', '杯', '片', '小块', '碗', '袋'].map(value => <Chip key={value} label={value} selected={unit === value} onPress={() => setUnit(value)} small />)}
        </View>
        <View style={styles.fieldRow}><Field label="单位" value={unit} onChangeText={setUnit} placeholder="例如：个" /><Field label="每单位约合" value={unitAmount} onChangeText={setUnitAmount} keyboardType="decimal-pad" suffix={unitLabel} /></View>
        <Text style={[styles.aiEstimateNotice, { color: colors.textMuted }]}>AI 只会协助填表，不会自动保存。估算仅供记录参考，请优先以食品包装营养标签为准。</Text>
        <PrimaryButton label="保存食物" onPress={submit} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modeBar: { flexDirection: 'row', padding: 4, borderRadius: 16, gap: 3 },
  modeButton: { flex: 1, minHeight: 43, borderRadius: 13, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center' },
  dateNav: { borderWidth: 1, borderRadius: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  dateText: { fontSize: 14, fontWeight: '800' },
  dateHint: { fontSize: 9, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateCard: { width: 270, padding: 13, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 11 },
  templateList: { gap: 10, paddingRight: 4 },
  templateIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  templateName: { fontSize: 14, fontWeight: '800' },
  templateDescription: { fontSize: 10, marginTop: 3 },
  templateActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  templateDelete: { width: 30, height: 35, alignItems: 'center', justifyContent: 'center' },
  roundAdd: { width: 35, height: 35, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, borderWidth: 1, borderRadius: 17 },
  searchSection: { gap: 12 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  foodRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10 },
  foodName: { fontSize: 13, fontWeight: '800' },
  foodNutrition: { fontSize: 9.5, marginTop: 4 },
  foodAdd: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  foodActions: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  foodDelete: { width: 32, height: 34, alignItems: 'center', justifyContent: 'center' },
  historyRow: { minHeight: 65, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  formTitle: { fontSize: 16, fontWeight: '800' },
  fieldRow: { flexDirection: 'row', gap: 10 },
  estimate: { padding: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recordDate: { fontSize: 11, width: 44 },
  bodyValue: { fontSize: 14, fontWeight: '900', flex: 1 },
  waistValue: { fontSize: 11 },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000066' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetScroll: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 34, gap: 15 },
  handle: { width: 42, height: 5, borderRadius: 99, alignSelf: 'center', marginBottom: 5 },
  sheetTitle: { fontSize: 22, fontWeight: '900' },
  sheetSubtitle: { fontSize: 12, marginTop: -8 },
  quickWeights: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  conversionHint: { fontSize: 11, marginTop: -6 },
  conversionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  editServingLink: { fontSize: 11, fontWeight: '800' },
  servingEditor: { borderRadius: 14, padding: 12, gap: 10 },
  servingEditorTitle: { fontSize: 12, fontWeight: '800' },
  servingEditorHint: { fontSize: 9.5, lineHeight: 14 },
  customUnitTitle: { fontSize: 13, fontWeight: '800', marginBottom: -7 },
  aiEstimate: { borderRadius: 14, padding: 12, gap: 5 },
  aiEstimateTitle: { fontSize: 11, fontWeight: '900' },
  aiEstimateText: { fontSize: 9.5, lineHeight: 15 },
  aiEstimateNotice: { fontSize: 9.5, lineHeight: 15, marginTop: -5 },
  templateEditorList: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  templateEditorRow: { minHeight: 68, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  templateAmountWrap: { width: 116, borderRadius: 13, overflow: 'hidden' },
  templateSearchResults: { borderWidth: 1, borderRadius: 15, overflow: 'hidden', paddingHorizontal: 12 },
  templateSearchRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
});
