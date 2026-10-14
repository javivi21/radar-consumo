# Radar de consumo para Claude Code

Franja encima del cuadro de escritura con el consumo de tu plan en vivo, con barras metálicas biseladas (◖▀▀▀◗) y punta brillante:
- contexto restante,
- sesión de 5 h (con hora de reinicio),
- semana,
- caché estimada (60 min desde la última respuesta),
- gráfica de consumo de los últimos 30 min con ritmo y estimación de límite.

Colores por nivel (barras, cifras, gráfica y caché): acero <60 %, champán 60-79 %, amarillo vivo ≥80 %, rojo intenso ≥90 %. Refresco cada 30 s.

## Instalar (Windows)
1. Descarga o clona este repositorio.
2. Ejecuta:
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File instalar.ps1
   ```
   (copia el mod a `~\.claude\skills\radar-consumo`).
3. Abre una sesión nueva de Claude Code. Comprueba con `claude plugin list`.

## Ajustes
En `hooks/register.tsx`: `CADA_MS` (refresco) y `CACHE_MIN` (duración de caché).

## Notas
- Las cifras de sesión y semana las da Claude Code; la caché es una estimación.
- Es un mod local: no envía nada fuera de tu ordenador.
