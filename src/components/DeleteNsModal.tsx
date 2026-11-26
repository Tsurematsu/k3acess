import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { NamespaceInfo, NodeAgentInfo } from '../types/k8s.js';
import {
  deleteNamespace,
  inspectNamespaceLive,
  removeOrphanToolLabels,
} from '../services/namespaces.js';
import { TextInput } from './TextInput.js';

export interface DeleteNsModalProps {
  namespace: NamespaceInfo;
  agents: NodeAgentInfo[];
  hasCnpgCrd: boolean;
  onDeleted: (name: string) => void;
  onAudited: (name: string) => void;
  onCancel: () => void;
}

export const DeleteNsModal: React.FC<DeleteNsModalProps> = ({
  namespace,
  agents,
  hasCnpgCrd,
  onDeleted,
  onAudited,
  onCancel,
}) => {
  const [checking, setChecking] = useState(true);
  const [live, setLive] = useState<NamespaceInfo>(namespace);
  const [confirmName, setConfirmName] = useState('');
  const [auditMode, setAuditMode] = useState(false);
  const [auditConfirm, setAuditConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLive = async () => {
    setChecking(true);
    setError(null);
    try {
      const fresh = await inspectNamespaceLive(
        namespace.name,
        agents,
        hasCnpgCrd,
      );
      setLive(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void loadLive();
  }, [namespace.name, agents, hasCnpgCrd]);

  const handleDelete = async () => {
    if (submitting || !live.usage.canMutate) return;
    if (confirmName.trim() !== live.name) {
      setError(`Debes escribir exactamente "${live.name}" para confirmar.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await deleteNamespace({
        name: live.name,
        agents,
        hasCnpgCrd,
      });
      onDeleted(live.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  const handleAuditClear = async () => {
    if (submitting || !live.usage.canAuditOrphanLabels) return;
    if (auditConfirm.trim().toUpperCase() !== 'LIMPIAR') {
      setError('Escribe exactamente LIMPIAR para retirar los labels huérfanos.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await removeOrphanToolLabels({
        name: live.name,
        labelKeys: live.usage.orphanTsureLabelKeys,
        agents,
        hasCnpgCrd,
      });
      setAuditMode(false);
      setAuditConfirm('');
      onAudited(live.name);
      await loadLive();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  useInput(
    (input, key) => {
      if (submitting) return;

      if (key.escape) {
        if (auditMode) {
          setAuditMode(false);
          setAuditConfirm('');
          setError(null);
        } else {
          onCancel();
        }
        return;
      }

      if (!checking && !live.usage.canMutate && !auditMode) {
        if (input.toLowerCase() === 'a' && live.usage.canAuditOrphanLabels) {
          setAuditMode(true);
          setError(null);
          return;
        }
        if (input.toLowerCase() === 'q' || key.return) {
          onCancel();
        }
      }
    },
    { isActive: !submitting },
  );

  if (checking) {
    return (
      <Box
        borderStyle="round"
        borderColor="red"
        flexDirection="column"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="yellow">
          Ejecutando doble verificación en "{namespace.name}"...
        </Text>
        <Text dimColor>
          Comprobando labels de uso tsure.io/* y recursos activos en los agentes k3s.
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
          ✗ Eliminación bloqueada para "{live.name}"
        </Text>
        <Text dimColor>
          No se puede eliminar un namespace protegido o que tenga herramientas/recursos activos en algún agente.
        </Text>

        <Box flexDirection="column" marginTop={1}>
          {live.usage.reasons.map((reason, idx) => (
            <Text key={idx} color="yellow">
              • {reason}
            </Text>
          ))}
        </Box>

        {live.usage.canAuditOrphanLabels && !auditMode ? (
          <Box
            marginTop={1}
            borderStyle="single"
            borderColor="yellow"
            paddingX={1}
            flexDirection="column"
          >
            <Text bold color="yellow">
              Auditoría disponible (0 recursos reales en k8s)
            </Text>
            <Text>
              Labels huérfanos detectados:{' '}
              <Text color="magenta">
                {live.usage.orphanTsureLabelKeys.join(', ')}
              </Text>
            </Text>
            <Text dimColor>
              Pulsa (a) si confirmas que ninguna herramienta sigue usando este namespace y deseas retirar el label huérfano.
            </Text>
          </Box>
        ) : null}

        {auditMode ? (
          <Box
            marginTop={1}
            borderStyle="single"
            borderColor="magenta"
            paddingX={1}
            flexDirection="column"
          >
            <Text bold color="magenta">
              Confirmación de auditoría — Retirar labels huérfanos
            </Text>
            <Text>
              Se retirarán:{' '}
              <Text bold>{live.usage.orphanTsureLabelKeys.join(', ')}</Text>
            </Text>
            <Text>Escribe LIMPIAR y pulsa Enter:</Text>
            <Box borderStyle="single" borderColor="magenta" paddingX={1} marginTop={0}>
              <TextInput
                value={auditConfirm}
                onChange={(val) => {
                  setAuditConfirm(val);
                  setError(null);
                }}
                onSubmit={() => {
                  void handleAuditClear();
                }}
                focus={auditMode && !submitting}
                placeholder="LIMPIAR"
              />
            </Box>
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
            <Text color="yellow">Retirando labels huérfanos...</Text>
          ) : auditMode ? (
            <Text dimColor>(Enter) Confirmar limpieza · (Esc) Cancelar auditoría</Text>
          ) : (
            <Text dimColor>
              {live.usage.canAuditOrphanLabels ? '(a) Auditar labels huérfanos · ' : ''}
              (Esc / Enter) Volver
            </Text>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor="red"
      flexDirection="column"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="red">
        Eliminar Namespace: {live.name}
      </Text>
      <Text color="green">
        ✓ Doble verificación superada: 0 labels de uso · 0 recursos activos en agentes k3s
      </Text>
      <Text dimColor>
        Esta acción ejecutará "kubectl delete namespace {live.name} --wait=true".
      </Text>

      <Box flexDirection="column" marginTop={1}>
        <Text>
          Escribe el nombre exacto <Text bold color="red">{live.name}</Text> para confirmar:
        </Text>
        <Box borderStyle="single" borderColor="red" paddingX={1}>
          <TextInput
            value={confirmName}
            onChange={(val) => {
              setConfirmName(val);
              setError(null);
            }}
            onSubmit={() => {
              void handleDelete();
            }}
            focus={!submitting}
            placeholder={live.name}
          />
        </Box>
      </Box>

      {error ? (
        <Box marginTop={1}>
          <Text color="red" bold>
            ✗ {error}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        {submitting ? (
          <Text color="yellow">
            Eliminando namespace "{live.name}" (esperando finalización)...
          </Text>
        ) : (
          <Text dimColor>(Enter) Confirmar eliminación · (Esc) Cancelar</Text>
        )}
      </Box>
    </Box>
  );
};
