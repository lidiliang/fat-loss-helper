import * as SecureStore from 'expo-secure-store';
import { UserProfile } from '../types';

function cacheKey(ownerId: string) {
  return `qingzhi.profile.${ownerId}`;
}

export async function loadCachedProfile(ownerId: string): Promise<UserProfile | null> {
  const raw = await SecureStore.getItemAsync(cacheKey(ownerId));
  if (!raw) return null;
  try {
    const profile = JSON.parse(raw) as UserProfile;
    return profile.ownerId === ownerId ? profile : null;
  } catch {
    return null;
  }
}

export async function cacheProfile(profile: UserProfile) {
  await SecureStore.setItemAsync(cacheKey(profile.ownerId), JSON.stringify(profile));
}
