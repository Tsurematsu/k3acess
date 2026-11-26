import React from 'react';
import { Box, Text, useWindowSize } from 'ink';
import type { NamespaceInfo } from '../types/k8s.js';
import {
  formatNodeSelectorDisplay,
  formatResourcesSummary,
} from '../utils/validation.js';

export interface DashboardScreenProps {
  namespaces: NamespaceInfo[];
  selectedIndex: number;
  showSystem: boolean;
  hiddenSystemCount: number;
  error: string | null;
}

function fitText(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) {
    return text.padEnd(width);
  }
  if (width === 1) return '…';
  return `${text.slice(0, width - 1)}…`;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  namespaces,
  selectedIndex,
  showSystem,
  hiddenSystemCount,
  error,
}) => {
  const { columns } = useWindowSize();
  const totalWidth = Math.max(88, (columns || 120) - 6);

  const colNs = 22;
  const colState = 14;
  const colAgent = 16;
  const colTools = 16;
  const colRes = 20;
  const colDesc = Math.max(12, totalWidth - (colNs + colState + colAgent + colTools + colRes + 8));

  const selected = namespaces[selectedIndex];

  return (
    <Box flexDirection="column" marginTop={1}>
      {error ? (
        <Box
          borderStyle="single"
          borderColor="red"
          paddingX={1}
          marginBottom={1}
        >
          <Text color="red">✗ Error actualizando namespaces: {error}</Text>
        </Box>
      ) : null}

      <Box
        borderStyle="round"
        borderColor="gray"
        flexDirection="column"
        paddingX={1}
      >
        {/* Cabecera de tabla */}
        <Box>
          <Text bold dimColor>
            {'  '}
            {fitText('NAMESPACE', colNs)}
            {' '}
            {fitText('ESTADO', colState)}
            {' '}
            {fitText('AGENTE', colAgent)}
            {' '}
            {fitText('HERRAMIENTAS', colTools)}
            {' '}
            {fitText('RECURSOS', colRes)}
            {' '}
            {fitText('DESCRIPCIÓN', colDesc)}
          </Text>
        </Box>

        <Box>
          <Text dimColor>{'─'.repeat(Math.min(totalWidth, 160))}</Text>
        </Box>

        {namespaces.length === 0 ? (
          <Box paddingY={1}>
            <Text dimColor>
              No hay namespaces visibles. Pulsa (n) para crear uno o (y) para mostrar los de sistema ({hiddenSystemCount} ocultos).
            </Text>
          </Box>
        ) : (
          namespaces.map((ns, idx) => {
            const isSelected = idx === selectedIndex;
            const nsLabel = ns.isProtected
              ? `${ns.name} [sys]`
              : ns.isManaged
                ? `${ns.name}`
                : ns.name;
            const stateText =
              ns.phase === 'Active' ? '● Active' : `◐ ${ns.phase}`;
            const agentText = formatNodeSelectorDisplay(ns.nodeSelector);
            const toolsText =
              ns.toolLabels.length > 0 ? ns.toolLabels.join(', ') : 'Libre';
            const resText = formatResourcesSummary(ns.resources);
            const descText = ns.description || '-';

            return (
              <Box key={ns.name}>
                <Text
                  color={isSelected ? 'cyan' : undefined}
                  bold={isSelected}
                >
                  {isSelected ? '▸ ' : '  '}
                  {fitText(nsLabel, colNs)}
                </Text>
                <Text> </Text>
                <Text color={ns.phase === 'Active' ? 'green' : 'yellow'}>
                  {fitText(stateText, colState)}
                </Text>
                <Text> </Text>
                <Text color={ns.nodeSelector ? 'cyan' : 'gray'}>
                  {fitText(agentText, colAgent)}
                </Text>
                <Text> </Text>
                <Text
                  color={
                    ns.toolLabels.length > 0
                      ? 'magenta'
                      : ns.isProtected
                        ? 'yellow'
                        : 'green'
                  }
                >
                  {fitText(toolsText, colTools)}
                </Text>
                <Text> </Text>
                <Text color={ns.resources.total > 0 ? 'yellow' : 'gray'}>
                  {fitText(resText, colRes)}
                </Text>
                <Text> </Text>
                <Text dimColor={!isSelected}>
                  {fitText(descText, colDesc)}
                </Text>
              </Box>
            );
          })
        )}

        <Box marginTop={1}>
          <Text dimColor>
            Mostrando {namespaces.length} namespaces
            {!showSystem && hiddenSystemCount > 0
              ? ` (${hiddenSystemCount} de sistema/default ocultos — pulsa "y" para ver)`
              : showSystem
                ? ' (incluyendo sistema y default)'
                : ''}
          </Text>
        </Box>
      </Box>

      {/* Resumen de bloqueo/disponibilidad del namespace seleccionado */}
      {selected ? (
        <Box paddingX={1} marginTop={0}>
          {selected.usage.canMutate ? (
            <Text color="green">
              ● "{selected.name}" está libre — disponible para editar (e) o eliminar (x).
            </Text>
          ) : (
            <Text color="yellow">
              🔒 "{selected.name}" bloqueado para editar/eliminar:{' '}
              {selected.usage.reasons[0]}
            </Text>
          )}
        </Box>
      ) : null}
    </Box>
  );
};
