import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Field, PrimaryButton } from '../components/ui';
import { useColors } from '../theme';

export function AuthScreen() {
  const colors = useColors();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (mode === 'register' && name.trim().length < 2) return setError('请输入至少 2 个字的昵称');
    if (!email.includes('@')) return setError('请输入有效的邮箱地址');
    if (password.length < 8) return setError('密码至少需要 8 位');
    setLoading(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name.trim(), email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.logo, { backgroundColor: colors.primary }]}>
            <Text style={styles.logoText}>轻</Text>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={[styles.brand, { color: colors.text }]}>轻脂管家</Text>
            <Text style={[styles.slogan, { color: colors.textMuted }]}>吃得明白，动得安心。每一天都向轻盈靠近。</Text>
          </View>

          <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.modeBar, { backgroundColor: colors.surfaceMuted }]}>
              {(['login', 'register'] as const).map(item => (
                <Text
                  key={item}
                  onPress={() => { setMode(item); setError(''); }}
                  style={[
                    styles.mode,
                    { color: item === mode ? colors.primary : colors.textMuted },
                    item === mode && { backgroundColor: colors.surface },
                  ]}
                >
                  {item === 'login' ? '登录' : '创建账号'}
                </Text>
              ))}
            </View>
            {mode === 'register' ? <Field label="昵称" value={name} onChangeText={setName} placeholder="怎么称呼你" /> : null}
            <Field label="邮箱" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" />
            <Field label="密码" value={password} onChangeText={setPassword} placeholder="至少 8 位" secureTextEntry />
            {error ? <Text style={[styles.error, { color: colors.red, backgroundColor: `${colors.red}12` }]}>{error}</Text> : null}
            <PrimaryButton label={mode === 'login' ? '登录' : '注册并开始'} onPress={submit} loading={loading} />
            <Text style={[styles.privacy, { color: colors.textMuted }]}>登录后仍可离线记录；数据按账号隔离，并定期同步到你配置的备份服务。正式部署请使用 HTTPS。</Text>
          </View>

          <Text style={[styles.server, { color: colors.textMuted }]}>当前服务：{API_URL}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, padding: 28, justifyContent: 'center', gap: 22 },
  logo: { width: 64, height: 64, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 31, fontWeight: '900' },
  brand: { fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  slogan: { fontSize: 15, lineHeight: 23, maxWidth: 310 },
  panel: { borderWidth: 1, borderRadius: 26, padding: 20, gap: 16 },
  modeBar: { flexDirection: 'row', padding: 4, borderRadius: 14 },
  mode: { flex: 1, textAlign: 'center', paddingVertical: 10, borderRadius: 11, fontWeight: '800', overflow: 'hidden' },
  error: { padding: 12, borderRadius: 12, fontSize: 13, lineHeight: 18 },
  privacy: { fontSize: 11, textAlign: 'center', lineHeight: 17 },
  server: { fontSize: 10, textAlign: 'center' },
});
