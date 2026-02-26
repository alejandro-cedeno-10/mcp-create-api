# Apiary MCP Server — Vision & Brainstorm
## *Del "buscar documentación" al "preguntarle al IDE"*
Prompt Chaining Agentivo - PCA
---

## 🎯 El Problema que Resuelve

```
HOY — Sin MCP Server
─────────────────────────────────────────────────────────────────────

Dev quiere integrar apimicroserviciofeco:

  1. Abre Confluence / Apiary en el browser        ← 3 min buscando
  2. Busca el endpoint correcto                    ← 5 min leyendo
  3. Copia el payload de ejemplo                   ← 2 min
  4. Adapta a su lenguaje (TypeScript, Python...)  ← 20 min escribiendo
  5. Escribe los tests                             ← 30 min más
  6. Descubre que el campo es requerido            ← vuelve al paso 2
  7. Pregunta al tech lead                         ← bloquea a otro dev
                                                  ─────────────────────
                                                  Total: ~1-2 horas
```

```
MAÑANA — Con MCP Server + IDE LLM
─────────────────────────────────────────────────────────────────────

Dev en Cursor / OpenCode escribe:

  "Genera integración TypeScript para apimicroserviciofeco
   que autentique y cree una factura con líneas de detalle"
                                                  ─────────────────────
                                                  Total: ~2 minutos
                                                  (código + tests listos)
```

---

