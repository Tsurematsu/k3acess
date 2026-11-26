import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { NodeAgentInfo } from '../types/k8s.js';
import { buildNodeSelectorPresets } from '../services/nodes.js';
import { createNamespace } from '../services/namespaces.js';
import {
  matchAgentsForSelector,
  parseNodeSelector,
  validateNamespaceName,
} from '../utils/validation.js';
import { TextInput } from './TextInput.js';

export interface CreateNsModalProps {
  agents: NodeAgentInfo[];
  existingNames: string[];
  onCreated: (name: string) => void;
  onCancel: () => void;
}

const CUSTOM_OPTION_ID = '__custom__';

export const CreateNsModal: React.FC<CreateNsModalProps> = ({
  agents,
  existingNames,
  onCreated,
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

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [presetIndex, setPresetIndex] = useState(0);
  const [customSelector, setCustomSelector] = useState('');
  const [focusField, setFocusField] = useState<0 | 1 | 2 | 3>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPreset = presets[presetIndex] ?? presets[0]!;
  const isCustom = selectedPreset.id === CUSTOM_OPTION_ID;
  const maxField: 2 | 3 = isCustom ? 3 : 2;
  const effectiveSelector = isCustom
    ? customSelector.trim() || null
    : selectedPreset.selector;

  const nameValidation = useMemo(() => {
    if (!name) return { valid: true as const };
    const check = validateNamespaceName(name);
    if (!check.valid) return check;
    if (existingNames.includes(name.trim())) {
      return { valid: false as const, error: `El namespace "${name.trim()}" ya existe.` };
    }
    return { valid: true as const };
  }, [name, existingNames]);

  const selectorParsed = useMemo(
    () => parseNodeSelector(effectiveSelector ?? ''),
    [effectiveSelector],
  );

  const matchingAgents = useMemo(() => {
    if (!effectiveSelector || !selectorParsed.valid) return agents;
    return matchAgentsForSelector(selectorParsed.normalized, agents);
  }, [effectiveSelector, selectorParsed, agents]);

  const handleSubmit = async () => {
    if (submitting) return;
    const check = validateNamespaceName(name);
    if (!check.valid) {
      setError(check.error ?? 'Nombre inválido.');
      setFocusField(0);
      return;
    }
    if (existingNames.includes(name.trim())) {
      setError(`El namespace "${name.trim()}" ya existe en el cluster.`);
      setFocusField(0);
      return;
    }
    if (!selectorParsed.valid) {
      setError(selectorParsed.error ?? 'Selector inválido.');
      setFocusField(isCustom ? 3 : 2);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createNamespace({
        name: name.trim(),
        description,
        nodeSelector: selectorParsed.normalized,
      });
      onCreated(name.trim());
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

      if (key.ctrl && input.toLowerCase() === 's') {
        void handleSubmit();
        return;
      }

      if (key.tab || key.downArrow) {
        setFocusField((prev) => {
          const next = prev + 1;
          return (next > maxField ? 0 : next) as 0 | 1 | 2 | 3;
        });
        return;
      }

      if (key.upArrow) {
        setFocusField((prev) => {
          const next = prev - 1;
          return (next < 0 ? maxField : next) as 0 | 1 | 2 | 3;
        });
        return;
      }

      if (focusField === 2) {
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
            setFocusField(3);
          } else {
            void handleSubmit();
          }
          return;
        }
      }
    },
    { isActive: !submitting },
  );

  return (
    <Box
      borderStyle="round"
      borderColor="green"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="green">
        Nuevo Namespace (tsure.io/managed=true)
      </Text>
      <Text dimColor>
        Usa Tab / ↑ / ↓ para cambiar de campo · ← / → para elegir agente · Enter para crear
      </Text>

      {/* Campo 0: Nombre */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold={focusField === 0} color={focusField === 0 ? 'cyan' : undefined}>
          {focusField === 0 ? '▸ ' : '  '}Nombre (DNS-1123):
        </Text>
        <Box
          marginLeft={2}
          borderStyle="single"
          borderColor={focusField === 0 ? 'cyan' : 'gray'}
          paddingX={1}
        >
          <TextInput
            value={name}
            onChange={(val) => {
              setName(val);
              setError(null);
            }}
            onSubmit={() => setFocusField(1)}
            focus={focusField === 0 && !submitting}
            placeholder="ej. mi-app-1"
          />
        </Box>
        {!nameValidation.valid && nameValidation.error ? (
          <Box marginLeft={2}>
            <Text color="red">{nameValidation.error}</Text>
          </Box>
        ) : null}
      </Box>

      {/* Campo 1: Descripción */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold={focusField === 1} color={focusField === 1 ? 'cyan' : undefined}>
          {focusField === 1 ? '▸ ' : '  '}Descripción (opcional — tsure.io/description):
        </Text>
        <Box
          marginLeft={2}
          borderStyle="single"
          borderColor={focusField === 1 ? 'cyan' : 'gray'}
          paddingX={1}
        >
          <TextInput
            value={description}
            onChange={setDescription}
            onSubmit={() => setFocusField(2)}
            focus={focusField === 1 && !submitting}
            placeholder="ej. Grupo de servicios de Mi App 1"
          />
        </Box>
      </Box>

      {/* Campo 2: Afinidad / Agente */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold={focusField === 2} color={focusField === 2 ? 'cyan' : undefined}>
          {focusField === 2 ? '▸ ' : '  '}Afinidad por agente (← / →):
        </Text>
        <Box
          marginLeft={2}
          borderStyle="single"
          borderColor={focusField === 2 ? 'cyan' : 'gray'}
          paddingX={1}
          flexDirection="column"
        >
          <Text bold color={effectiveSelector ? 'cyan' : 'white'}>
            ◀ {selectedPreset.label} ▶
          </Text>
          <Text dimColor>{selectedPreset.description}</Text>
        </Box>
      </Box>

      {/* Campo 3: Selector personalizado */}
      {isCustom ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold={focusField === 3} color={focusField === 3 ? 'cyan' : undefined}>
            {focusField === 3 ? '▸ ' : '  '}Selector personalizado (clave=valor[,clave2=valor2]):
          </Text>
          <Box
            marginLeft={2}
            borderStyle="single"
            borderColor={focusField === 3 ? 'cyan' : 'gray'}
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
              focus={focusField === 3 && !submitting}
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

      {/* Vista previa de coincidencia con agentes */}
      {effectiveSelector && selectorParsed.valid ? (
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          <Text>
            <Text dimColor>Agentes coincidentes:</Text>{' '}
            {matchingAgents.length > 0 ? (
              <Text color="green">
                {matchingAgents.map((a) => a.name).join(', ')}
              </Text>
            ) : (
              <Text color="yellow">
                Ningún agente actual coincide con este selector
              </Text>
            )}
          </Text>
          <Text dimColor>
            Nota: guarda scheduler.alpha.kubernetes.io/node-selector + tsure.io/node-selector (requiere PodNodeSelector en k3s-server para aplicarse automáticamente a pods).
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
          <Text color="yellow">Creando namespace en el cluster...</Text>
        ) : (
          <Text dimColor>
            (Enter / Ctrl+S) Crear · (Esc) Cancelar
          </Text>
        )}
      </Box>
    </Box>
  );
};
