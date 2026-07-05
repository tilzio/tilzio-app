// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PluginToast from './PluginToast.svelte';
import { pushToast, pushActionToast, toasts, __resetForTests } from '../bridge/toast.svelte';

beforeEach(() => __resetForTests());

describe('PluginToast', () => {
  it('renders active toasts', async () => {
    pushToast('git', 'branch updated');
    const { findByText } = render(PluginToast);
    expect(await findByText('branch updated')).toBeTruthy();
    expect(await findByText('git')).toBeTruthy();
  });

  it('clicking a toast removes it', async () => {
    pushToast('git', 'branch updated');
    const { findByText, container, queryByText } = render(PluginToast);
    await findByText('branch updated');
    await fireEvent.click(container.querySelector('.toast') as HTMLElement);
    expect(toasts.items).toHaveLength(0);
    expect(queryByText('branch updated')).toBeNull();
  });
});

describe('PluginToast — T2 action', () => {
  it('renders the title, body and both buttons', async () => {
    pushActionToast({ title: 'tests · waiting for input', body: 'web › tests', persistent: true,
      actions: [{ label: 'Open pane', primary: true, onAct: () => {} }, { label: 'Later', onAct: () => {} }] });
    const { findByText } = render(PluginToast);
    expect(await findByText('tests · waiting for input')).toBeTruthy();
    expect(await findByText('web › tests')).toBeTruthy();
    expect(await findByText('Open pane')).toBeTruthy();
    expect(await findByText('Later')).toBeTruthy();
  });
  it('clicking the primary button calls onAct', async () => {
    let called = false;
    pushActionToast({ title: 't', persistent: true, actions: [{ label: 'Open pane', primary: true, onAct: () => { called = true; } }] });
    const { findByText } = render(PluginToast);
    await fireEvent.click(await findByText('Open pane'));
    expect(called).toBe(true);
  });
  it('clicking ✕ (aria-label Dismiss) removes the toast', async () => {
    pushActionToast({ title: 't', persistent: true, actions: [] });
    const { findByLabelText } = render(PluginToast);
    await fireEvent.click(await findByLabelText('Dismiss'));
    expect(toasts.items).toHaveLength(0);
  });
  it('plugin toast is still a .toast button (regression)', async () => {
    pushToast('git', 'branch updated');
    const { container, findByText } = render(PluginToast);
    await findByText('branch updated');
    expect(container.querySelector('.toast')).toBeTruthy();
    expect(container.querySelector('.action-toast')).toBeNull();
  });
});
