# herdr-jw

Mods y layout de [Herdr](https://herdr.dev) que llevan a Herdr el concepto de *workspace como factory* de jw
(`feat/repo-refs-prototype` y `feat/workspace-factory`): un workspace es una carpeta con varios repos, un agente
y worktrees. Sin la app de Android.

## Instalar

```sh
curl -fsSL https://raw.githubusercontent.com/brya0x/herdr-jw/main/install.sh | sh
```

Hace falta Herdr (abierto una vez), `curl`, `tar`, `rsync` y `python3`. El script baja el repo, copia mods, layout,
temas y el skill `herdr-tasks` a `~/.config/herdr-app`, y añade a `keys.json` los atajos de este repo (quita los `tab.*`;
si cambia algo deja una copia `keys.json.bak-<fecha>`). Con `| sh -s -- --no-keys` no toca `keys.json`.
`HERDR_JW_REF=<rama|tag>` elige la versión. Volver a correrlo actualiza.

Reinicia Herdr y activa el layout con `herdr-app do layout.switch '{"name":"jw"}'` (el script no lo cambia solo).

Desde un clon: `./sync.sh push` copia lo mismo sin tocar `keys.json` (mézclalo a mano desde `config/keys.json`).
Para guardar cambios hechos en la config viva: `./sync.sh pull`, y commit.

## Qué hay

| Pieza | Qué hace |
|---|---|
| `layouts/jw.json` | Clon de `main`: sin la sección de agentes, con `tabs-one`. |
| `mods/tabs-one` | Clon de `tabs` sin pestañas ni `+`: un solo tab por workspace. Deja el nombre, Files, Changes y los botones de ventana. |
| `mods/factory` | `cmd-shift-n`: pide un nombre, crea `~/ws/<nombre>/`, un space con `claude` y el panel de repos al lado. El panel añade repos de GitHub (`gh repo clone` a `.part`) o carpetas (enlazadas, sin copiar), en `<carpeta>/repos/<nombre>` (los worktrees van a `<carpeta>/worktrees/<repo>/<carpeta>`), muestra estado, rama y cambios, y las ramas con su PR (mergeado, CI fallido, con toast). El manifiesto es `<carpeta>/.factory.json`. El panel (`cmd-shift-v`) tiene cuatro pestañas. **Productividad**: la línea de la fábrica (todos los worktrees por etapa, y a la vez el filtro de la lista), veces que hablaste por PR, tiempo de ciclo (inicio → merge, inicio → PR, PR → merge), PRs por semana, tokens por modelo, agentes ahora y la lista de worktrees con su PR. **Gasto**: consumo, costo medio por PR, uso por modelo, tokens por semana y mayores consumos. **Detecciones**: fallos, no PRs. Los de los agentes (comandos que fallaron en los últimos 7 días y nadie arregló: `fails.py`) y los de la fábrica (el setup de un worktree que salió con error, que `worktree-wt` anota en `data/factory/setup-failures.log`; clones fallidos; `gh`; la lectura del uso). Un clic muestra el error y ofrece «Arreglar con un agente» (un claude en esa carpeta con el error como primer mensaje), «Ver worktree» y «Descartar» (`data/factory/dismissed.json`). **Repos**: añadir, quitar, crear worktrees. Todo sale de los transcripts de claude (`usage.py` de `factory-usage` y `flow.py`) y de `gh`; los cálculos puros están en `stats.js` (`node test_stats.mjs`). No hay evaluadores (scores): nada los mide todavía. |
| `mods/worktree-wt` | Clon del mod `worktree` con la creación de jw: lee `.jw.toml` (`root`, `setup`, `copy`, `open`), la carpeta es el último segmento de la rama, valida como jw, corre `setup` antes de abrir, tarea inicial para claude, y avisa de commits sin subir al quitar. Desde el panel de repos los checkouts van a `<workspace>/worktrees/<repo>/<carpeta>` (clonado o enlazado); desde los menús de Herdr, a `<repo>-wt/` según `.jw.toml`. Desde la terminal, `bun mods/worktree-wt/wt.js <rama> [--in <repo>] [--branch b] [--from ref] [--open shell\|claude] [--task texto]` hace lo mismo (como `jw worktree`), con la misma carpeta y el mismo `setup`. |
| `mods/factory-tasks` + `skill/herdr-tasks` | `cmd-shift-t`: lista de tareas del workspace (Markdown de jw, en `~/.config/herdr-app/data/tasks/`, una por carpeta) y su bucle: al terminar el turno el agente recibe la siguiente tarea lista (`hc send`), hasta 20 vueltas o hasta que todo esté hecho o una tarea quede bloqueada. El bucle y el contador `n/m` viven en `tabs-one` (que lleva su copia de `lib.js`, `sync.sh push` la mantiene); `sync.sh push` instala el skill en `~/.claude/skills/`. |
| `mods/factory-usage` | `cmd-shift-u`: costo y tokens por proyecto y por semana, de `~/.claude/projects` (mismas reglas de conteo que `usage.rs` de jw). |
| `mods/artifacts-jw` | `jw artifact` local: un agente publica un `.html` o `.md` con `bun ~/.config/herdr-app/mods/artifacts-jw/artifact.js publish <archivo> [--name --title --kind --wait]` (`ls`, `wait`, `rm` también; el workspace es el space de su terminal). Sale un aviso, y `cmd-shift-a` abre el panel: Abrir, Aprobar o Pedir cambios con una nota. `wait` (y `publish --wait`) vuelve al decidir: exit 0 aprobado, 4 cambios (la nota por stdout), 3 sin respuesta a tiempo. Una persona puede tardar más que el límite de 10 minutos de la herramienta Bash: córrelo con `run_in_background` o con `--timeout`. Guarda hasta 20 versiones en `data/artifacts/`. No hay visor embebido: Abrir usa la app del sistema. |
| `themes/` + `mods/themes-jw` | Una paleta por tema (`themes/<slug>.json`, con `mode` dark o light). `build.py` saca de ella el tema de Herdr y el de Claude Code (`~/.claude/themes/`); `use.py mode light\|dark\|system`, `set <slug>` y `apply` los cambian a la vez (estado en `data/jw-theme.json`: modo, tema claro y tema oscuro). `cmd-shift-k` abre el selector: Claro, Oscuro o Sistema, y qué tema oscuro y claro usar. En Sistema, Herdr sigue al sistema y `tabs-one` cambia el tema de Claude cuando Herdr cambia. Los claude ya abiertos no recargan el tema hasta `/theme`. `sync.sh push` instala las paletas y los scripts en `data/jw-themes/`. Hay los diez temas de jw (One, Catppuccin, Tokyo Night, Gruvbox y Solarized, cada uno oscuro y claro). |

## Tarifas

El costo muestra «sin tarifa» hasta que escribas `~/.config/herdr-app/data/factory-rates.json`
(USD por millón de tokens): `{"opus": {"input": …, "cache_read": …, "output": …}}`. No hay valores por defecto.

## Diferencias con jw

- `[[env]] file = ".env"` se trata como `copy` (jw actual lo ignora).
- No se copian `ports` ni el `.jw.toml` personal de `~/.config/jw/projects/`.
- Una rama nueva parte de `HEAD`, como en jw.
- Tras un `setup`, la tarea se pasa a claude como primer argumento (Herdr solo entrega `task` si `argv` es `claude`).
- Los menús de Herdr siguen creando worktrees en `~/.herdr/worktrees`; solo los botones del panel de repos usan `<workspace>/worktrees/<repo>/`.
- Sin `agents`, `cmd-alt-]` y `cmd-alt-[` pueden no seguir ninguna lista (sin probar).

## Pruebas

```sh
bun mods/worktree-wt/jwtoml.test.js    # lee tus .jw.toml reales de ~/ws/sales-assist
python3 -I mods/factory-usage/test_usage.py
```

`herdr-app check mods/<nombre>` solo dibuja el estado inicial: mira siempre `herdr-app shot`.
Sin probar con clics: el selector shell/claude y el campo de tarea del diálogo, los avisos de PR mergeado y CI fallido.
Claude pregunta «¿confías en esta carpeta?» en una carpeta nueva; si pasa en cada worktree, la tarea espera a que aceptes.
