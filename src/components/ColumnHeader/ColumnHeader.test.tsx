import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColumnHeader } from './ColumnHeader';
import type { Column, Account } from '../../types';

const mockAccount: Account = {
  id: 'acc-1',
  label: 'テストアカウント',
  dataDirectory: '/path/to/data',
  color: '#1d9bf0',
  createdAt: '2026-05-02T00:00:00Z',
};

const mockColumn: Column = {
  id: 'col-1',
  accountId: 'acc-1',
  pageType: 'home',
  homeTabName: 'フォロー中',
  width: 350,
  order: 0,
  settings: {
    autoReloadEnabled: true,
    autoReloadInterval: 60,
    areaRemoveEnabled: true,
    customCSS: '',
  },
};

describe('ColumnHeader', () => {
  it('アカウント名を表示する', () => {
    render(
      <ColumnHeader
        column={mockColumn}
        account={mockAccount}
        onReload={vi.fn()}
        onSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('テストアカウント - フォロー中')).toBeInTheDocument();
  });

  it('閉じるボタンクリックでonCloseが呼ばれる', () => {
    const onClose = vi.fn();
    render(
      <ColumnHeader
        column={mockColumn}
        account={mockAccount}
        onReload={vi.fn()}
        onSettings={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByLabelText('カラムを閉じる'));
    expect(onClose).toHaveBeenCalledWith('col-1');
  });

  it('更新ボタンクリックでonReloadが呼ばれる', () => {
    const onReload = vi.fn();
    render(
      <ColumnHeader
        column={mockColumn}
        account={mockAccount}
        onReload={onReload}
        onSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText('更新'));
    expect(onReload).toHaveBeenCalledWith('col-1');
  });
});
