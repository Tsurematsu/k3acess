import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { NamespaceInfo, NodeAgentInfo } from '../types/k8s.js';

export interface AgentsModalProps {
  agents: NodeAgentInfo[];
  namespaces: NamespaceInfo[];
  onClose: () => void;
}

export const AgentsModal: React.FC<AgentsModalProps> = ({
  agents,
  namespaces,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === 'q' || input.toLowerCase() === 'a') {
      onClose();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(Math.max(0, agents.length - 1), prev + 1));
    }
  });

  const selected = agents[selectedIndex];
  const namespacesWithAffinity = selected
    ? namespaces.filter(
        (ns) => ns.nodeSelector && ns.matchingAgents.includes(selected.name),
      )
    : [];
  const namespacesRunningHere = selected
    ? namespaces.filter((ns) => ns.resources.activeAgents.includes(selected.name))
    : [];

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="cyan">
        Servidor k3s y Agentes conectados ({agents.length})
      </Text>

      <Box flexDirection="column" marginTop={1}>
        {agents.map((agent, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <Box key={agent.name}>
              <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '▸ ' : '  '}
              </Text>
              <Text color={agent.ready ? 'green' : 'red'}>
                {agent.ready ? '● ' : '✗ '}
              </Text>
              <Text bold={isSelected} color={isSelected ? 'cyan' : undefined}>
                {agent.name.padEnd(16)}
              </Text>
              <Text color="yellow">{agent.roles.join(',').padEnd(16)}</Text>
              <Text dimColor>{agent.internalIp.padEnd(16)}</Text>
              <Text dimColor>{agent.version}</Text>
            </Box>
          );
        })}
      </Box>

      {selected ? (
        <Box
          marginTop={1}
          borderStyle="single"
          borderColor="gray"
          flexDirection="column"
          paddingX={1}
        >
          <Text bold>
            Detalle de {selected.name} ({selected.status})
          </Text>
          <Text dimColor>OS: {selected.osImage}</Text>
          <Text>
            <Text dimColor>Selector directo:</Text>{' '}
            <Text color="cyan">kubernetes.io/hostname={selected.name}</Text>
          </Text>
          <Text>
            <Text dimColor>Namespaces con afinidad hacia este nodo:</Text>{' '}
            {namespacesWithAffinity.length > 0
              ? namespacesWithAffinity.map((n) => n.name).join(', ')
              : 'ninguno'}
          </Text>
          <Text>
            <Text dimColor>Namespaces con pods activos aquí:</Text>{' '}
            {namespacesRunningHere.length > 0
              ? namespacesRunningHere.map((n) => n.name).join(', ')
              : 'ninguno'}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>(↑/↓) Seleccionar agente · (Esc / a) Cerrar</Text>
      </Box>
    </Box>
  );
};
