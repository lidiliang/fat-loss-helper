import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppText, Card, Chip, EmptyState, Field, Header, PrimaryButton, Screen, SectionTitle } from '../components/ui';
import { EXERCISES, MEAL_LABELS } from '../data/seed';
import { dateKey } from '../lib/calculations';
import { useApp } from '../context/AppContext';
import { FoodItem, MealType } from '../types';
import { useColors } from '../theme';

type RecordMode = 'food' | 'exercise' | 'body';

export function RecordScreen() {
  const colors = useColors();
  const app = useApp();
  const [mode, setMode] = useState<RecordMode>('food');
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [query, setQuery] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [weightG, setWeightG] = useState('100');
  const [saving, setSaving] = useState(false);
  const [customFoodOpen, setCustomFoodOpen] = useState(false);

  const moveDate = (days: number) => {
    const date = new Date(`${app.selectedDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    app.setSelectedDate(dateKey(date));
  };

  const filteredFoods = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return app.foods.filter(food => !normalized || food.name.toLowerCase().includes(normalized)).slice(0, 18);
  }, [app.foods, query]);

  const saveSelectedFood = async () => {
    if (!selectedFood || Number(weightG) <= 0) return;
    setSaving(true);
    try {
      await app.addMeal(selectedFood, Number(weightG), mealType);
      setSelectedFood(null);
      setWeightG('100');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Header eyebrow="快速记录" title="今天记录什么？" subtitle="餐次 → 食物 → 克数，三步完成。" />
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

          <SectionTitle title="常用组合" />
          <View style={{ gap: 10 }}>
            {app.templates.slice(0, 4).map(template => (
              <Card key={template.id} style={styles.templateCard}>
                <View style={[styles.templateIcon, { backgroundColor: colors.primarySoft }]}><Text style={{ fontSize: 20 }}>🥗</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.templateName, { color: colors.text }]}>{template.name}</Text>
                  <Text numberOfLines={1} style={[styles.templateDescription, { color: colors.textMuted }]}>{template.description}</Text>
                </View>
                <Pressable
                  onPress={() => app.addTemplate(template, mealType).catch(error => Alert.alert('添加失败', error.message))}
                  style={[styles.roundAdd, { backgroundColor: colors.primary }]}
                >
                  <Ionicons name="add" size={21} color="#fff" />
                </Pressable>
              </Card>
            ))}
          </View>

          <SectionTitle
            title="搜索食物"
            action={<Pressable onPress={() => setCustomFoodOpen(true)}><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>＋ 自定义</Text></Pressable>}
          />
          <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <Field value={query} onChangeText={setQuery} placeholder="米饭、鸡胸肉、苹果…" />
          </View>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {filteredFoods.map((food, index) => (
              <View key={food.id} style={[styles.foodRow, index < filteredFoods.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.foodName, { color: colors.text }]}>{food.name}{food.ownerId ? <Text style={{ color: colors.primary, fontSize: 9 }}>  自定义</Text> : null}</Text>
                  <Text style={[styles.foodNutrition, { color: colors.textMuted }]}>{food.calories} kcal · 蛋白质 {food.protein}g · 脂肪 {food.fat}g / 100g</Text>
                </View>
                <Pressable onPress={() => setSelectedFood(food)} style={[styles.foodAdd, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name="add" size={20} color={colors.primaryDark} />
                </Pressable>
              </View>
            ))}
          </Card>

          <MealHistory mealType={mealType} />
        </>
      ) : mode === 'exercise' ? <ExerciseForm /> : <BodyForm />}

      <FoodWeightModal food={selectedFood} weight={weightG} setWeight={setWeightG} onClose={() => setSelectedFood(null)} onSave={saveSelectedFood} saving={saving} mealType={mealType} />
      <CustomFoodModal visible={customFoodOpen} onClose={() => setCustomFoodOpen(false)} />
    </Screen>
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
  const items = app.meals.filter(item => item.mealType === mealType);
  const saveAsTemplate = async () => {
    try {
      await app.createTemplateFromMeal(mealType, `我的${MEAL_LABELS[mealType]}组合`);
      Alert.alert('已保存', '这个餐次已加入常用组合。');
    } catch (error) {
      Alert.alert('无法保存', error instanceof Error ? error.message : '请稍后再试');
    }
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
              <Text style={[styles.foodName, { color: colors.text }]}>{item.foodName} · {item.weightG}g</Text>
              <Text style={[styles.foodNutrition, { color: colors.textMuted }]}>{Math.round(item.calories)} kcal · 蛋白质 {item.protein.toFixed(1)}g</Text>
            </View>
            <Pressable onPress={() => Alert.alert('删除这条记录？', `${item.foodName} ${item.weightG}g`, [
              { text: '取消', style: 'cancel' },
              { text: '删除', style: 'destructive', onPress: () => app.deleteMeal(item.id) },
            ])}><Ionicons name="trash-outline" size={18} color={colors.textMuted} /></Pressable>
          </View>
        ))}
      </Card>
    </>
  );
}

function ExerciseForm() {
  const colors = useColors();
  const app = useApp();
  const [exercise, setExercise] = useState(EXERCISES[0]);
  const [duration, setDuration] = useState('30');
  const [distance, setDistance] = useState('');
  const [saving, setSaving] = useState(false);
  const estimated = Math.round(exercise.met * (app.profile?.weightKg ?? 70) * (Number(duration) / 60 || 0));
  const submit = async () => {
    if (Number(duration) <= 0) return Alert.alert('请填写时长', '运动时长需要大于 0 分钟。');
    setSaving(true);
    try {
      await app.addExercise(exercise.name, exercise.met, Number(duration), Number(distance) || undefined);
      setDuration('30');
      setDistance('');
    } finally { setSaving(false); }
  };
  return (
    <>
      <Card style={{ gap: 16 }}>
        <AppText style={styles.formTitle}>运动类型</AppText>
        <View style={styles.chipRow}>
          {EXERCISES.map(item => <Chip key={item.name} label={item.name} selected={exercise.name === item.name} onPress={() => setExercise(item)} small />)}
        </View>
        <View style={styles.fieldRow}>
          <Field label="运动时长" value={duration} onChangeText={setDuration} keyboardType="number-pad" suffix="分钟" />
          <Field label="距离（可选）" value={distance} onChangeText={setDistance} keyboardType="decimal-pad" suffix="km" />
        </View>
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
              <Text style={[styles.foodName, { color: colors.text }]}>{item.exerciseType} · {item.durationMin} 分钟</Text>
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

function FoodWeightModal({ food, weight, setWeight, onClose, onSave, saving, mealType }: {
  food: FoodItem | null; weight: string; setWeight: (value: string) => void; onClose: () => void; onSave: () => void; saving: boolean; mealType: MealType;
}) {
  const colors = useColors();
  const estimated = food ? Math.round(food.calories * (Number(weight) || 0) / 100) : 0;
  return (
    <Modal visible={Boolean(food)} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.sheetTitle, { color: colors.text }]}>{food?.name}</Text>
        <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>添加到{MEAL_LABELS[mealType]} · 约 {estimated} kcal</Text>
        <Field label="食用重量" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" suffix="克" />
        <View style={styles.quickWeights}>
          {[50, 100, 150, 200, 250].map(value => <Chip key={value} label={`${value}g`} selected={Number(weight) === value} onPress={() => setWeight(String(value))} small />)}
        </View>
        <PrimaryButton label="确认记录" onPress={onSave} loading={saving} />
      </View>
    </Modal>
  );
}

function CustomFoodModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const app = useApp();
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [carb, setCarb] = useState('');
  const submit = async () => {
    if (!name.trim() || Number(calories) <= 0) return Alert.alert('请填写名称和每 100g 热量');
    await app.addCustomFood({ name: name.trim(), calories: Number(calories), protein: Number(protein) || 0, fat: Number(fat) || 0, carb: Number(carb) || 0, isCommon: false });
    setName(''); setCalories(''); setProtein(''); setFat(''); setCarb(''); onClose();
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[styles.sheetTitle, { color: colors.text }]}>添加自定义食物</Text>
        <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>营养数据均按每 100 克填写</Text>
        <Field label="食物名称" value={name} onChangeText={setName} placeholder="例如：自制杂粮饼" />
        <View style={styles.fieldRow}><Field label="热量" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" suffix="kcal" /><Field label="蛋白质" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" suffix="g" /></View>
        <View style={styles.fieldRow}><Field label="脂肪" value={fat} onChangeText={setFat} keyboardType="decimal-pad" suffix="g" /><Field label="碳水" value={carb} onChangeText={setCarb} keyboardType="decimal-pad" suffix="g" /></View>
        <PrimaryButton label="保存食物" onPress={submit} />
      </View>
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
  templateCard: { padding: 13, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 11 },
  templateIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  templateName: { fontSize: 14, fontWeight: '800' },
  templateDescription: { fontSize: 10, marginTop: 3 },
  roundAdd: { width: 35, height: 35, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, borderWidth: 1, borderRadius: 17 },
  foodRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10 },
  foodName: { fontSize: 13, fontWeight: '800' },
  foodNutrition: { fontSize: 9.5, marginTop: 4 },
  foodAdd: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  historyRow: { minHeight: 65, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  formTitle: { fontSize: 16, fontWeight: '800' },
  fieldRow: { flexDirection: 'row', gap: 10 },
  estimate: { padding: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recordDate: { fontSize: 11, width: 44 },
  bodyValue: { fontSize: 14, fontWeight: '900', flex: 1 },
  waistValue: { fontSize: 11 },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#00000066' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 34, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 15 },
  handle: { width: 42, height: 5, borderRadius: 99, alignSelf: 'center', marginBottom: 5 },
  sheetTitle: { fontSize: 22, fontWeight: '900' },
  sheetSubtitle: { fontSize: 12, marginTop: -8 },
  quickWeights: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
});
