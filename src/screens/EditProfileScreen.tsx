import React, { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons as MaterialDesignIcons } from '@expo/vector-icons';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from 'react-native-paper';

import BottomSheet from '../components/BottomSheet';
import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import UserAvatar from '../components/UserAvatar';
import { DateWheelPicker } from '../components/DateTimePicker';
import { useFeedback } from '../components/feedback';
import { CONTENT_CLEARANCE, FLOATING_CLEARANCE } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import { ApiError, removeAvatar, updateProfile, uploadAvatar } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { inputRoundness, inputTheme, palette, radius, spacing } from '../theme';
import { pickAvatar } from '../utils/avatar';
import {
  BIO_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  formatJoinDate,
  genderLabel,
  validateNickname,
} from '../utils/user';

/**
 * 编辑资料（Slice 09）
 *
 * 字段、校验、文案照旧版 `legacy/uniapp/pages/profile/edit.vue` + `edit.js`：
 *   昵称（非空时至少 2 字，上限 20）、头像、个人简介（上限 200）、
 *   性别（男 / 女 / 保密）、生日（YYYY-MM-DD）、地区（上限 50）
 *   底部只读区：用户名 / 邮箱 / 加入时间
 *
 * 与旧版的两处差异：
 *   1. **头像一选就上传**（旧版是等点「保存」才提交）。因为头像是真实文件上传，
 *      不是填个数字，先传完再保存更符合直觉，也避免「保存时附带几十 KB」。
 *   2. 未保存退出用 `usePreventRemove` 拦 —— 连安卓物理返回键一起管住，
 *      旧版只拦了页面里那个返回按钮。
 */

type Navigation = NativeStackNavigationProp<RootStackParamList>;

interface FormState {
  nickname: string;
  bio: string;
  gender: string;
  birthday: string;
  location: string;
}