## 🏗️ Arquitectura Actual — Qué Tenemos Hoy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         IDE CON LLM                                      │
│                   (Cursor / OpenCode / Claude Desktop)                   │
│                                                                           │
│   Dev habla en lenguaje natural:                                         │
│   "¿Qué APIs tenemos?" / "Dame el resumen de X" / "Genera integración"  │
│                                                                           │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  LLM del IDE (Claude / GPT / lo que tengas configurado)         │   │
│   │  • Entiende la intención del dev                                │   │
│   │  • Decide qué tool MCP invocar                                  │   │
│   │  • Recibe los resultados y los explica                          │   │
│   └──────────────────────────┬──────────────────────────────────────┘   │
│                              │ MCP Protocol (stdio)                      │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    APIARY MCP SERVER (Docker)                            │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  list_apiary_    │  │  get_apiary_     │  │  generate_api_       │  │
│  │  apis()          │  │  blueprint_      │  │  integration()       │  │
│  │                  │  │  summary()       │  │                      │  │
│  │  → Lista todos   │  │                  │  │  → Workflow 3 pasos: │  │
│  │    los APIs de   │  │  → Resumen       │  │                      │  │
│  │    la cuenta     │  │    optimizado    │  │  1. Carga blueprint  │  │
│  │    Apiary        │  │    (~90% menos   │  │  2. ← sampling →     │  │
│  │                  │  │    tokens)       │  │     LLM genera code  │  │
│  │                  │  │                  │  │  3. ← sampling →     │  │
│  └──────────────────┘  └──────────────────┘  │     LLM genera tests │  │
│                                               └──────────────────────┘  │
│                                                          │               │
│  ┌─────────────────────────────────────┐                │ sampling/     │
│  │  Cache Local (Docker Volume)        │                │ createMessage │
│  │  TTL: 24h — sin llamadas repetidas  │                │               │
│  └─────────────────────────────────────┘                ▼               │
│                                               ┌──────────────────────┐  │
│  ┌─────────────────────────────────────┐      │  LLM del IDE         │  │
│  │  Apiary REST API                    │      │  (hereda el modelo   │  │
│  │  https://api.apiary.io              │      │   sin API key extra) │  │
│  └─────────────────────────────────────┘      └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tecnología usada (resumen)

| Qué | Cómo |
|-----|------|
| Protocolo de comunicación | MCP (Model Context Protocol) — estándar de Anthropic |
| Transporte | stdio (el IDE levanta Docker como subproceso) |
| Generación de código | MCP Sampling — el IDE presta su LLM, sin API key extra |
| Cache de blueprints | Docker Volume persistente (24h TTL) |
| Blueprints | Apiary CLI + REST API |
| Runtime | Node.js 20 + TypeScript |

---

## 🧠 Patrón de Uso — Cómo lo Usa el Dev

```
┌────────────────────────────────────────────────────────────────────┐
│  FLUJO NATURAL DE UN DEV EN UNA SESIÓN                             │
│                                                                     │
│  1. EXPLORAR                                                        │
│     "¿Qué APIs tenemos?"                                           │
│      → list_apiary_apis()                                          │
│      → "Tenemos: apisagaorchestrator, apimicroserviciofeco, ..."   │
│                                                                     │
│  2. ENTENDER (rápido, barato)                                      │
│     "¿Qué hace apimicroserviciofeco? ¿Qué endpoints tiene?"       │
│      → get_apiary_blueprint_summary()                              │
│      → Resumen con endpoints + modelos (~2k tokens)                │
│                                                                     │
│  3. PROFUNDIZAR (cuando necesitas el detalle)                      │
│     "Dame la especificación completa del endpoint de facturas"     │
│      → get_apiary_blueprint()                                      │
│      → Spec completa (hasta 50k tokens)                            │
│                                                                     │
│  4. GENERAR (el valor diferencial)                                 │
│     "Genera TypeScript para crear facturas con líneas de detalle,  │
│      con tests Jest"                                               │
│      → generate_api_integration()                                  │
│      → Código listo + tests completos                              │
│                                                                     │
│  Todo sin salir del IDE. Todo en lenguaje natural.                 │
└────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Brainstorm — Skills Futuros

> *¿Qué más podría hacer este servidor para acelerar el trabajo dev?*

### Tier 1 — Alta Prioridad / Fácil de Implementar

```
┌─────────────────────────────────────────────────────────────────┐
│  SKILL: generate_api_mock                                        │
│                                                                  │
│  "Genera un mock server de apimicroserviciofeco en TypeScript"  │
│                                                                  │
│  → Lee el blueprint                                             │
│  → Genera servidor Express/Fastify con endpoints mockeados      │
│  → Útil para: desarrollo sin backend real, demos, tests E2E     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SKILL: validate_payload                                         │
│                                                                  │
│  "¿Este JSON es válido para POST /invoices de apisagaorchest?"  │
│                                                                  │
│  → Lee el blueprint                                             │
│  → Valida el payload contra el schema                           │
│  → Muestra qué campos faltan o son incorrectos                  │
│  → Útil para: debugging de integraciones                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SKILL: generate_postman_collection                              │
│                                                                  │
│  "Crea una colección Postman/Bruno para apinotifications"        │
│                                                                  │
│  → Lee el blueprint                                             │
│  → Genera collection.json con todos los endpoints               │
│  → Incluye ejemplos de request/response                         │
│  → Útil para: QA, demos, onboarding                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SKILL: diff_blueprints                                          │
│                                                                  │
│  "¿Qué cambió en apimicroserviciofeco en los últimos 7 días?"   │
│                                                                  │
│  → Compara versión cacheada vs versión actual                   │
│  → Lista: endpoints nuevos, eliminados, campos modificados      │
│  → Útil para: detección de breaking changes                     │
└─────────────────────────────────────────────────────────────────┘
```

### Tier 2 — Impacto Alto / Complejidad Media

```
┌─────────────────────────────────────────────────────────────────┐
│  SKILL: generate_sdk                                             │
│                                                                  │
│  "Genera un SDK TypeScript completo para apisagaorchestrator"   │
│                                                                  │
│  → Lee todos los endpoints y modelos                            │
│  → Genera: tipos, cliente HTTP, funciones tipadas               │
│  → Estructura de paquete npm lista para publicar                │
│  → Útil para: equipos que consumen el API internamente          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SKILL: generate_e2e_tests                                       │
│                                                                  │
│  "Genera tests E2E con Playwright para el flujo de facturación" │
│                                                                  │
│  → Entiende el flujo completo (auth → crear → verificar)        │
│  → Genera tests Playwright/Cypress que usan la API real         │
│  → Útil para: CI/CD, regresión                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SKILL: explain_error                                            │
│                                                                  │
│  "Me da 422 en POST /invoices con este payload: {...}"          │
│                                                                  │
│  → Lee el blueprint del endpoint                                │
│  → Analiza el payload vs el schema                              │
│  → Explica exactamente qué está mal y cómo corregirlo           │
│  → Útil para: debugging rápido de integraciones                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SKILL: generate_migration_guide                                 │
│                                                                  │
│  "El API cambió, ¿cómo migro mi código existente?"              │
│                                                                  │
│  → Recibe: código existente + blueprint nuevo                   │
│  → Identifica: qué rompe, qué cambió, qué es nuevo             │
│  → Genera: guía de migración + diff del código                  │
│  → Útil para: actualizaciones de versiones de API               │
└─────────────────────────────────────────────────────────────────┘
```

### Tier 3 — Visión Futura / Alta Complejidad

```
┌─────────────────────────────────────────────────────────────────┐
│  SKILL: api_architect_advisor                                    │
│                                                                  │
│  "¿Cómo debo integrar 3 APIs para el flujo de checkout?"        │
│                                                                  │
│  → Analiza múltiples blueprints                                 │
│  → Propone: arquitectura, orden de llamadas, manejo de errores  │
│  → Genera: diagrama de secuencia + código de orquestación       │
│  → Patrón: Orchestrator-Workers (un LLM orquesta varios)       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SKILL: contract_testing                                         │
│                                                                  │
│  "¿Mi código sigue siendo compatible con el API actual?"        │
│                                                                  │
│  → Analiza el código del dev + blueprint actual                 │
│  → Detecta: tipos incorrectos, endpoints obsoletos, campos      │
│    faltantes o renombrados                                       │
│  → Reporte de compatibilidad con fixes sugeridos                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  SKILL: onboarding_guide                                         │
│                                                                  │
│  "Soy nuevo en el equipo, ¿cómo funciona la arquitectura        │
│   de microservicios?"                                            │
│                                                                  │
│  → Lee blueprints de todos los APIs                             │
│  → Genera: mapa de dependencias, guía de onboarding,           │
│    casos de uso principales                                      │
│  → Patrón: Evaluator-Optimizer (múltiples passes)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🌐 Visión — El Ecosistema de IDEs con LLM

```
                        API DOCS (Apiary)
                              │
                              │ MCP Server
                              │ (este proyecto)
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────────┐
        │  Cursor  │   │OpenCode  │   │Claude Desktop│
        │  Claude  │   │  GPT-4o  │   │    Claude    │
        └────┬─────┘   └────┬─────┘   └──────┬───────┘
             │              │                 │
             │  Mismas tools│                 │
             │  Mismo server│                 │
             │  Diferente   │                 │
             │  LLM hereda  │                 │
             └──────────────┴─────────────────┘
                            │
                   Dev trabaja en su IDE preferido
                   con su LLM preferido
                   sin cambiar nada en el servidor
```

### El servidor es agnóstico del IDE

```
┌────────────────────────────────────────────────────────────┐
│  Lo que el dev puede hacer desde CUALQUIER IDE con MCP     │
│                                                            │
│  Cursor + Claude    → "genera TypeScript para API X"      │
│  OpenCode + GPT4o   → "genera Python para API X"          │
│  Claude Desktop     → "explícame qué endpoints tiene X"   │
│  Zed + LLM          → "genera tests para mi código"       │
│                                                            │
│  → Mismo servidor, mismo resultado, LLM diferente         │
│  → El sampling hereda el modelo del IDE automáticamente   │
└────────────────────────────────────────────────────────────┘
```

---

## 📈 Impacto en el Equipo Dev

```
┌────────────────────────────────────────────────────────────────────┐
│  ANTES                          DESPUÉS                            │
│  ──────────────────────────     ──────────────────────────────     │
│  Leer docs: 20-40 min           Resumen instantáneo                │
│  Escribir código: 1-2h          Código generado: 2 min             │
│  Escribir tests: 30-60 min      Tests generados: incluidos         │
│  Preguntar al tech lead: horas  Respuesta inmediata en el IDE      │
│  Buscar el endpoint correcto    "¿Qué endpoints tiene X API?"      │
│  Debugging de 422/400: horas    explain_error (futuro)             │
│  Onboarding nuevos devs: días   onboarding_guide (futuro)          │
└────────────────────────────────────────────────────────────────────┘
```

---

## 🔌 Cómo Extender — Para el Equipo

### Agregar un skill nuevo es simple

```
1. Definir el tool en src/tools/definitions.ts
   → Nombre, descripción bilingüe, parámetros

2. Agregar el schema Zod en src/tools/schemas.ts
   → Validación de inputs

3. Crear el handler en src/handlers/miSkillHandler.ts
   → Lógica: puede ser simple (no LLM) o con sampling

4. Registrar en src/handlers/index.ts y src/tools.ts
   → Export + routing

5. npm run build && docker build
   → Listo para usar en cualquier IDE
```

### Plantilla de skill con sampling (generación de texto)

```typescript
// src/handlers/miSkillHandler.ts
export async function handleMiSkill(
  rawArguments: unknown,
  server: Server          // ← el IDE presta su LLM aquí
): Promise<CallToolResult> {
  const { apiName, miParametro } = validate(rawArguments);

  // 1. Cargar contexto (sin LLM)
  const context = await cargarLoqueSea(apiName);

  // 2. Generar texto (LLM del IDE vía sampling)
  const resultado = await requestCompletion(server, [{
    role: "user",
    content: `Haz algo útil con ${context}...`
  }], {
    temperature: 0,
    includeContext: "thisServer",   // hereda contexto del chat
    intelligencePriority: 0.8,
  });

  return createSuccessResult(resultado);
}
```

---

## 🗺️ Roadmap Sugerido

```
FASE 1 — YA ESTÁ (hoy)
  ✅ list_apiary_apis
  ✅ get_apiary_blueprint_summary
  ✅ get_apiary_blueprint
  ✅ generate_api_integration (código + tests, cualquier lenguaje)

FASE 2 — Próximas semanas
  🔲 validate_payload        → debug de errores 4xx
  🔲 generate_postman_collection → colecciones para QA
  🔲 diff_blueprints         → detección de breaking changes

FASE 3 — Próximo mes
  🔲 generate_api_mock       → servidor de mocks local
  🔲 generate_sdk            → SDK publicable en npm
  🔲 explain_error           → diagnóstico de errores de API

FASE 4 — Visión
  🔲 api_architect_advisor   → arquitectura multi-API
  🔲 contract_testing        → compatibilidad código vs contrato
  🔲 onboarding_guide        → mapa del ecosistema de microservicios
```

---

## 💡 Principios de Diseño

```
1. El dev nunca sale del IDE
   → Todas las interacciones son lenguaje natural dentro de Cursor/OpenCode

2. El LLM se hereda, no se duplica
   → MCP Sampling: el servidor usa el modelo del IDE, sin API key extra

3. Simple primero, complejo después
   → Tools simples (list, get) dan valor inmediato
   → Tools complejas (generate, validate) añaden magia

4. Agnóstico de IDE y LLM
   → Mismo servidor funciona en Cursor, OpenCode, Claude Desktop, Zed

5. Cache primero
   → Los blueprints se cachean 24h para respuestas instantáneas
   → El dev puede forzar refresh cuando necesita la versión fresca

6. Bilingüe por defecto
   → Todas las descriptions en inglés + español
   → El LLM entiende la intención en cualquier idioma
```

---

*Este documento es un punto de partida para el brainstorming. Cada skill futuro puede implementarse de forma independiente y añadir valor inmediato al equipo.*
