import type { PreFlightResult, PreFlightStep } from '../types/k8s.js';
import { KubectlError, runKubectl, runKubectlJson } from './kubectl.js';
import { listNodes } from './nodes.js';

interface KubectlVersionOutput {
  clientVersion?: {
    gitVersion?: string;
  };
}

export async function runPreFlight(
  onProgress?: (steps: PreFlightStep[]) => void,
): Promise<PreFlightResult> {
  const steps: PreFlightStep[] = [
    { id: 'binary', label: 'Verificar instalación de kubectl', status: 'pending' },
    { id: 'context', label: 'Validar contexto activo de kubeconfig', status: 'pending' },
    { id: 'cluster', label: 'Comprobar acceso al servidor k3s y agentes', status: 'pending' },
    { id: 'rbac', label: 'Validar permisos sobre namespaces', status: 'pending' },
    { id: 'cnpg', label: 'Detectar CRD CloudNativePG (compatibilidad kpg)', status: 'pending' },
  ];

  const notify = () => {
    onProgress?.(steps.map((s) => ({ ...s })));
  };

  const setStep = (
    id: string,
    patch: Partial<Omit<PreFlightStep, 'id' | 'label'>>,
  ) => {
    const step = steps.find((s) => s.id === id);
    if (step) {
      Object.assign(step, patch);
    }
    notify();
  };

  let kubectlVersion = '-';
  let context = '-';
  let clusterVersion = '-';
  let agents: PreFlightResult['agents'] = [];
  let hasCnpgCrd = false;
  let canCreate = false;
  let canPatch = false;
  let canDelete = false;

  // Paso 1: Verificar instalación de kubectl
  setStep('binary', { status: 'running' });
  try {
    const ver = await runKubectlJson<KubectlVersionOutput>(
      ['version', '--client', '-o', 'json'],
      { timeoutMs: 8_000 },
    );
    kubectlVersion = ver.clientVersion?.gitVersion ?? 'instalado';
    setStep('binary', {
      status: 'ok',
      detail: `kubectl ${kubectlVersion}`,
    });
  } catch (err) {
    const isMissing = err instanceof KubectlError && err.code === 'NOT_INSTALLED';
    setStep('binary', {
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
      hint: isMissing
        ? 'Instala kubectl en el equipo local y asegúrate de que esté en el PATH.'
        : 'Verifica que el binario kubectl sea ejecutable.',
    });
    return {
      ok: false,
      steps,
      kubectlVersion,
      context,
      clusterVersion,
      agents,
      hasCnpgCrd,
      canCreate,
      canPatch,
      canDelete,
    };
  }

  // Paso 2: Validar contexto activo
  setStep('context', { status: 'running' });
  try {
    const ctxResult = await runKubectl(['config', 'current-context'], {
      timeoutMs: 8_000,
    });
    context = ctxResult.stdout.trim();
    if (!context) {
      throw new Error('No hay ningún contexto activo configurado en kubeconfig.');
    }
    setStep('context', {
      status: 'ok',
      detail: `Contexto activo: ${context}`,
    });
  } catch (err) {
    setStep('context', {
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
      hint: 'Configura KUBECONFIG o ejecuta "kubectl config use-context <contexto>".',
    });
    return {
      ok: false,
      steps,
      kubectlVersion,
      context,
      clusterVersion,
      agents,
      hasCnpgCrd,
      canCreate,
      canPatch,
      canDelete,
    };
  }

  // Paso 3: Conectividad con servidor k3s y agentes
  setStep('cluster', { status: 'running' });
  try {
    agents = await listNodes();
    if (agents.length === 0) {
      throw new Error('El cluster respondió pero no devolvió nodos/agentes.');
    }
    const readyCount = agents.filter((a) => a.ready).length;
    clusterVersion = agents[0]?.version ?? '-';
    const names = agents.map((a) => a.name).join(', ');
    setStep('cluster', {
      status: 'ok',
      detail: `${readyCount}/${agents.length} nodos Ready (${clusterVersion}) · ${names}`,
    });
  } catch (err) {
    setStep('cluster', {
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
      hint: 'Revisa conectividad de red/VPN con el servidor k3s y credenciales en ~/.kube/config.',
    });
    return {
      ok: false,
      steps,
      kubectlVersion,
      context,
      clusterVersion,
      agents,
      hasCnpgCrd,
      canCreate,
      canPatch,
      canDelete,
    };
  }

  // Paso 4: Validar permisos RBAC sobre namespaces
  setStep('rbac', { status: 'running' });
  try {
    const checkVerb = async (verb: string): Promise<boolean> => {
      try {
        const res = await runKubectl(['auth', 'can-i', verb, 'namespaces'], {
          timeoutMs: 8_000,
        });
        return res.stdout.trim().toLowerCase() === 'yes';
      } catch {
        return false;
      }
    };

    const [canList, createOk, patchOk, deleteOk] = await Promise.all([
      checkVerb('list'),
      checkVerb('create'),
      checkVerb('patch'),
      checkVerb('delete'),
    ]);

    canCreate = createOk;
    canPatch = patchOk;
    canDelete = deleteOk;

    if (!canList) {
      setStep('rbac', {
        status: 'error',
        detail: 'Sin permiso "list" sobre namespaces.',
        hint: 'Asigna permisos suficientes al usuario/token de kubeconfig para administrar namespaces.',
      });
      return {
        ok: false,
        steps,
        kubectlVersion,
        context,
        clusterVersion,
        agents,
        hasCnpgCrd,
        canCreate,
        canPatch,
        canDelete,
      };
    }

    const granted = [
      'list',
      canCreate ? 'create' : null,
      canPatch ? 'patch' : null,
      canDelete ? 'delete' : null,
    ].filter(Boolean);

    const allWrite = canCreate && canPatch && canDelete;
    setStep('rbac', {
      status: allWrite ? 'ok' : 'warn',
      detail: allWrite
        ? `Permisos completos (${granted.join(', ')})`
        : `Permisos parciales (${granted.join(', ')})`,
    });
  } catch (err) {
    setStep('rbac', {
      status: 'error',
      detail: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      steps,
      kubectlVersion,
      context,
      clusterVersion,
      agents,
      hasCnpgCrd,
      canCreate,
      canPatch,
      canDelete,
    };
  }

  // Paso 5: Detectar CRD CNPG (opcional)
  setStep('cnpg', { status: 'running' });
  try {
    await runKubectl(['get', 'crd', 'clusters.postgresql.cnpg.io'], {
      timeoutMs: 8_000,
    });
    hasCnpgCrd = true;
    setStep('cnpg', {
      status: 'ok',
      detail: 'CRD clusters.postgresql.cnpg.io detectado (se validará antes de editar/borrar)',
    });
  } catch {
    hasCnpgCrd = false;
    setStep('cnpg', {
      status: 'warn',
      detail: 'CRD CNPG no instalado en el cluster (se omitirá chequeo CNPG)',
    });
  }

  return {
    ok: true,
    steps,
    kubectlVersion,
    context,
    clusterVersion,
    agents,
    hasCnpgCrd,
    canCreate,
    canPatch,
    canDelete,
  };
}
