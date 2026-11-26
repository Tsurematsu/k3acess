# Guía base — Herramienta de Administración de Namespaces (`tsure.io/*`)

Documento de referencia con la arquitectura, el contrato de labels compatible con **`kpg`** (y futuras herramientas del ecosistema `tsure`) y los requisitos mínimos para construir el gestor de namespaces de Kubernetes/k3s.

---

## 1. Objetivo y separación de responsabilidades

Esta herramienta es la **única responsable del ciclo de vida de los `Namespace`** en el cluster:

- **Esta herramienta:** crea, lista, inspecciona, etiqueta/describe y elimina namespaces de forma segura.
- **Las demás herramientas (`kpg`, futuros gestores de apps/redis/etc.):** **nunca** crean, editan ni eliminan namespaces; solo consumen namespaces `Active` existentes y declaran su uso mediante un label propio.

---

## 2. Contrato de labels compartido (compatible con `kpg`)

Todas las herramientas del ecosistema utilizan el prefijo **`tsure.io/`** sobre el objeto `Namespace`:

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: mi-app-1
  labels:
    tsure.io/managed: "true"        # (opcional) indica que fue creado por este gestor
    tsure.io/kpg: "true"            # puesto/retirado SOLO por kpg cuando hay BDs CNPG activas
    tsure.io/<otra-tool>: "true"    # puesto/retirado SOLO por otra herramienta tuya
  annotations:
    tsure.io/description: "Grupo de servicios de Mi App 1"
