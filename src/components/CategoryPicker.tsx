import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Divider, IconButton, List, Text, TextInput } from 'react-native-paper';

import BottomSheet from './BottomSheet';
import { useFeedback } from './feedback';
import { CATEGORY_ICONS, CATEGORY_NAME_MAX_LENGTH } from '../constants';
import { useCategoryStore } from '../store/useCategoryStore';
import { dialogButtonStyle, inputTheme, palette, radius, spacing } from '../theme';

/**
 * 分类选择器（底部面板）
 *
 * 面板分两层：主列表用于选分类；「新建分类」会切到第二层表单。
 * 用同一块面板切换内容，而不是再叠一个弹窗出来。
 */

interface Props {
  visible: boolean;
  value: string;
  onSelect(key: string): void;
  onDismiss(): void;
}

export default function CategoryPicker({ visible, value, onSelect, onDismiss }: Props) {
  const { toast, confirm } = useFeedback();
  const all = useCategoryStore(state => state.all);
  const addCategory = useCategoryStore(state => state.addCategory);
  const removeCategory = useCategoryStore(state => state.removeCategory);
  const isRemovable = useCategoryStore(state => state.isRemovable);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(CATEGORY_ICONS[0]);

  const close = () => {
    setCreating(false);
    setName('');
    setIcon(CATEGORY_ICONS[0]);
    onDismiss();
  };

  const submitCreate = async () => {
    const result = await addCategory(name, icon);
    if (!result.ok) {
      toast(result.reason);
      return;
    }
    toast(`已添加「${result.category.name}」`);
    onSelect(result.category.key);
    close();
  };

  const handleDelete = async (key: string, label: string) => {
    const ok = await confirm({
      title: '删除分类',
      message: `确定删除「${label}」？该分类下的事件会自动归到「其他」。`,
      confirmText: '删除',
    });
    if (!ok) return;
    await removeCategory(key);
    toast('已删除');
  };


  if (creating) {
    return (
      <BottomSheet
        visible={visible}
        title="新建分类"
        onDismiss={close}
        heightRatio={0.72}
        footer={
          <View style={styles.footerRow}>
            <Button
              mode="contained"
              onPress={submitCreate}
              style={dialogButtonStyle.button}
              contentStyle={dialogButtonStyle.content}
              labelStyle={dialogButtonStyle.label}
            >
              确定
            </Button>
          </View>
        }
      >
        <View style={styles.form}>
          <TextInput
            mode="outlined"
            label="分类名称"
            value={name}
            onChangeText={setName}
            maxLength={CATEGORY_NAME_MAX_LENGTH}
            theme={inputTheme}
            style={styles.input}
          />
          <Text style={styles.hint}>
            {name.trim().length} / {CATEGORY_NAME_MAX_LENGTH}
          </Text>

          <Text style={styles.sectionLabel}>选择图标</Text>
          <ScrollView contentContainerStyle={styles.iconGrid}>
            {CATEGORY_ICONS.map(item => {
              const active = item === icon;
              return (
                <IconButton
                  key={item}
                  icon={() => <Text style={styles.iconChoice}>{item}</Text>}
                  size={22}
                  style={[styles.iconCell, active && styles.iconCellActive]}
                  onPress={() => setIcon(item)}
                  accessibilityLabel={`选择分类图标 ${item}`}
                />
              );
            })}
          </ScrollView>
        </View>
      </BottomSheet>
    );
  }


  return (
    <BottomSheet
      visible={visible}
      title="选择分类"
      onDismiss={close}
      heightRatio={0.72}
      footer={
        <View style={styles.footerRow}>
          <Button
            icon="plus"
            onPress={() => setCreating(true)}
            textColor={palette.peachDeep}
            style={dialogButtonStyle.button}
            contentStyle={dialogButtonStyle.content}
            labelStyle={dialogButtonStyle.label}
          >
            新建分类
          </Button>
        </View>
      }
    >
      <ScrollView>
        {all.map(item => {
          const selected = item.key === value;
          return (
            <React.Fragment key={item.key}>
              <List.Item
                title={item.name}
                titleStyle={selected ? styles.selectedText : undefined}
                style={[styles.row, selected && styles.rowSelected]}
                left={() => <Text style={styles.itemIcon}>{item.icon}</Text>}
                right={() =>
                  isRemovable(item.key) ? (
                    <IconButton
                      icon="delete-outline"
                      size={22}
                      iconColor={palette.danger}
                      onPress={() => handleDelete(item.key, item.name)}
                      accessibilityLabel={`删除分类 ${item.name}`}
                    />
                  ) : null
                }
                onPress={() => {
                  onSelect(item.key);
                  close();
                }}
              />
              <Divider />
            </React.Fragment>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  row: {
    paddingRight: spacing.sm,
  },
  rowSelected: {
    backgroundColor: palette.peachTint,
  },
  selectedText: {
    color: palette.cocoa,
    fontWeight: '700',
  },
  itemIcon: {
    fontSize: 24,
    lineHeight: 44,
    marginLeft: spacing.lg,
  },
  form: {
    paddingHorizontal: spacing.lg,
    flex: 1,
  },
  input: {
    backgroundColor: '#FFFFFF',
  },
  hint: {
    marginTop: spacing.xs,
    textAlign: 'right',
    color: palette.cocoaFaint,

    fontSize: 11,
  },
  sectionLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    color: palette.cocoaSoft,

    fontSize: 14,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: spacing.md,
  },
  iconCell: {
    margin: 2,
    borderRadius: radius.sm,
  },
  iconCellActive: {
    backgroundColor: palette.peachSoft,
  },
  iconChoice: {
    fontSize: 22,
  },
});
