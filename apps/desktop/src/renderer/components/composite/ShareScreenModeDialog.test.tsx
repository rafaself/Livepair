import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ShareScreenModeDialog,
  type ConfiguredScreenContextMode,
} from './ShareScreenModeDialog';

function ShareScreenModeDialogHarness({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [selectedMode, setSelectedMode] = useState<ConfiguredScreenContextMode | null>(null);

  return (
    <ShareScreenModeDialog
      isOpen={true}
      isSaving={false}
      selectedMode={selectedMode}
      onConfirm={onConfirm}
      onCancel={onCancel}
      onSelectMode={setSelectedMode}
    />
  );
}

describe('ShareScreenModeDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <ShareScreenModeDialog
        isOpen={false}
        isSaving={false}
        selectedMode={null}
        onConfirm={vi.fn(async () => undefined)}
        onCancel={vi.fn()}
        onSelectMode={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a compact chooser inside the shared panel dialog shell', async () => {
    const onConfirm = vi.fn(async () => undefined);
    const onCancel = vi.fn();

    render(<ShareScreenModeDialogHarness onConfirm={onConfirm} onCancel={onCancel} />);

    const dialog = screen.getByRole('dialog', {
      name: 'Choose screen share mode',
    });
    const confirmButton = screen.getByRole('button', {
      name: 'Confirm Share Screen mode',
    });
    const cancelButton = screen.getByRole('button', {
      name: 'Cancel Share Screen mode',
    });

    expect(dialog.parentElement).toHaveClass('panel-dialog__frame');
    expect(dialog.parentElement).toHaveClass('share-screen-mode-dialog__frame');
    expect(screen.getByText('Send only when you choose to share.')).toBeVisible();
    expect(
      screen.getByText('Keep your screen updated automatically.'),
    ).toBeVisible();
    expect(confirmButton).toBeDisabled();
    expect(cancelButton).toBeEnabled();

    fireEvent.click(screen.getByRole('radio', { name: /manual/i }));

    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel without confirming when the user cancels', () => {
    const onConfirm = vi.fn(async () => undefined);
    const onCancel = vi.fn();

    render(<ShareScreenModeDialogHarness onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Share Screen mode' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
