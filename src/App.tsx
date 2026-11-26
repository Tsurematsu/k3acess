import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, useApp, useInput } from 'ink';
import type {
  NamespaceInfo,
  NodeAgentInfo,
  PreFlightResult,
  PreFlightStep,
} from './types/k8s.js';
import { runPreFlight } from './services/preflight.js';
import { listNamespaces } from './services/namespaces.js';
import { listNodes } from './services/nodes.js';
import { PreFlightScreen } from './components/PreFlightScreen.js';
import { Header } from './components/Header.js';
import { FooterBar, type FooterShortcut } from './components/FooterBar.js';
import { DashboardScreen } from './components/DashboardScreen.js';
import { CreateNsModal } from './components/CreateNsModal.js';
import { InspectNsModal } from './components/InspectNsModal.js';
import { EditNsModal } from './components/EditNsModal.js';
import { DeleteNsModal } from './components/DeleteNsModal.js';
import { AgentsModal } from './components/AgentsModal.js';

type ActiveModal = 'none' | 'create' | 'inspect' | 'edit' | 'delete' | 'agents';

const REFRESH_INTERVAL_MS = 5_000;

export const App: React.FC = () => {
  const { exit } = useApp();

  // Estado Pre-Flight
  const [phase, setPhase] = useState<'preflight' | 'dashboard'>('preflight');
  const [preFlightSteps, setPreFlightSteps] = useState<PreFlightStep[]>([]);
  const [preFlightRunning, setPreFlightRunning] = useState(true);
  const [preFlightFailed, setPreFlightFailed] = useState(false);
  const [preFlightData, setPreFlightData] = useState<PreFlightResult | null>(
    null,
  );

  // Estado Dashboard
  const [agents, setAgents] = useState<NodeAgentInfo[]>([]);
  const [allNamespaces, setAllNamespaces] = useState<NamespaceInfo[]>([]);
  const [showSystem, setShowSystem] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modal, setModal] = useState<ActiveModal>('none');
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'info' | 'success' | 'error';
    text: string;
  } | null>(null);

  const isRefreshingRef = useRef(false);

  const showToast = useCallback(
    (type: 'info' | 'success' | 'error', text: string) => {
      setStatusMessage({ type, text });
    },
    [],
  );

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 6_000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const executePreFlight = useCallback(async () => {
    setPreFlightRunning(true);
    setPreFlightFailed(false);
    const result = await runPreFlight((steps) => {
      setPreFlightSteps(steps);
    });
    setPreFlightSteps(result.steps);
    setPreFlightRunning(false);

    if (!result.ok) {
      setPreFlightFailed(true);
      return;
    }

    setPreFlightData(result);
    setAgents(result.agents);

    try {
      const initialNamespaces = await listNamespaces(
        result.agents,
        result.hasCnpgCrd,
      );
      setAllNamespaces(initialNamespaces);
      setLastSync(new Date());
      setSyncError(null);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    }

    setPhase('dashboard');
  }, []);

  useEffect(() => {
    void executePreFlight();
  }, [executePreFlight]);

  const refreshCluster = useCallback(async () => {
    if (!preFlightData || isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setRefreshing(true);
    try {
      const latestAgents = await listNodes().catch(() => agents);
      const latestNamespaces = await listNamespaces(
        latestAgents,
        preFlightData.hasCnpgCrd,
      );
      setAgents(latestAgents);
      setAllNamespaces(latestNamespaces);
      setLastSync(new Date());
      setSyncError(null);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      isRefreshingRef.current = false;
      setRefreshing(false);
    }
  }, [preFlightData, agents]);

  // Refresco automático cada 5 segundos cuando estamos en el dashboard sin modales abiertos
  useEffect(() => {
    if (phase !== 'dashboard' || modal !== 'none') return;
    const interval = setInterval(() => {
      void refreshCluster();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase, modal, refreshCluster]);

  const visibleNamespaces = useMemo(
    () =>
      showSystem
        ? allNamespaces
        : allNamespaces.filter((ns) => !ns.isProtected),
    [allNamespaces, showSystem],
  );

  const hiddenSystemCount = useMemo(
    () => allNamespaces.filter((ns) => ns.isProtected).length,
    [allNamespaces],
  );

  useEffect(() => {
    setSelectedIndex((prev) => {
      if (visibleNamespaces.length === 0) return 0;
      return Math.min(prev, visibleNamespaces.length - 1);
    });
  }, [visibleNamespaces.length]);

  const selectedNamespace = visibleNamespaces[selectedIndex] ?? null;

  useInput(
    (input, key) => {
      const lower = input.toLowerCase();

      if (key.escape || lower === 'q') {
        exit();
        return;
      }

      if (key.upArrow) {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow) {
        setSelectedIndex((prev) =>
          Math.min(Math.max(0, visibleNamespaces.length - 1), prev + 1),
        );
        return;
      }

      if (lower === 'n') {
        if (preFlightData && !preFlightData.canCreate) {
          showToast('error', 'Tu usuario de kubectl no tiene permiso "create" sobre namespaces.');
          return;
        }
        setModal('create');
        return;
      }

      if (lower === 'a') {
        setModal('agents');
        return;
      }

      if (lower === 'y') {
        setShowSystem((prev) => !prev);
        return;
      }

      if (lower === 'u') {
        void refreshCluster();
        showToast('info', 'Refrescando namespaces y agentes...');
        return;
      }

      if (!selectedNamespace) return;

      if (lower === 'i' || key.return) {
        setModal('inspect');
        return;
      }

      if (lower === 'e') {
        if (preFlightData && !preFlightData.canPatch) {
          showToast('error', 'Tu usuario de kubectl no tiene permiso "patch" sobre namespaces.');
          return;
        }
        setModal('edit');
        return;
      }

      if (lower === 'x') {
        if (preFlightData && !preFlightData.canDelete) {
          showToast('error', 'Tu usuario de kubectl no tiene permiso "delete" sobre namespaces.');
          return;
        }
        setModal('delete');
        return;
      }
    },
    { isActive: phase === 'dashboard' && modal === 'none' },
  );

  if (phase === 'preflight' || !preFlightData) {
    return (
      <PreFlightScreen
        steps={preFlightSteps}
        running={preFlightRunning}
        failed={preFlightFailed}
        onRetry={() => {
          void executePreFlight();
        }}
        onExit={exit}
      />
    );
  }

  const dashboardShortcuts: FooterShortcut[] = [
    { key: 'n', label: 'Nuevo', color: 'green' },
    { key: 'i/Enter', label: 'Inspeccionar', color: 'cyan' },
    { key: 'e', label: 'Editar', color: 'yellow' },
    { key: 'x', label: 'Eliminar', color: 'red' },
    { key: 'a', label: 'Agentes', color: 'cyan' },
    {
      key: 'y',
      label: showSystem ? 'Ocultar sistema' : 'Ver sistema',
      color: 'gray',
    },
    { key: 'u', label: 'Refrescar', color: 'cyan' },
    { key: 'Q/Esc', label: 'Salir', color: 'red' },
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header
        context={preFlightData.context}
        clusterVersion={preFlightData.clusterVersion}
        kubectlVersion={preFlightData.kubectlVersion}
        agents={agents}
        hasCnpgCrd={preFlightData.hasCnpgCrd}
        lastSync={lastSync}
        refreshing={refreshing}
      />

      {modal === 'none' ? (
        <>
          <DashboardScreen
            namespaces={visibleNamespaces}
            selectedIndex={selectedIndex}
            showSystem={showSystem}
            hiddenSystemCount={hiddenSystemCount}
            error={syncError}
          />
          <FooterBar shortcuts={dashboardShortcuts} statusMessage={statusMessage} />
        </>
      ) : null}

      {modal === 'create' ? (
        <Box marginTop={1} flexDirection="column">
          <CreateNsModal
            agents={agents}
            existingNames={allNamespaces.map((n) => n.name)}
            onCreated={(createdName) => {
              setModal('none');
              showToast('success', `Namespace "${createdName}" creado correctamente.`);
              void refreshCluster();
            }}
            onCancel={() => setModal('none')}
          />
        </Box>
      ) : null}

      {modal === 'inspect' && selectedNamespace ? (
        <Box marginTop={1} flexDirection="column">
          <InspectNsModal
            namespace={selectedNamespace}
            agents={agents}
            hasCnpgCrd={preFlightData.hasCnpgCrd}
            onClose={() => setModal('none')}
          />
        </Box>
      ) : null}

      {modal === 'edit' && selectedNamespace ? (
        <Box marginTop={1} flexDirection="column">
          <EditNsModal
            namespace={selectedNamespace}
            agents={agents}
            hasCnpgCrd={preFlightData.hasCnpgCrd}
            onUpdated={(updatedName) => {
              setModal('none');
              showToast('success', `Metadata de "${updatedName}" actualizada.`);
              void refreshCluster();
            }}
            onCancel={() => setModal('none')}
          />
        </Box>
      ) : null}

      {modal === 'delete' && selectedNamespace ? (
        <Box marginTop={1} flexDirection="column">
          <DeleteNsModal
            namespace={selectedNamespace}
            agents={agents}
            hasCnpgCrd={preFlightData.hasCnpgCrd}
            onDeleted={(deletedName) => {
              setModal('none');
              showToast('success', `Namespace "${deletedName}" eliminado.`);
              void refreshCluster();
            }}
            onAudited={(auditedName) => {
              showToast(
                'info',
                `Labels huérfanos retirados de "${auditedName}".`,
              );
              void refreshCluster();
            }}
            onCancel={() => setModal('none')}
          />
        </Box>
      ) : null}

      {modal === 'agents' ? (
        <Box marginTop={1} flexDirection="column">
          <AgentsModal
            agents={agents}
            namespaces={allNamespaces}
            onClose={() => setModal('none')}
          />
        </Box>
      ) : null}
    </Box>
  );
};
