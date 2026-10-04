import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { avatarColor, avatarLetter, avatarUri, type AvatarUser } from '../utils/avatar';

/**
 * 用户头像
 *
 * 两种形态：
 *   - 有自定义头像 → 显示 `avatarPath` 指向的图片
 *   - 没有 → 照旧版的做法画「**背景色圆块 + 首字母**」
 *
 * 颜色按用户 id 稳定选取（同一个人每次颜色一致），
 * 所以预设头像那 40 张图已经不需要了。
 */

interface Props {
  /** 只要 id / username / nickname / avatarPath 四个字段（见 `AvatarUser`） */
  user: AvatarUser | null | undefined;
  /** 直径（dp） */
  size: number;
}

export default function UserAvatar({ user, size }: Props) {
  const uri = avatarUri(user);
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}

        accessibilityLabel="头像"
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: avatarColor(user?.id ?? user?.username),
        },
      ]}
      accessibilityLabel="默认头像"
    >
      <Text style={[styles.letter, { fontSize: Math.round(size * 0.42) }]}>
        {avatarLetter(user)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
