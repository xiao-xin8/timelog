import AsyncStorage from '@react-native-async-storage/async-storage';



/**
 * 读取并反序列化。读不到、解析失败、或类型不符时返回 fallback。
 */
export async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[storage] 读取 ${key} 失败，使用兜底值`, error);
    return fallback;
  }
}

/**
 * 序列化并写入。
 */
export async function saveJSON<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[storage] 写入 ${key} 失败`, error);
  }
}

/**
 * 读纯字符串（token 之类的非 JSON 值）。
 */
export async function loadString(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.warn(`[storage] 读取 ${key} 失败`, error);
    return null;
  }
}

/**
 * 写纯字符串。
 */
export async function saveString(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    console.warn(`[storage] 写入 ${key} 失败`, error);
  }
}

/**
 * 删除某个键。
 */
export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.warn(`[storage] 删除 ${key} 失败`, error);
  }
}
