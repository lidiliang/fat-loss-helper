import * as SecureStore from 'expo-secure-store';

const MODEL_KEY = 'qingzhi.ai.model';

export async function getAIModelOverride(): Promise<string> {
  return (await SecureStore.getItemAsync(MODEL_KEY)) || '';
}

export async function saveAIModelOverride(value: string): Promise<void> {
  const model = value.trim();
  if (model.length > 120 || (model && !/^[\x21-\x7e]+$/.test(model))) {
    throw new Error('模型名称最多120个字符，只能包含英文、数字和符号，不能包含空白');
  }
  if (model) await SecureStore.setItemAsync(MODEL_KEY, model);
  else await SecureStore.deleteItemAsync(MODEL_KEY);
}
