# herdr-jw

**Un workspace es una fábrica: una carpeta con varios repos, un agente y sus worktrees.**

Mods y layout para [Herdr](https://herdr.dev) que llevan a Herdr el flujo de trabajo de jw
(`feat/repo-refs-prototype` y `feat/workspace-factory`) y lo atan a Claude Code: creas el workspace, le
añades repos, abres worktrees con su `setup`, dejas que el agente trabaje una lista de tareas, apruebas sus
resultados desde un panel y ves cuánto cuesta y cuánto tarda cada PR. Sin la app de Android.

```
~/ws/mi-producto/              un workspace = un space de Herdr con claude al lado
├── .factory.json              los repos del workspace
├── repos/
│   ├── api/                   clonado de GitHub (o enlazado a una carpeta tuya)
│   └── web/
└── worktrees/
    └── api/fix-login/         una rama, con su setup ya corrido
```

## Instalar

```sh
curl -fsSL https://raw.githubusercontent.com/brya0x/herdr-jw/main/install.sh | sh
```

Hace falta Herdr (abierto una vez), `curl`, `tar`, `rsync` y `python3`, en macOS. El script baja el repo y
copia mods, layout, temas y el skill `herdr-tasks` a `~/.config/herdr-app`. También añade a `keys.json` los
atajos de abajo y quita los `tab.*`; si cambia algo deja una copia `keys.json.bak-<fecha>`.

- `| sh -s -- --no-keys` no toca `keys.json`.
- `| sh -s -- --no-plugin` no instala el plugin `jw` de Claude Code (si hay `claude`, lo añade desde el marketplace de este repo; volver a correrlo lo actualiza).
- `HERDR_JW_REF=<rama|tag>` elige la versión. Volver a correrlo actualiza.
- Para actualizar sin salir de Herdr: `cmd-alt-u` abre un panel que corre esto mismo y muestra lo que imprime. Reinicia Herdr después para cargar los mods nuevos.
- Reinicia Herdr y activa el layout: `herdr-app do layout.switch '{"name":"jw"}'` (el script no lo cambia solo).

Desde un clon: `./sync.sh push` copia lo mismo sin tocar `keys.json`. Para guardar en el repo lo que cambiaste
en la config viva: `./sync.sh pull`, y commit.

## Qué trae

### Workspaces como fábrica (`mods/factory`)

`cmd-shift-n` pide un nombre, crea `~/ws/<nombre>/` y abre un space con `claude` y el panel de repos al lado.
El panel añade repos de GitHub (`gh repo clone`, sin dejar clones a medias) o carpetas (enlazadas, sin copiar),
y muestra de cada uno su estado, rama y cambios, y de cada rama su PR: mergeado o con el CI fallido, con aviso.

El panel (`cmd-shift-v`) tiene cuatro pestañas:

| Pestaña | Qué muestra |
|---|---|
| **Productividad** | La fábrica: todos los worktrees por etapa (y a la vez el filtro de la lista), veces que hablaste por PR, tiempo de ciclo (inicio → merge, inicio → PR, PR → merge), PRs por semana, tokens por modelo, agentes ahora y la lista de worktrees con su PR. |
| **Gasto** | Consumo, costo medio por PR, uso por modelo, tokens por semana y mayores consumos. |
| **Detecciones** | Fallos, no PRs. Los de los agentes (comandos que fallaron en los últimos 7 días y nadie arregló) y los de la fábrica (un `setup` que salió con error, clones fallidos, `gh`, la lectura del uso). Un clic muestra el error y ofrece «Arreglar con un agente» (un claude en esa carpeta con el error como primer mensaje), «Ver worktree» y «Descartar». |
| **Repos** | Añadir, quitar y crear worktrees. |

Todo sale de los transcripts de claude y de `gh`. No hay evaluadores (scores): nada los mide todavía.

### Worktrees como jw (`mods/worktree-wt`)

Lee el `.jw.toml` del repo (`root`, `setup`, `copy`, `open`), pone la carpeta en el último segmento de la rama,
valida como jw, corre `setup` antes de abrir, puede pasarle una tarea inicial a claude y avisa de commits sin
subir al quitar. Desde la terminal:

```sh
bun mods/worktree-wt/wt.js <rama> [--in <repo>] [--branch b] [--from ref] [--open shell|claude] [--task texto]
```

Los repos de un workspace van a `<workspace>/worktrees/<repo>/<carpeta>`; los demás, a `<repo>-wt/` según
`.jw.toml`.

### Tareas con bucle (`mods/factory-tasks` + `skill/herdr-tasks`)

`cmd-shift-t` abre la lista de tareas del workspace (Markdown de jw, una por carpeta). Al terminar el turno el
agente recibe la siguiente tarea lista, hasta 20 vueltas o hasta que todo esté hecho o una tarea quede
bloqueada. El contador `n/m` se ve en la barra. El skill `herdr-tasks` enseña al agente a escribir su plan ahí.

### Artifacts por aprobar (`mods/artifacts-jw`)

Un agente publica un `.html` o `.md` y se queda esperando tu decisión:

```sh
bun ~/.config/herdr-app/mods/artifacts-jw/artifact.js publish informe.html --wait
```

Sale un aviso y `cmd-shift-a` abre el panel: Abrir, Aprobar o Pedir cambios con una nota. `wait` vuelve con
exit 0 si aprobaste, 4 si pediste cambios (la nota por stdout) y 3 si pasó el tiempo. Una persona puede tardar
más que el límite de 10 minutos de la herramienta Bash: córrelo con `run_in_background` o con `--timeout`.
Guarda hasta 20 versiones en `data/artifacts/`. No hay visor embebido: Abrir usa la app del sistema.
También `ls`, `wait` y `rm`.

### Plugin `jw` (`plugins/jw`)

Skills de Claude Code, con el prefijo `jw:`:

- `jw:tasks`: llevar un plan hasta el final con `jw tasks`.
- `jw:role`: `/jw:role <rol>` pone a la sesión en un rol (`herdr-brain`, el orquestador que reparte el trabajo en worktrees; `herdr-researcher`, solo lectura con fuentes). Los roles son archivos `<nombre>.md` en tres capas, y gana la más cercana al proyecto: `.claude/roles/`, `~/.claude/roles/` y los del plugin. Los del plugin usan las herramientas de Herdr (`hc`, `wt.js`, `artifact.js`) y llevan el prefijo `herdr-` para que los `brain` y `researcher` de jw en `~/.claude/roles/` no los tapen.

```sh
claude plugin marketplace add brya0x/herdr-jw
claude plugin install jw@herdr-jw
```

`install.sh` ya hace esto; las sesiones abiertas lo cargan con `/reload-plugins`.

### Temas para Herdr y Claude Code (`themes/` + `mods/themes-jw`)

Diez temas (One, Catppuccin, Tokyo Night, Gruvbox y Solarized, cada uno oscuro y claro) con una sola paleta por
tema, de la que `build.py` saca el tema de Herdr y el de Claude Code (`~/.claude/themes/`). `cmd-shift-k` abre
el selector: **Claro**, **Oscuro** o **Sistema**, y qué tema oscuro y claro usar. En Sistema, Herdr sigue al
sistema y el tema de Claude cambia con él. Claude usa siempre un solo tema, `JW` (`~/.claude/themes/jw.json`), que se reescribe con la paleta elegida; Claude Code repinta solo las sesiones abiertas cuando ese archivo cambia, trabajen o no. Una sesión que aún no usa `JW` se pasa a él una vez con `/theme` (teclas por `hc`, también si está trabajando) Se dejan quietas las que tienen texto escrito. Una sesión que se abrió antes de que existiera `~/.claude/themes/` no lista `JW` en su `/theme`: no se puede mover sola, y hay que reiniciarla a mano con `claude --resume`.
Desde la terminal: `use.py mode light|dark|system`, `set <slug>` y `apply`.

### Navegación y layout

- `layouts/jw.json`: clon de `main` sin la sección de agentes, con `tabs-one`.
- `mods/tabs-one`: sin pestañas ni `+`, un solo tab por workspace; deja el nombre, Files, Changes y los botones de ventana.
- `mods/spaces-one`: los worktrees cuelgan de su repo (o del workspace que lista ese repo), y `cmd-]` / `cmd-[` recorren los spaces en el orden del sidebar.
- `mods/picker-one`: selector de tabs y spaces (`cmd-p`).
- `mods/factory-usage`: costo y tokens por proyecto y por semana, de `~/.claude/projects` (mismas reglas de conteo que `usage.rs` de jw).

## Atajos

| Atajo | Hace |
|---|---|
| `cmd-]` / `cmd-[` | Space siguiente / anterior, en el orden del sidebar |
| `cmd-alt-]` / `cmd-alt-[` | Agente siguiente / anterior |
| `cmd-shift-n` | Workspace nuevo (factory) |
| `cmd-shift-v` | Panel de repos, productividad, gasto y detecciones |
| `cmd-shift-t` | Tareas del workspace |
| `cmd-shift-u` | Costo y tokens por proyecto |
| `cmd-shift-a` | Artifacts por aprobar |
| `cmd-shift-k` | Selector de tema |
| `cmd-alt-u` | Actualizar herdr-jw (corre el `install.sh` publicado, sin tocar `keys.json`) |
| `cmd-p` | Selector de tabs y spaces |

Todos salen de `config/keys.json`.

## Tarifas

El costo muestra «sin tarifa» hasta que escribas `~/.config/herdr-app/data/factory-rates.json`
(USD por millón de tokens): `{"opus": {"input": …, "cache_read": …, "output": …}}`. No hay valores por defecto.

## Diferencias con jw

- `[[env]] file = ".env"` se trata como `copy` (jw actual lo ignora).
- No se copian `ports` ni el `.jw.toml` personal de `~/.config/jw/projects/`.
- Una rama nueva parte de `HEAD`, como en jw.
- Tras un `setup`, la tarea se pasa a claude como primer argumento (Herdr solo entrega `task` si `argv` es `claude`).
- Sin `agents`, `cmd-alt-]` y `cmd-alt-[` pueden no seguir ninguna lista (sin probar).

## Pruebas

```sh
bun mods/worktree-wt/jwtoml.test.js     # lee .jw.toml reales de un repo tuyo: la ruta está al inicio del test
bun mods/artifacts-jw/artifact.test.js
bun mods/factory-tasks/lib.test.js
node mods/factory/test_stats.mjs
python3 mods/factory/test_fails.py
python3 mods/factory/test_flow.py
python3 -I mods/factory-usage/test_usage.py
```

`herdr-app check mods/<nombre>` solo dibuja el estado inicial: mira siempre `herdr-app shot`.
Sin probar con clics: el selector shell/claude y el campo de tarea del diálogo, los botones del panel de
artifacts, los avisos de PR mergeado y CI fallido.
Claude pregunta «¿confías en esta carpeta?» en una carpeta nueva; si pasa en cada worktree, la tarea espera a que aceptes.
