import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Checkbox, SegmentedButtons, Text, TextInput } from 'react-native-paper';

import FloatingBar, { FloatingButton } from '../components/FloatingBar';
import LegalSheet from '../components/LegalSheet';
import { useFeedback } from '../components/feedback';
import { COPYRIGHT_TEXT } from '../constants';
import { AGREEMENT_BLOCKS, PRIVACY_BLOCKS } from '../constants/legal';
import { CONTENT_CLEARANCE, FLOATING_CLEARANCE } from '../navigation/layout';
import type { RootStackParamList } from '../navigation/types';
import { ApiError } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { inputTheme, palette, radius, spacing } from '../theme';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_STRENGTH_LABELS,
  USERNAME_MAX_LENGTH,
  calcPasswordStrength,
  canSubmitLogin,
  canSubmitRegister,
  validateConfirmPassword,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../utils/auth';

/**
 * 登录 / 注册（Slice 08）
 *
 * 字段、校验规则、提示文案全部照搬旧版
 * `legacy/uniapp/pages/login/login.js`，不要自己发挥。
 *
 * ## 有意与旧版不同的三处（都有理由）
 *
 * 1. **没有「忘记密码」入口**。旧版那个是**假的** —— 点了只弹
 *    "重置链接已发送"，压根没调任何接口。与其摆个骗人的按钮，不如不做。
 *    等后面接了邮件服务再补（见 Slice 08 的实施记录）。
 *
 * 2. **协议 / 隐私用底部面板，不再做两个独立页面**。旧版那两个页面是
 *    为了绕开 uni 的限制，RN 这边直接用 `LegalSheet`。
 *
 * 3. **输入时会把上一次的字段错误清掉**。旧版只在失焦时校验、输入时不清，
 *    结果用户已经改对了、红字还挂在那。
 */

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

type Tab = 'login' | 'register';

type SheetKind = 'agreement' | 'privacy' | null;

const STRENGTH_COLOR = [
  palette.mauve,
  palette.strengthWeak,
  palette.strengthMedium,
  palette.strengthStrong,
] as const;

interface FieldErrorProps {
  message: string;
}

