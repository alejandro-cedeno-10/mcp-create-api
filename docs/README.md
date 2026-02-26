# Apiary MCP Server

Servidor Model Context Protocol (MCP) que expone el CLI de Apiary y la API REST como herramientas nativas para agentes compatibles (p. ej. Cursor). Integra cache local con TTL de 24 horas y fallback offline para mantener la productividad cuando Apiary no está disponible. El servidor ofrece dos herramientas:

## Requisitos

- Node.js 20+
- Apiary CLI disponible (incluido en la imagen Docker final) para `fetch`
- API REST de Apiary para `list` 
- Clave de Apiary (`APIARY_API_KEY`)

## Configuración local para desarrollo

```bash
cp .env.example .env
edit .env # Añade tu APIARY_API_KEY y valores opcionales

npm install
npm run build
npm start
```
## Tests

```bash
npm test
```