const GENDER_CHOICES = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: '', label: '保密' },
] as const;

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Navigation>();
  const { confirm, toast } = useFeedback();

  const user = useAuthStore(state => state.user);

  /** 进页面时的快照，用来判断「有没有改动」 */
  const original = useMemo<FormState>(
    () => ({
      nickname: user?.nickname ?? '',
      bio: user?.bio ?? '',
      gender: user?.gender ?? '',
      birthday: user?.birthday ?? '',
      location: user?.location ?? '',
    }),

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [snapshot, setSnapshot] = useState<FormState>(original);
  const [form, setForm] = useState<FormState>(original);

  const [nicknameError, setNicknameError] = useState('');
  const [sheet, setSheet] = useState<'avatar' | 'gender' | null>(null);
  const [birthdayVisible, setBirthdayVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  /** 已成功保存 → 退出时不要再弹「未保存」确认（详见 usePreventRemove 处的注释） */
  const savedRef = useRef(false);

  const hasChanges = useMemo(
    () => (Object.keys(form) as Array<keyof FormState>).some(key => form[key] !== snapshot[key]),
    [form, snapshot],
  );

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {


    savedRef.current = false;
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);


  usePreventRemove(hasChanges, ({ data }) => {

    if (savedRef.current) {
      navigation.dispatch(data.action);
      return;
    }

    void (async () => {
      const ok = await confirm({
        title: '提示',
        message: '您有未保存的修改，确定要退出吗？',
        confirmText: '退出',
        cancelText: '取消',
      });
      if (ok) navigation.dispatch(data.action);
    })();
  });

  /** 选头像 → 本地压缩 → 直接上传 */
  const handlePickAvatar = useCallback(
    async (source: 'library' | 'camera') => {
      setSheet(null);
      if (avatarBusy) return;

      const picked = await pickAvatar(source);
      if (!picked.ok) {
        if (picked.reason !== 'cancelled') {
          toast(picked.message);
        }
        return;
      }

      setAvatarBusy(true);
      try {
        const updated = await uploadAvatar(picked.base64);
        useAuthStore.getState().applyUser(updated);
        toast('头像已更新');
      } catch (error) {
        toast(error instanceof ApiError ? error.message : '头像上传失败，请稍后重试');
      } finally {
        setAvatarBusy(false);
      }
    },
    [avatarBusy, toast],
  );

  const handleResetAvatar = useCallback(async () => {
    setSheet(null);
    if (avatarBusy) return;

    setAvatarBusy(true);
    try {
      const updated = await removeAvatar();
      useAuthStore.getState().applyUser(updated);
      toast('已恢复默认头像');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : '操作失败，请稍后重试');
    } finally {
      setAvatarBusy(false);
    }
  }, [avatarBusy, toast]);

  const handleSave = useCallback(async () => {
    if (!hasChanges || saving) return;

    const nickname = form.nickname.trim();
    const nicknameErrorText = validateNickname(nickname);
    if (nicknameErrorText) {
      setNicknameError(nicknameErrorText);
      return;
    }


    const patch: Record<string, string | null> = {};
    if (form.nickname !== snapshot.nickname) patch.nickname = nickname || null;
    if (form.bio !== snapshot.bio) patch.bio = form.bio.trim() || null;
    if (form.gender !== snapshot.gender) patch.gender = form.gender || null;
    if (form.birthday !== snapshot.birthday) patch.birthday = form.birthday || null;
    if (form.location !== snapshot.location) patch.location = form.location.trim() || null;

    if (Object.keys(patch).length === 0) {
      toast('没有需要保存的修改');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile(patch);
      useAuthStore.getState().applyUser(updated);

      setSnapshot({
        nickname: updated.nickname ?? '',
        bio: updated.bio ?? '',
        gender: updated.gender ?? '',
        birthday: updated.birthday ?? '',
        location: updated.location ?? '',
      });

      savedRef.current = true;
      toast('保存成功');
      goBack();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }, [form, goBack, hasChanges, saving, snapshot, toast]);

  const canSave = hasChanges && !saving;

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {

              paddingTop: insets.top + FLOATING_CLEARANCE,
              paddingBottom: insets.bottom + spacing.xxl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 头像 */}
          <Pressable
            onPress={() => setSheet('avatar')}
            style={styles.avatarBlock}
            disabled={avatarBusy}
          >
            <UserAvatar user={user} size={88} />
            <Text variant="bodySmall" style={styles.avatarHint}>
              {avatarBusy ? '处理中…' : '点击更换头像'}
            </Text>
          </Pressable>

          {/* 昵称 */}
          <View>
            <TextInput
              mode="outlined"
              label="昵称"
              placeholder="请输入昵称"
              value={form.nickname}
              onChangeText={text => {
                setField('nickname', text);
                if (nicknameError) setNicknameError('');
              }}
              onBlur={() => setNicknameError(validateNickname(form.nickname))}
              error={Boolean(nicknameError)}
              theme={inputTheme}
              maxLength={NICKNAME_MAX_LENGTH}
              disabled={saving}
            />
            <View style={styles.fieldMeta}>
              {nicknameError ? (
                <Text variant="bodySmall" style={styles.fieldError}>
                  {nicknameError}
                </Text>
              ) : (
                <View />
              )}
              <Text variant="bodySmall" style={styles.counter}>
                {form.nickname.length}/{NICKNAME_MAX_LENGTH}
              </Text>
            </View>
          </View>

          {/* 个人简介 */}
          <View>
            <TextInput
              mode="outlined"
              label="个人简介"
              placeholder="介绍一下自己吧"
              value={form.bio}
              onChangeText={text => setField('bio', text)}
              theme={inputTheme}
              maxLength={BIO_MAX_LENGTH}
              multiline
              numberOfLines={4}
              style={styles.multiline}
              disabled={saving}
            />
            <View style={styles.fieldMeta}>
              <View />
              <Text variant="bodySmall" style={styles.counter}>
                {form.bio.length}/{BIO_MAX_LENGTH}
              </Text>
            </View>
          </View>

          {/* 性别 */}
          <Pressable
            onPress={() => setSheet('gender')}
            style={styles.selectRow}
            android_ripple={{ color: palette.peachLine20 }}
            disabled={saving}
          >
            <Text variant="bodyMedium" style={styles.selectLabel}>
              性别
            </Text>
            <Text
              variant="bodyMedium"
              style={form.gender ? styles.selectValue : styles.selectPlaceholder}
            >
              {form.gender ? genderLabel(form.gender) : '请选择'}
            </Text>
            <MaterialDesignIcons name="chevron-right" size={20} color={palette.mauveLight} />
          </Pressable>

          {/* 生日 */}
          <Pressable
            onPress={() => setBirthdayVisible(true)}
            style={styles.selectRow}
            android_ripple={{ color: palette.peachLine20 }}
            disabled={saving}
          >
            <Text variant="bodyMedium" style={styles.selectLabel}>
              生日
            </Text>
            <Text
              variant="bodyMedium"
              style={form.birthday ? styles.selectValue : styles.selectPlaceholder}
            >
              {form.birthday || '请选择'}
            </Text>
            <MaterialDesignIcons name="chevron-right" size={20} color={palette.mauveLight} />
          </Pressable>

          {/* 地区 */}
          <TextInput
            mode="outlined"
            label="地区"
            placeholder="请输入所在地区"
            value={form.location}
            onChangeText={text => setField('location', text)}
            theme={inputTheme}
            maxLength={LOCATION_MAX_LENGTH}
            disabled={saving}
          />

          {/* 只读账号信息（旧版 info-section） */}
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.infoLabel}>
                用户名
              </Text>
              <Text variant="bodyMedium" style={styles.infoValue}>
                {user?.username ?? ''}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.infoLabel}>
                邮箱
              </Text>
              <Text variant="bodyMedium" style={styles.infoValue}>
                {user?.email ?? ''}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text variant="bodyMedium" style={styles.infoLabel}>
                加入时间
              </Text>
              <Text variant="bodyMedium" style={styles.infoValue}>
                {formatJoinDate(user?.createdAt)}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <FloatingBar
        left={<FloatingButton icon="close" onPress={goBack} accessibilityLabel="关闭" />}
        right={
          <FloatingButton
            icon="content-save-outline"
            onPress={handleSave}
            disabled={!canSave}
            accessibilityLabel="保存"
          />
        }
      />

      {/* 头像来源选择 */}
      <BottomSheet
        visible={sheet === 'avatar'}
        title="选择头像"
        onDismiss={() => setSheet(null)}
        heightRatio={0.4}
      >
        <View style={styles.sheetList}>
          <SheetOption
            icon="image-multiple-outline"
            label="从相册选择"
            onPress={() => void handlePickAvatar('library')}
          />
          <SheetOption
            icon="camera-outline"
            label="拍照"
            onPress={() => void handlePickAvatar('camera')}
          />
          <SheetOption
            icon="restore"
            label="恢复默认头像"
            onPress={() => void handleResetAvatar()}
          />
        </View>
      </BottomSheet>

      {/* 性别选择 */}
      <BottomSheet
        visible={sheet === 'gender'}
        title="选择性别"
        onDismiss={() => setSheet(null)}
        heightRatio={0.4}
      >
        <View style={styles.sheetList}>
          {GENDER_CHOICES.map(choice => {
            const active = form.gender === choice.value;
            return (
              <Pressable
                key={choice.value || 'secret'}
                onPress={() => {
                  setField('gender', choice.value);
                  setSheet(null);
                }}
                style={styles.sheetOption}
                android_ripple={{ color: palette.peachLine20 }}
              >
                <Text variant="bodyLarge" style={styles.sheetOptionLabel}>
                  {choice.label}
                </Text>
                {active ? (
                  <MaterialDesignIcons name="check" size={20} color={palette.peachDeep} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      <DateWheelPicker
        visible={birthdayVisible}
        value={form.birthday}
        onConfirm={next => {
          setField('birthday', next);
          setBirthdayVisible(false);
        }}
        onDismiss={() => setBirthdayVisible(false)}
      />
    </View>
  );
}

interface SheetOptionProps {
  icon: React.ComponentProps<typeof MaterialDesignIcons>['name'];
  label: string;
  onPress(): void;
}

function SheetOption({ icon, label, onPress }: SheetOptionProps) {
  return (
    <Pressable onPress={onPress} style={styles.sheetOption} android_ripple={{ color: palette.peachLine20 }}>
      <MaterialDesignIcons name={icon} size={22} color={palette.mauve} />
      <Text variant="bodyLarge" style={styles.sheetOptionLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  avatarHint: {
    color: palette.cocoaFaint,
  },
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  fieldMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    marginHorizontal: spacing.sm,
  },
  fieldError: {
    color: palette.danger,
  },
  counter: {
    color: palette.cocoaFaint,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderRadius: inputRoundness,
    borderWidth: 1,

    borderColor: palette.peachLine30,
    backgroundColor: 'transparent',
  },
  selectLabel: {
    flex: 1,
    color: palette.cocoaSoft,
  },
  selectValue: {
    color: palette.cocoa,
  },
  selectPlaceholder: {
    color: palette.cocoaFaint,
  },
  infoSection: {
    borderRadius: radius.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.peachLine20,
    paddingHorizontal: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  infoLabel: {
    color: palette.cocoaSoft,
  },
  infoValue: {
    color: palette.cocoa,
  },
  saveLabel: {
    fontWeight: '700',
  },
  sheetList: {
    paddingTop: spacing.xs,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  sheetOptionLabel: {
    flex: 1,
    color: palette.cocoa,
  },
});
