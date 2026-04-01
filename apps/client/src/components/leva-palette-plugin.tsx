import { createPlugin, styled, useInputContext } from 'leva/plugin';

import type { LevaInputProps } from 'leva/plugin';

type PaletteColor = {
  hex: string;
  label: string;
};

type PaletteSettings = {
  colors: PaletteColor[];
};

type PaletteInput = {
  colors: PaletteColor[];
  selected: string;
};

const AUTO_VALUE = 'auto';

const PaletteRow = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: '$colGap'
});

const PaletteLabel = styled('label', {
  fontFamily: '$mono',
  fontSize: '$root',
  color: '$highlight1',
  userSelect: 'none',
  flexShrink: 0,
  width: '$$labelWidth',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
});

const SwatchContainer = styled('div', {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 3
});

const Swatch = styled('button', {
  $$size: '18px',
  border: '2px solid transparent',
  borderRadius: '$sm',
  cursor: 'pointer',
  height: '$$size',
  outline: 'none',
  padding: 0,
  width: '$$size',
  '&:hover': {
    opacity: 0.85
  },
  variants: {
    selected: {
      true: {
        border: '2px solid $accent1',
        boxShadow: '0 0 0 1px $colors$accent2'
      }
    }
  }
});

const AutoSwatch = styled('button', {
  $$size: '18px',
  borderRadius: '$sm',
  color: '$highlight3',
  cursor: 'pointer',
  fontSize: 9,
  fontWeight: 600,
  height: '$$size',
  lineHeight: '14px',
  padding: '0 5px',
  textTransform: 'uppercase',
  border: '2px solid transparent',
  background: '$elevation3',
  '&:hover': {
    opacity: 0.85
  },
  variants: {
    selected: {
      true: {
        background: '$accent2',
        border: '2px solid $accent1'
      }
    }
  }
});

const PaletteComponent = () => {
  const { label, onUpdate, settings, value } =
    useInputContext<LevaInputProps<string, PaletteSettings>>();
  const colors = settings?.colors ?? [];

  return (
    <PaletteRow>
      <PaletteLabel>{label}</PaletteLabel>
      <SwatchContainer>
        <AutoSwatch
          onClick={() => onUpdate(AUTO_VALUE)}
          selected={value === AUTO_VALUE}
          title="Auto"
          type="button"
        >
          A
        </AutoSwatch>
        {colors.map((color, index) => {
          const colorValue = String(index);

          return (
            <Swatch
              key={color.label}
              onClick={() => onUpdate(colorValue)}
              selected={value === colorValue}
              style={{ background: color.hex }}
              title={color.label}
              type="button"
            />
          );
        })}
      </SwatchContainer>
    </PaletteRow>
  );
};

export const palette = createPlugin<PaletteInput, string, PaletteSettings>({
  component: PaletteComponent,
  normalize: ({ colors, selected }) => ({
    settings: { colors },
    value: selected ?? AUTO_VALUE
  }),
  sanitize: (value: unknown) => String(value)
});