/** 字段下方的红字错误提示（对应旧版 .input-error） */
function FieldError({ message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <Text variant="bodySmall" style={styles.fieldError}>
      {message}
    </Text>
  );
}

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { toast } = useFeedback();

  const [tab, setTab] = useState<Tab>('login');

  const [account, setAccount] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const [passwordVisible, setPasswordVisible] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);

  const strength = useMemo(() => calcPasswordStrength(registerPassword), [registerPassword]);


  const canLogin = !submitting && canSubmitLogin(account, loginPassword);

  const canRegister =
    !submitting &&
    canSubmitRegister({
      username,
      email,
      password: registerPassword,
      confirmPassword,
      agreed,
    });

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation]);

  /**
   * 切 tab 时清空「被切走的那个表单」。
   *
   * 这是旧版的行为（`login.js` 的 switchTab），照做：
   * 密码这类敏感字段不应该在两个 tab 之间来回带。
   */
  const switchTab = useCallback(
    (next: Tab) => {
      if (next === tab) return;

      if (next === 'login') {
        setUsername('');
        setEmail('');
        setRegisterPassword('');
        setConfirmPassword('');
        setUsernameError('');
        setEmailError('');
        setPasswordError('');
        setConfirmError('');
      } else {
        setAccount('');
        setLoginPassword('');
      }

      setTab(next);
    },
    [tab],
  );

  const handleLogin = useCallback(async () => {
    if (!canLogin) return;

    setSubmitting(true);
    try {
      await useAuthStore.getState().signIn(account.trim(), loginPassword);
      toast('登录成功');
      goBack();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }, [account, canLogin, goBack, loginPassword, toast]);

  const handleRegister = useCallback(async () => {
    if (!canRegister) return;


    const nextUsernameError = validateUsername(username);
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(registerPassword);
    const nextConfirmError = validateConfirmPassword(registerPassword, confirmPassword);

    setUsernameError(nextUsernameError);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);

    if (nextUsernameError || nextEmailError || nextPasswordError || nextConfirmError) {
      return;
    }

    setSubmitting(true);
    try {
      await useAuthStore.getState().signUp(username.trim(), email.trim(), registerPassword);
      toast('注册成功');
      goBack();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : '注册失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }, [canRegister, confirmPassword, email, goBack, registerPassword, toast, username]);

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            styles.contentGrow,
            {

              paddingTop: insets.top + FLOATING_CLEARANCE,
              paddingBottom: insets.bottom + spacing.xxl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text variant="headlineSmall" style={styles.appName}>
            时光日志
          </Text>

          <SegmentedButtons
            value={tab}
            onValueChange={value => switchTab(value as Tab)}
            buttons={[
              { value: 'login', label: '登录' },
              { value: 'register', label: '注册' },
            ]}
            style={styles.tabs}
          />

          {tab === 'login' ? (
            <View style={styles.form}>
              <TextInput
                mode="outlined"
                label="账号"
                placeholder="用户名/邮箱"
                value={account}
                onChangeText={setAccount}
                theme={inputTheme}
                autoCapitalize="none"
                autoCorrect={false}
                disabled={submitting}
              />

              <TextInput
                mode="outlined"
                label="密码"
                placeholder="密码"
                value={loginPassword}
                onChangeText={setLoginPassword}
                secureTextEntry={!passwordVisible}
                right={
                  <TextInput.Icon
                    icon={passwordVisible ? 'eye-off' : 'eye'}
                    onPress={() => setPasswordVisible(visible => !visible)}
                    accessibilityLabel={passwordVisible ? '隐藏密码' : '显示密码'}
                  />
                }
                theme={inputTheme}
                autoCapitalize="none"
                autoCorrect={false}
                disabled={submitting}
              />

              <Button
                mode="contained"
                onPress={handleLogin}
                disabled={!canLogin}
                loading={submitting}
                style={styles.submit}
                contentStyle={styles.submitContent}
              >
                {submitting ? '' : '登录'}
              </Button>
            </View>
          ) : (
            <View style={styles.form}>
              <View>
                <TextInput
                  mode="outlined"
                  label="用户名"
                  placeholder="用户名"
                  value={username}
                  onChangeText={text => {
                    setUsername(text);
                    if (usernameError) setUsernameError('');
                  }}
                  onBlur={() => {
                    setUsernameError(validateUsername(username));
                    setConfirmError(validateConfirmPassword(registerPassword, confirmPassword));
                  }}
                  error={Boolean(usernameError)}
                  theme={inputTheme}
                  maxLength={USERNAME_MAX_LENGTH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  disabled={submitting}
                />
                <FieldError message={usernameError} />
              </View>

              <View>
                <TextInput
                  mode="outlined"
                  label="邮箱"
                  placeholder="邮箱"
                  value={email}
                  onChangeText={text => {
                    setEmail(text);
                    if (emailError) setEmailError('');
                  }}
                  onBlur={() => setEmailError(validateEmail(email))}
                  error={Boolean(emailError)}
                  theme={inputTheme}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  disabled={submitting}
                />
                <FieldError message={emailError} />
              </View>

              <View>
                <TextInput
                  mode="outlined"
                  label="密码"
                  placeholder="密码"
                  value={registerPassword}
                  onChangeText={text => {
                    setRegisterPassword(text);
                    if (passwordError) setPasswordError('');
                  }}
                  onBlur={() => {
                    setPasswordError(validatePassword(registerPassword));
                    setConfirmError(validateConfirmPassword(registerPassword, confirmPassword));
                  }}
                  secureTextEntry={!passwordVisible}
                  right={
                    <TextInput.Icon
                      icon={passwordVisible ? 'eye-off' : 'eye'}
                      onPress={() => setPasswordVisible(visible => !visible)}
                      accessibilityLabel={passwordVisible ? '隐藏密码' : '显示密码'}
                    />
                  }
                  error={Boolean(passwordError)}
                  theme={inputTheme}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  disabled={submitting}
                />
                <FieldError message={passwordError} />

                {/* 密码强度：3 根小条 + 一个档位文字 */}
                {registerPassword ? (
                  <View style={styles.strengthRow}>
                    {[1, 2, 3].map(level => (
                      <View
                        key={level}
                        style={[
                          styles.strengthBar,
                          strength >= level && { backgroundColor: STRENGTH_COLOR[strength] },
                        ]}
                      />
                    ))}
                    <Text
                      variant="bodySmall"
                      style={[styles.strengthText, { color: STRENGTH_COLOR[strength] }]}
                    >
                      {PASSWORD_STRENGTH_LABELS[strength]}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View>
                {/* 确认密码旧版没有眼睛按钮，保持一致 */}
                <TextInput
                  mode="outlined"
                  label="确认密码"
                  placeholder="确认密码"
                  value={confirmPassword}
                  onChangeText={text => {
                    setConfirmPassword(text);
                    if (confirmError) setConfirmError('');
                  }}
                  onBlur={() =>
                    setConfirmError(validateConfirmPassword(registerPassword, confirmPassword))
                  }
                  secureTextEntry
                  error={Boolean(confirmError)}
                  theme={inputTheme}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  disabled={submitting}
                />
                <FieldError message={confirmError} />
              </View>

              <View style={styles.agreeRow}>
                <Checkbox
                  status={agreed ? 'checked' : 'unchecked'}
                  onPress={() => setAgreed(value => !value)}
                  color={palette.peach}
                />
                <View style={styles.agreeTextWrap}>
                  <Text variant="bodySmall" style={styles.agreeText}>
                    我已阅读并同意
                  </Text>
                  <Pressable onPress={() => setSheet('agreement')} hitSlop={6}>
                    <Text variant="bodySmall" style={styles.link}>
                      《用户协议》
                    </Text>
                  </Pressable>
                  <Text variant="bodySmall" style={styles.agreeText}>
                    与
                  </Text>
                  <Pressable onPress={() => setSheet('privacy')} hitSlop={6}>
                    <Text variant="bodySmall" style={styles.link}>
                      《隐私政策》
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Button
                mode="contained"
                onPress={handleRegister}
                disabled={!canRegister}
                loading={submitting}
                style={styles.submit}
                contentStyle={styles.submitContent}
              >
                {submitting ? '' : '注册'}
              </Button>
            </View>
          )}

          <Text variant="bodySmall" style={styles.copyright}>
            {COPYRIGHT_TEXT}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <FloatingBar
        left={<FloatingButton icon="arrow-left" onPress={goBack} accessibilityLabel="返回" />}
      />

      <LegalSheet
        visible={sheet === 'agreement'}
        title="用户协议"
        blocks={AGREEMENT_BLOCKS}
        onDismiss={() => setSheet(null)}
      />
      <LegalSheet
        visible={sheet === 'privacy'}
        title="隐私政策"
        blocks={PRIVACY_BLOCKS}
        onDismiss={() => setSheet(null)}
      />
    </View>
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

  contentGrow: {
    flexGrow: 1,
  },
  copyright: {
    textAlign: 'center',
    color: palette.mauveLight,

    marginTop: 'auto',
    paddingTop: spacing.xl,
  },
  appName: {
    textAlign: 'center',
    color: palette.cocoa,
    fontWeight: '700',
  },
  tabs: {
    alignSelf: 'center',
  },
  form: {
    gap: spacing.md,
  },
  fieldError: {
    color: palette.danger,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginHorizontal: spacing.sm,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: palette.peachLine15,
  },
  strengthText: {
    marginLeft: spacing.xs,
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agreeTextWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  agreeText: {
    color: palette.cocoaSoft,
  },
  link: {
    color: palette.peachDeep,
  },
  submit: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
  },
  submitContent: {
    height: 48,
  },
});
