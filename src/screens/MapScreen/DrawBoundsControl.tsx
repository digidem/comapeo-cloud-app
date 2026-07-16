import { useIntl } from 'react-intl';

import { mapMessages } from './messages';

interface DrawBoundsControlProps {
  drawMode: 'draw_rectangle' | 'simple_select' | null;
  onDrawModeChange: (mode: 'draw_rectangle' | 'simple_select' | null) => void;
}

export function DrawBoundsControl({
  drawMode,
  onDrawModeChange,
}: DrawBoundsControlProps) {
  const intl = useIntl();
  const isDrawing = drawMode === 'draw_rectangle';

  function handleClick() {
    if (isDrawing) {
      onDrawModeChange?.('simple_select');
    } else {
      onDrawModeChange?.('draw_rectangle');
    }
  }

  return (
    <button
      type="button"
      aria-pressed={isDrawing}
      aria-label={
        isDrawing
          ? intl.formatMessage(mapMessages.cancelDraw)
          : intl.formatMessage(mapMessages.drawBounds)
      }
      onClick={handleClick}
      className={`flex h-11 w-11 items-center justify-center rounded-btn border shadow-card transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        isDrawing
          ? 'border-primary bg-primary text-white hover:bg-primary-hover'
          : 'border-border bg-white text-text hover:bg-surface'
      }`}
      style={{ touchAction: 'manipulation' }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="3"
          y="3"
          width="14"
          height="14"
          rx="2"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray={isDrawing ? undefined : '4 2'}
          fill={isDrawing ? 'currentColor' : 'none'}
          fillOpacity={isDrawing ? '0.2' : undefined}
        />
      </svg>
    </button>
  );
}
