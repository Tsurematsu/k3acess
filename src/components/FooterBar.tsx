import React from 'react';
import { Box, Text } from 'ink';

export interface FooterShortcut {
  key: string;
  label: string;
  color?: string;
}

export interface FooterBarProps {
  shortcuts: FooterShortcut[];
  statusMessage?: { type: 'info' | 'success' | 'error'; text: string } | null;
}

export const FooterBar: React.FC<FooterBarProps> = ({
  shortcuts,
  statusMessage,
}) => {
  return (
    <Box flexDirection="column" marginTop={1}>
      {statusMessage ? (
        <Box paddingX={1} marginBottom={0}>
          <Text
            color={
              statusMessage.type === 'error'
                ? 'red'
                : statusMessage.type === 'success'
                  ? 'green'
                  : 'cyan'
            }
          >
            {statusMessage.type === 'error'
              ? '✗ '
              : statusMessage.type === 'success'
                ? '✓ '
                : 'ℹ '}
            {statusMessage.text}
          </Text>
        </Box>
      ) : null}

      <Box borderStyle="single" borderColor="gray" paddingX={1} flexWrap="wrap">
        {shortcuts.map((item, idx) => (
          <Box key={`${item.key}-${item.label}`} marginRight={2}>
            <Text bold color={item.color ?? 'cyan'}>
              ({item.key})
            </Text>
            <Text> {item.label}</Text>
            {idx < shortcuts.length - 1 ? <Text dimColor> </Text> : null}
          </Box>
        ))}
      </Box>
    </Box>
  );
};
