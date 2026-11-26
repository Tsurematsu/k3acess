import React from 'react';
import { Box, Spacer, Text } from 'ink';
import type { NodeAgentInfo } from '../types/k8s.js';

export interface HeaderProps {
  context: string;
  clusterVersion: string;
  kubectlVersion: string;
  agents: NodeAgentInfo[];
  hasCnpgCrd: boolean;
  lastSync: Date | null;
  refreshing: boolean;
}

function formatTime(date: Date | null): string {
  if (!date) return '--:--:--';
  return date.toLocaleTimeString('es-ES', { hour12: false });
}

export const Header: React.FC<HeaderProps> = ({
  context,
  clusterVersion,
  kubectlVersion,
  agents,
  hasCnpgCrd,
  lastSync,
  refreshing,
}) => {
  const readyCount = agents.filter((a) => a.ready).length;
  const allReady = agents.length > 0 && readyCount === agents.length;

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      flexDirection="column"
    >
      <Box>
        <Text bold color="cyan">
          k3access
        </Text>
        <Text dimColor> · Gestor de Namespaces (contrato tsure.io/*)</Text>
        <Spacer />
        <Text color={refreshing ? 'yellow' : 'gray'}>
          {refreshing ? '⟳ sincronizando...' : `sync ${formatTime(lastSync)}`}
        </Text>
      </Box>
      <Box>
        <Text>
          <Text dimColor>Contexto:</Text>{' '}
          <Text bold color="green">
            {context}
          </Text>
        </Text>
        <Text dimColor> │ </Text>
        <Text>
          <Text dimColor>k3s:</Text> <Text>{clusterVersion}</Text>
        </Text>
        <Text dimColor> │ </Text>
        <Text>
          <Text dimColor>kubectl:</Text> <Text>{kubectlVersion}</Text>
        </Text>
        <Text dimColor> │ </Text>
        <Text>
          <Text dimColor>Agentes:</Text>{' '}
          <Text color={allReady ? 'green' : 'yellow'} bold>
            {readyCount}/{agents.length} Ready
          </Text>
        </Text>
        <Text dimColor> │ </Text>
        <Text color={hasCnpgCrd ? 'magenta' : 'gray'}>
          {hasCnpgCrd ? 'CNPG: activo' : 'CNPG: n/d'}
        </Text>
      </Box>
    </Box>
  );
};
