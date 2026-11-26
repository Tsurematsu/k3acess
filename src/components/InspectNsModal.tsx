import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { NamespaceInfo, NodeAgentInfo } from '../types/k8s.js';
import { inspectNamespaceLive } from '../services/namespaces.js';
import {
  formatNodeSelectorDisplay,
  formatResourcesSummary,
} from '../utils/validation.js';

export interface InspectNsModalProps {
  namespace: NamespaceInfo;
  agents: NodeAgentInfo[];
  hasCnpgCrd: boolean;
  onClose: () => void;
}

const MAX_VISIBLE_RESOURCES = 8;

export const InspectNsModal: React.FC<InspectNsModalProps> = ({
  namespace,
  agents,
  hasCnpgCrd,
  onClose,
}) => {
  const [live, setLive] = useState<NamespaceInfo>(namespace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    inspectNamespaceLive(namespace.name, agents, hasCnpgCrd)
      .then((fresh) => {
        if (!active) return;
        setLive(fresh);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [namespace.name, agents, hasCnpgCrd]);

  const maxOffset = Math.max(0, live.resources.items.length - MAX_VISIBLE_RESOURCES);

  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === 'q' || input.toLowerCase() === 'i') {
      onClose();
      return;
    }
    if (key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setScrollOffset((prev) => Math.min(maxOffset, prev + 1));
    }
  });

  const labelEntries = Object.entries(live.allLabels).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const visibleResources = live.resources.items.slice(
    scrollOffset,
    scrollOffset + MAX_VISIBLE_RESOURCES,
  );

  return (
    <Box
      borderStyle="round"
      borderColor="cyan"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
    >
      <Box>
        <Text bold color="cyan">
          Inspección de Namespace: {live.name}
        </Text>
        {loading ? <Text color="yellow"> (actualizando en vivo...)</Text> : null}
      </Box>

      {error ? (
        <Text color="red">Error consultando en vivo: {error}</Text>
      ) : null}

      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text dimColor>Estado:</Text>{' '}
          <Text color={live.phase === 'Active' ? 'green' : 'yellow'}>
            {live.phase === 'Active' ? '● Active' : `◐ ${live.phase}`}
          </Text>
          {'  '}
          <Text dimColor>Gestionado:</Text>{' '}
          <Text color={live.isManaged ? 'cyan' : 'gray'}>
            {live.isManaged ? 'sí (tsure.io/managed)' : 'no'}
          </Text>
          {live.isProtected ? (
            <Text color="yellow" bold>
              {'  '}[PROTEGIDO]
            </Text>
          ) : null}
        </Text>

        <Text>
          <Text dimColor>Descripción:</Text>{' '}
          <Text>{live.description || '(sin descripción)'}</Text>
        </Text>

        <Text>
          <Text dimColor>Afinidad de agente:</Text>{' '}
          <Text color={live.nodeSelector ? 'cyan' : 'gray'}>
            {formatNodeSelectorDisplay(live.nodeSelector)}
          </Text>
          {live.nodeSelector ? (
            <Text dimColor>
              {' '}
              [{live.nodeSelector}] · agentes coincidentes:{' '}
              {live.matchingAgents.length > 0
                ? live.matchingAgents.join(', ')
                : 'ninguno'}
            </Text>
          ) : null}
        </Text>

        <Text>
          <Text dimColor>Permite editar/eliminar:</Text>{' '}
          {live.usage.canMutate ? (
            <Text color="green" bold>
              Sí (libre — 0 herramientas y 0 recursos activos)
            </Text>
          ) : (
            <Text color="red" bold>
              Bloqueado
            </Text>
          )}
        </Text>
        {!live.usage.canMutate
          ? live.usage.reasons.map((reason, idx) => (
              <Text key={idx} color="yellow">
                {'  '}• {reason}
              </Text>
            ))
          : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">
          Labels ({labelEntries.length})
        </Text>
        {labelEntries.length === 0 ? (
          <Text dimColor>  (sin labels)</Text>
        ) : (
          labelEntries.map(([k, v]) => {
            const isUsage = live.usageLabelKeys.includes(k);
            const isTsure = k.startsWith('tsure.io/');
            return (
              <Text key={k}>
                {'  '}
                <Text color={isUsage ? 'magenta' : isTsure ? 'cyan' : 'gray'}>
                  {k}={v}
                </Text>
                {isUsage ? <Text color="yellow"> (en uso)</Text> : null}
              </Text>
            );
          })
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">
          Recursos activos ({formatResourcesSummary(live.resources)})
        </Text>
        {live.resources.items.length === 0 ? (
          <Text color="green">  No hay recursos activos en ningún agente.</Text>
        ) : (
          <>
            {visibleResources.map((item, idx) => (
              <Text key={`${item.kind}-${item.name}-${idx}`}>
                {'  '}
                <Text color="cyan">{item.kind.padEnd(22)}</Text>
                <Text>{item.name.padEnd(32)}</Text>
                <Text dimColor>{(item.status ?? '-').padEnd(14)}</Text>
                {item.nodeName ? (
                  <Text color="yellow">agente:{item.nodeName}</Text>
                ) : null}
              </Text>
            ))}
            {live.resources.items.length > MAX_VISIBLE_RESOURCES ? (
              <Text dimColor>
                {'  '}Mostrando {scrollOffset + 1}-
                {Math.min(
                  scrollOffset + MAX_VISIBLE_RESOURCES,
                  live.resources.items.length,
                )}{' '}
                de {live.resources.items.length} (usa ↑/↓ para desplazarte)
              </Text>
            ) : null}
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>(↑/↓) Scroll recursos · (Esc / i) Cerrar</Text>
      </Box>
    </Box>
  );
};
