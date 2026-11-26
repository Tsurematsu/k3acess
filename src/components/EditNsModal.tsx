import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { NamespaceInfo, NodeAgentInfo } from '../types/k8s.js';
import { buildNodeSelectorPresets } from '../services/nodes.js';
import {
  inspectNamespaceLive,
  updateNamespaceMetadata,
} from '../services/namespaces.js';
import {
  matchAgentsForSelector,
  parseNodeSelector,
} from '../utils/validation.js';
import { TextInput } from './TextInput.js';

export interface EditNsModalProps {
  namespace: NamespaceInfo;
  agents: NodeAgentInfo[];
  hasCnpgCrd: boolean;
  onUpdated: (name: string) => void;
  onCancel: () => void;
}

const CUSTOM_OPTION_ID = '__custom__';

export const EditNsModal: React.FC<EditNsModalProps> = ({
  namespace,
  agents,
  hasCnpgCrd,
  onUpdated,
  onCancel,
}) => {
  const presets = useMemo(
    () => [
      ...buildNodeSelectorPresets(agents),
      {
        id: CUSTOM_OPTION_ID,
        label: 'Personalizado (clave=valor)',
        description: 'Escribe manualmente un selector de labels de nodo',
        selector: null,
      },
    ],
    [agents],
  );

  const [checking, setChecking] = useState(true);
  const [live, setLive] = useState<NamespaceInfo>(namespace);
  const [description, setDescription] = useState(namespace.description);
  const [presetIndex, setPresetIndex] = useState(0);
  const [customSelector, setCustomSelector] = useState('');
  const [focusField, setFocusField] = useState<0 | 1 | 2>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setChecking(true);
    setError(null);
    inspectNamespaceLive(namespace.name, agents, hasCnpgCrd)
      .then((fresh) => {
        if (!active) return;
        setLive(fresh);
        setDescription(fresh.description);

        if (!fresh.nodeSelector) {
          setPresetIndex(0);
          setCustomSelector('');
        } else {
          const foundIdx = presets.findIndex(
            (p) => p.selector === fresh.nodeSelector,
          );
          if (foundIdx >= 0) {
            setPresetIndex(foundIdx);
            setCustomSelector('');
          } else {
            setPresetIndex(presets.length - 1);
            setCustomSelector(fresh.nodeSelector);
          }
        }
        setChecking(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [namespace.name, agents, hasCnpgCrd, presets]);

  const selectedPreset = presets[presetIndex] ?? presets[0]!;
  const isCustom = selectedPreset.id === CUSTOM_OPTION_ID;
  const maxField: 1 | 2 = isCustom ? 2 : 1;
  const effectiveSelector = isCustom
    ? customSelector.trim() || null
    : selectedPreset.selector;

  const selectorParsed = useMemo(
    () => parseNodeSelector(effectiveSelector ?? ''),
    [effectiveSelector],
  );

  const matchingAgents = useMemo(() => {
    if (!effectiveSelector || !selectorParsed.valid) return agents;
    return matchAgentsForSelector(selectorParsed.normalized, agents);
  }, [effectiveSelector, selectorParsed, agents]);

  const canEdit = !checking && live.usage.canMutate;

  const handleSubmit = async () => {
    if (submitting || !canEdit) return;
    if (!selectorParsed.valid) {
      setError(selectorParsed.error ?? 'Selector inválido.');
      setFocusField(isCustom ? 2 : 1);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await updateNamespaceMetadata({
        name: live.name,
        description,
        nodeSelector: selectorParsed.normalized,
        agents,
        hasCnpgCrd,
      });
      onUpdated(live.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  useInput(
    (input, key) => {
      if (submitting) return;

      if (key.escape) {
        onCancel();
        return;
      }

      if (!canEdit) {
        if (input.toLowerCase() === 'q' || key.return) {
          onCancel();
        }
        return;
      }

      if (key.ctrl && input.toLowerCase() === 's') {
        void handleSubmit();
        return;
      }

      if (key.tab || key.downArrow) {
        setFocusField((prev) => {
          const next = prev + 1;
          return (next > maxField ? 0 : next) as 0 | 1 | 2;
        });
        return;
      }

      if (key.upArrow) {
        setFocusField((prev) => {
          const next = prev - 1;
          return (next < 0 ? maxField : next) as 0 | 1 | 2;
        });
        return;
      }

      if (focusField === 1) {
        if (key.leftArrow) {
          setPresetIndex((prev) => (prev - 1 + presets.length) % presets.length);
          return;
        }
        if (key.rightArrow || input === ' ') {
          setPresetIndex((prev) => (prev + 1) % presets.length);
          return;
        }
        if (key.return) {
          if (isCustom) {
            setFocusField(2);
          } else {
            void handleSubmit();
          }
          return;
        }
      }
    },
    { isActive: !submitting },
  );

  if (checking) {
    return (
      <Box
        borderStyle="round"
        borderColor="yellow"
        flexDirection="column"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="yellow">
          Verificando estado en vivo de "{namespace.name}"...
        </Text>
        <Text dimColor>
          Comprobando labels de uso y recursos activos en los agentes k3s antes de habilitar la edición.
        </Text>
      </Box>
    );
  }

  if (!live.usage.canMutate) {
    return (
      <Box
        borderStyle="round"
        borderColor="red"
        flexDirection="column"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="red">
          ✗ Edición bloqueada para "{live.name}"
        </Text>
        <Text dimColor>
          Un namespace solo puede editarse cuando está libre (sin herramientas ni recursos activos en agentes).
        </Text>

        <Box flexDirection="column" marginTop={1}>
          {live.usage.reasons.map((reason, idx) => (
            <Text key={idx} color="yellow">
              • {reason}
            </Text>
          ))}
        </Box>

        {live.usage.canAuditOrphanLabels ? (
          <Box marginTop={1}>
            <Text color="cyan">
              ℹ No hay recursos activos en el cluster, solo labels huérfanos ({live.usage.orphanTsureLabelKeys.join(', ')}). Puedes auditarlos desde la pantalla de eliminación (x).
            </Text>
          </Box>
        ) : null}

        <Box marginTop={1}>
          <Text dimColor>(Esc / Enter) Volver al dashboard</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="yellow">
        Editar Namespace: {live.name}
      </Text>
      <Text color="green">
        ✓ Verificado libre (0 herramientas · 0 recursos en agentes) — sin modificar labels externos
      </Text>

      {/* Campo 0: Descripción */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold={focusField === 0} color={focusField === 0 ? 'cyan' : undefined}>
          {focusField === 0 ? '▸ ' : '  '}Descripción (tsure.io/description — vacío para eliminar):
        </Text>
        <Box
          marginLeft={2}
          borderStyle="single"
          borderColor={focusField === 0 ? 'cyan' : 'gray'}
          paddingX={1}
        >
          <TextInput
            value={description}
            onChange={setDescription}
            onSubmit={() => setFocusField(1)}
            focus={focusField === 0 && !submitting}
            placeholder="Sin descripción"
          />
        </Box>
      </Box>

      {/* Campo 1: Afinidad de agente */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold={focusField === 1} color={focusField === 1 ? 'cyan' : undefined}>
          {focusField === 1 ? '▸ ' : '  '}Afinidad por agente (← / →):
        </Text>
        <Box
          marginLeft={2}
          borderStyle="single"
          borderColor={focusField === 1 ? 'cyan' : 'gray'}
          paddingX={1}
          flexDirection="column"
        >
          <Text bold color={effectiveSelector ? 'cyan' : 'white'}>
            ◀ {selectedPreset.label} ▶
          </Text>
          <Text dimColor>{selectedPreset.description}</Text>
        </Box>
      </Box>

      {/* Campo 2: Selector personalizado */}
      {isCustom ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold={focusField === 2} color={focusField === 2 ? 'cyan' : undefined}>
            {focusField === 2 ? '▸ ' : '  '}Selector personalizado (clave=valor):
          </Text>
          <Box
            marginLeft={2}
            borderStyle="single"
            borderColor={focusField === 2 ? 'cyan' : 'gray'}
            paddingX={1}
          >
            <TextInput
              value={customSelector}
              onChange={(val) => {
                setCustomSelector(val);
                setError(null);
              }}
              onSubmit={() => {
                void handleSubmit();
              }}
              focus={focusField === 2 && !submitting}
              placeholder="ej. kubernetes.io/hostname=k3s-agent2"
            />
          </Box>
          {!selectorParsed.valid && selectorParsed.error ? (
            <Box marginLeft={2}>
              <Text color="red">{selectorParsed.error}</Text>
            </Box>
          ) : null}
        </Box>
      ) : null}

      {effectiveSelector && selectorParsed.valid ? (
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          <Text>
            <Text dimColor>Agentes coincidentes:</Text>{' '}
            {matchingAgents.length > 0 ? (
              <Text color="green">
                {matchingAgents.map((a) => a.name).join(', ')}
              </Text>
            ) : (
              <Text color="yellow">Ningún agente actual coincide</Text>
            )}
          </Text>
        </Box>
      ) : null}

      {error ? (
        <Box marginTop={1}>
          <Text color="red" bold>
            ✗ {error}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        {submitting ? (
          <Text color="yellow">Guardando cambios en el cluster...</Text>
        ) : (
          <Text dimColor>
            (Tab/↑/↓) Campos · (←/→) Agente · (Enter / Ctrl+S) Guardar · (Esc) Cancelar
          </Text>
        )}
      </Box>
    </Box>
  );
};