```

### Reglas estrictas del contrato
1. **Propiedad exclusiva de cada clave:**
   - El gestor de namespaces **nunca** sobrescribe ni borra manualmente labels de uso de otras herramientas (como `tsure.io/kpg=true`), salvo con una opción explícita de auditoría/forzado si un recurso ya no existe.
   - Para editar metadata propia del namespace, usar siempre `kubectl label namespace ...` / `kubectl annotate namespace ...` o `kubectl apply --server-side --field-manager=<nombre-gestor>`.
2. **Namespaces protegidos (nunca modificables ni eliminables):**
   - `default` (ignorado por `kpg` para nuevos despliegues; solo se muestran BDs heredadas si existen).
   - `kube-system`
   - `kube-public`
   - `kube-node-lease`
   - `cnpg-system`
3. **Regla de borrado seguro (la más importante):**
   Un namespace **solo se puede eliminar** si cumple **ambas** condiciones:
   - **Condición A (labels de uso):** no tiene ningún label de uso de herramientas (`tsure.io/*` distintos de `tsure.io/managed`, ni otros labels personalizados de uso).
   - **Condición B (verificación real en Kubernetes):** no existen recursos activos dentro del namespace (`pods`, `deployments`, `statefulsets`, `services`, `pvc`, `clusters.postgresql.cnpg.io`, etc.).
   - Si existe algún label de uso o algún recurso activo, **bloquear la eliminación** e indicar exactamente qué herramienta/recurso lo está usando (por ejemplo: *"En uso por `kpg` — mueve o elimina primero sus BDs desde `kpg`"*).

---

## 3. Stack recomendado (coherente con `kpg`)

Para mantener la misma experiencia visual y portabilidad (binarios Linux/Windows sin dependencias nativas):

- **Runtime:** Node.js v20+ (ESM) + TypeScript (`strict: true`, `NodeNext`)
- **UI de terminal (TUI):** React 19 + Ink 8 (alternate screen buffer `\x1b[?1049h` / `\x1b[?1049l`)
- **Integración k8s:** `child_process.spawn('kubectl', args)` (sin shell, para evitar inyección de comandos)
- **Empaquetado opcional:** `esbuild` + `node --build-sea` (mismo esquema que `kpg/scripts/build-sea.mjs`)

---

## 4. Estructura sugerida del proyecto

```text
kns/                              # (o el nombre que elijas, ej. tns / kns)
├── package.json
├── tsconfig.json
└── src/
    ├── index.tsx                 # Alternate screen buffer + render(<App />)
    ├── App.tsx                   # PreFlight (conexión kubectl) -> Dashboard
    ├── types/
    │   └── k8s.ts                # NamespaceInfo, NamespaceResourcesSummary
    ├── services/
    │   ├── kubectl.ts            # Wrapper seguro spawn('kubectl', args)
    │   └── namespaces.ts         # CRUD namespaces, chequeo de uso y recursos activos
    └── components/
        ├── Header.tsx            # Contexto k8s, versión del cluster, última sincronización
        ├── FooterBar.tsx         # Atajos contextuales
        ├── DashboardScreen.tsx   # Tabla en vivo de namespaces + herramientas activas
        ├── CreateNsModal.tsx     # Crear namespace (validación DNS-1123 + descripción opcional)
        ├── InspectNsModal.tsx    # Ver labels, herramientas vinculadas y recursos dentro del ns
        ├── EditNsModal.tsx       # Editar descripción/anotaciones sin pisar tsure.io/<tool>
        └── DeleteNsModal.tsx     # Bloqueo si hay labels de uso o recursos; confirmación por nombre
```

---

## 5. Funcionalidades mínimas (MVP)

### 5.1 Dashboard principal (refresco cada 5s)
Tabla con columnas:

| Columna | Contenido |
| :--- | :--- |
| **NAMESPACE** | Nombre del namespace |
| **ESTADO** | `● Active` / `◐ Terminating` |
| **HERRAMIENTAS** | Lista detectada de labels de uso (ej. `kpg`, `redis` o `Libre`) |
| **RECURSOS** | Resumen rápido (ej. `2 pods · 1 pvc · 1 svc` o `vacío`) |
| **DESCRIPCIÓN** | Valor de `annotations["tsure.io/description"]` |

Atajos sugeridos:
- `(n)` **Nuevo namespace** — valida `^[a-z0-9]([-a-z0-9]*[a-z0-9])?$` (máx. 63 caracteres), crea con `kubectl create namespace <nombre>` y aplica `tsure.io/managed=true` + descripción opcional.
- `(i)` / `Enter` **Inspeccionar** — muestra todos los labels (`tsure.io/*` y otros) y el listado de recursos que viven dentro del namespace.
- `(e)` **Editar metadata** — modifica `tsure.io/description` (u otras anotaciones propias) sin tocar labels de uso.
- `(x)` **Eliminar namespace** — ejecuta la doble verificación (labels de uso + recursos reales); si está libre, pide escribir el nombre exacto antes de ejecutar `kubectl delete namespace <nombre>`.
- `(y)` **Mostrar/Ocultar sistema y `default`** — ocultos por defecto para evitar accidentes.
- `(u)` **Refrescar** · `(Q/Esc)` **Salir**.

---

## 6. Comandos `kubectl` clave del servicio (`src/services/namespaces.ts`)

```bash
# Listar namespaces con sus labels y estado
kubectl get namespaces -o json

# Crear namespace y marcarlo como gestionado por la herramienta
kubectl create namespace <nombre>
kubectl label namespace <nombre> tsure.io/managed=true --overwrite
kubectl annotate namespace <nombre> tsure.io/description="<texto>" --overwrite

# Comprobar recursos activos antes de permitir borrar
kubectl get pods,deployments,statefulsets,services,pvc -n <nombre> -o json
# (Opcional) Comprobar también Clusters CNPG si el CRD existe
kubectl get clusters.postgresql.cnpg.io -n <nombre> -o json

# Eliminar namespace (solo si 0 labels de uso y 0 recursos activos)
kubectl delete namespace <nombre> --wait=true
```

---

## 7. Checklist de pruebas de integración con `kpg`

1. Crear el namespace `mi-app-1` desde la nueva herramienta → aparece como **Libre**.
2. Abrir **`kpg`**, crear una BD en `mi-app-1` → `kpg` aplica `tsure.io/kpg=true`.
3. Volver al gestor de namespaces → `mi-app-1` ahora muestra **`kpg`** en uso y **bloquea su eliminación**.
4. En `kpg`, mover la BD a otro namespace (o eliminarla) → `kpg` retira automáticamente `tsure.io/kpg`.
5. Volver al gestor de namespaces → `mi-app-1` aparece nuevamente como **Libre** y ya permite eliminarlo de forma segura.

---

## 8. Prompt rápido para iniciar el nuevo repositorio

Cuando abras una carpeta nueva para este proyecto, puedes iniciar directamente con:

> *"Lee `/home/tsure/Escritorio/guia-gestor-namespaces.md` y crea la estructura inicial de la herramienta TUI de administración de namespaces compatible con el contrato `tsure.io/*` de `kpg`."*
