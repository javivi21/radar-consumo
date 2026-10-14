# Radar de consumo para Claude Code

Franja encima del cuadro de escritura con el consumo de tu plan en vivo:
- contexto restante,
- sesion de 5 h (con hora de reinicio),
- semana,
- cache estimada (60 min desde la ultima respuesta),
- grafica de consumo de los ultimos 30 min con ritmo y estimacion de limite.

Colores: verde <60 %, amarillo 60-84 %, rojo >=85 %. Refresco cada 30 s.

## Instalar (Windows)
1. Descarga o clona este repositorio.
2. Ejecuta:
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File instalar.ps1
   ```
   (copia el mod a `~\.claude\skills\radar-consumo`).
3. Abre una sesion nueva de Claude Code. Comprueba con `claude plugin list`.

## Ajustes
En `hooks/register.tsx`: `CADA_MS` (refresco) y `CACHE_MIN` (duracion de cache).

## Notas
- Las cifras de sesion y semana las da Claude Code; la cache es una estimacion.
- Es un mod local: no envia nada fuera de tu ordenador.
