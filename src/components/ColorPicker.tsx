import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text, TextInput, TouchableRipple } from 'react-native-paper';

import BottomSheet from './BottomSheet';
import { BG_COLOR_OPTIONS, TEXT_COLOR_OPTIONS } from '../constants';
import { dialogButtonStyle, inputTheme, palette, radius, spacing } from '../theme';





function Swatch({
  color,
  active,
  onPress,
  disabled,
  label,
}: {
  color: string;
  active: boolean;
  onPress?(): void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <TouchableRipple
      onPress={disabled ? undefined : onPress}
      style={[styles.swatchWrap, active && styles.swatchWrapActive]}
      borderless
    >
      <View style={[styles.swatch, { backgroundColor: color }]}>
        {label ? (
          <Text style={styles.swatchLabel} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </TouchableRipple>
  );
}

/**
 * 面板底部的操作区
 *
 * 只放「确定」这类有实际动作的按钮——关闭用右上角的叉就够了，
 * 底下再摆一个「取消」是重复的。
 */
function SheetActions({
  onConfirm,
  confirmText = '确定',
}: {
  onConfirm(): void;
  confirmText?: string;
}) {
  return (
    <View style={styles.actions}>
      <Button
        mode="contained"
        onPress={onConfirm}
        style={dialogButtonStyle.button}
        contentStyle={dialogButtonStyle.content}
        labelStyle={dialogButtonStyle.label}
      >
        {confirmText}
      </Button>
    </View>
  );
}



export function TextColorPicker({
  visible,
  value,
  onSelect,
  onDismiss,
}: {
  visible: boolean;
  value: string;
  onSelect(key: string): void;
  onDismiss(): void;
}) {
  return (
    <BottomSheet
      visible={visible}
      title="字体颜色"
      onDismiss={onDismiss}
      heightRatio={0.55}
    >
      <View style={styles.grid}>
        {TEXT_COLOR_OPTIONS.map(option => (
          <View key={option.key} style={styles.gridItem}>
            <Swatch
              color={option.value}
              active={option.key === value}
              onPress={() => {
                onSelect(option.key);
                onDismiss();
              }}
            />
            <Text style={styles.caption} numberOfLines={1}>
              {option.name}
            </Text>
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}



export function BgColorPicker({
  visible,
  value,
  customValue,
  onSelect,
  onPickCustom,
  onDismiss,
}: {
  visible: boolean;
  value: string;
  customValue?: string;
  onSelect(key: string): void;
  onPickCustom(): void;
  onDismiss(): void;
}) {
  return (
    <BottomSheet
      visible={visible}
      title="背景颜色"
      onDismiss={onDismiss}
      heightRatio={0.62}
    >
      <View style={styles.grid}>
        {BG_COLOR_OPTIONS.map(option => {
          const active = option.key === value;


          if (option.type === 'custom') {
            return (
              <View key={option.key} style={styles.gridItem}>
                <Swatch
                  color={customValue ?? '#E0E0E0'}
                  active={active}
                  onPress={onPickCustom}
                />
                <Text style={styles.caption} numberOfLines={1}>
                  {option.name}
                </Text>
              </View>
            );
          }


          if (option.type === 'follow') {
            return (
              <View key={option.key} style={styles.gridItem}>
                <Swatch
                  color={palette.peachSoft}
                  active={active}
                  label="跟随"
                  onPress={() => {
                    onSelect(option.key);
                    onDismiss();
                  }}
                />
                <Text style={styles.caption} numberOfLines={1}>
                  {option.name}
                </Text>
              </View>
            );
          }

          return (
            <View key={option.key} style={styles.gridItem}>
              <Swatch
                color={option.value}
                active={active}
                onPress={() => {
                  onSelect(option.key);
                  onDismiss();
                }}
              />
              <Text style={styles.caption} numberOfLines={1}>
                {option.name}
              </Text>
            </View>
          );
        })}
      </View>
    </BottomSheet>
  );
}



const CUSTOM_PRESETS = [
  '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3',
  '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B',
  '#FFC107', '#FF9800', '#FF5722', '#795548', '#9E9E9E', '#607D8B',
  '#FFFFFF', '#F5F5F5', '#E0E0E0', '#BDBDBD', '#212121', '#000000',
];

const HEX_PATTERN = /^#([0-9A-Fa-f]{6})$/;

export function CustomColorPicker({
  visible,
  value,
  onConfirm,
  onDismiss,
}: {
  visible: boolean;
  value?: string;
  onConfirm(color: string): void;
  onDismiss(): void;
}) {
  const initial = value ?? '#FFFFFF';
  const [draft, setDraft] = useState(initial);
  const [input, setInput] = useState(initial);

  const valid = HEX_PATTERN.test(input.trim());

  const pick = (color: string) => {
    setDraft(color);
    setInput(color);
  };

  return (
    <BottomSheet
      visible={visible}
      title="自定义背景色"
      onDismiss={onDismiss}
      heightRatio={0.68}
      footer={
        <SheetActions onConfirm={() => onConfirm(input.trim().toUpperCase())} />
      }
    >
      <View style={styles.customBody}>
        {/* 预览 */}
        <View style={[styles.preview, { backgroundColor: valid ? input.trim() : draft }]} />

        <TextInput
          mode="outlined"
          label="十六进制（如 #FFB380）"
          value={input}
          onChangeText={setInput}
          autoCapitalize="characters"
          autoCorrect={false}
          theme={inputTheme}
          style={styles.input}
          error={!valid}
        />
        {!valid ? <Text style={styles.errorText}>格式不对，应为 #RRGGBB</Text> : null}

        <View style={styles.grid}>
          {CUSTOM_PRESETS.map(color => (
            <View key={color} style={styles.gridItem}>
              <Swatch
                color={color}
                active={color.toUpperCase() === draft.toUpperCase()}
                onPress={() => pick(color)}
              />
            </View>
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  gridItem: {
    width: '16.66%',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  swatchWrap: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  swatchWrapActive: {
    borderWidth: 2,
    borderColor: palette.peachDeep,
  },
  swatch: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  swatchLabel: {
    fontSize: 11,
    color: palette.cocoa,
    fontWeight: '600',
  },
  caption: {
    marginTop: 2,

    fontSize: 12,
    color: palette.cocoaFaint,
  },
  customBody: {
    paddingHorizontal: spacing.lg,
  },
  preview: {
    height: 56,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.12)',
  },
  input: {
    backgroundColor: '#FFFFFF',
  },
  errorText: {
    marginTop: spacing.xs,
    color: palette.danger,

    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
});
